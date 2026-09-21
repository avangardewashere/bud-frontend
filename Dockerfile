# Bud's shell, as a container.
#
# Multi-stage, because the build needs the whole toolchain and the runtime needs
# almost none of it: node_modules with dev dependencies is hundreds of megabytes,
# and none of it is required to serve a built Next app.
#
# This leans on `output: "standalone"` in next.config.ts, which traces exactly the
# files the server actually imports and copies them into .next/standalone — so the
# runtime image carries that rather than the whole dependency tree.

# ---- deps -------------------------------------------------------------------
# Separate from the build so that a source-only change reuses the cached install.
# package.json and the lockfile change far less often than src/ does.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so they
# are build arguments rather than runtime environment. An image built for one
# environment cannot be re-pointed at another by changing env vars — build a new
# image instead. Everything server-side stays runtime configuration.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3102
ARG NEXT_PUBLIC_COURSES_ORIGIN=http://127.0.0.1:3101
ARG NEXT_PUBLIC_APP_ORIGIN=http://localhost:3100
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_COURSES_ORIGIN=$NEXT_PUBLIC_COURSES_ORIGIN \
    NEXT_PUBLIC_APP_ORIGIN=$NEXT_PUBLIC_APP_ORIGIN \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3100 \
    HOSTNAME=0.0.0.0

# node:alpine already ships a non-root `node` user. Running as root inside a
# container is a habit worth not forming.
USER node

# public/ holds bridge.js, which is served to the courses origin and injected into
# every course page — the app is not functional without it.
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

EXPOSE 3100

# The standalone output ships its own minimal server; `next start` is not used and
# next itself is not installed in this stage.
CMD ["node", "server.js"]
