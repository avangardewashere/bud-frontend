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

# All three origins are fixed at build time, so they are build arguments rather
# than runtime environment: NEXT_PUBLIC_* values are inlined into the client bundle,
# and BUD_API_ORIGIN is compiled into the /api rewrite. An image built for one
# environment cannot be re-pointed at another by changing env vars — build a new
# image instead. The build fails if any of them is blank or is not a bare origin.
#
# BUD_API_ORIGIN is also where server components call the API at runtime; it is
# carried into the runtime stage below so the two can never disagree.
ARG NEXT_PUBLIC_COURSES_ORIGIN=http://127.0.0.1:3101
ARG NEXT_PUBLIC_APP_ORIGIN=http://localhost:3100
ARG BUD_API_ORIGIN=http://localhost:3102
ENV NEXT_PUBLIC_COURSES_ORIGIN=$NEXT_PUBLIC_COURSES_ORIGIN \
    NEXT_PUBLIC_APP_ORIGIN=$NEXT_PUBLIC_APP_ORIGIN \
    BUD_API_ORIGIN=$BUD_API_ORIGIN \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ARG BUD_API_ORIGIN=http://localhost:3102
ENV BUD_API_ORIGIN=$BUD_API_ORIGIN \
    NODE_ENV=production \
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
