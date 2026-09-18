# Docker: 10-Session Course

**Target level:** Beginner → Intermediate
**Format:** 10 self-paced sessions, ~3 hours each (~30 hours total)
**Audience:** Frontend developer (React / Next.js) moving toward full-stack and DevOps capability
**End goal:** Containerize a real app, run a multi-service stack locally, build and push images from CI, and deploy to a live server.

---

## How the course is structured

Each session follows the same shape:

| Block | Time | What happens |
|---|---|---|
| Theory | ~45 min | Concepts, mental models, docs reading |
| Hands-on | ~90 min | Typing commands, breaking things, fixing them |
| Deliverable | ~45 min | Commit something real + write it up in `notes.md` |

**Session weight:** Sessions 1, 2, and 8 are lighter (theory-heavy). Sessions 4, 5, 7, 9, and 10 are heavy hands-on.

**Running capstone:** One app carried through all 10 sessions. A Next.js frontend + API + MongoDB/Postgres is ideal — an existing project like SideQuest works, or spin up a throwaway. By Session 10 it's deployed and containerized end to end.

**Prerequisites:** Comfortable with the terminal, Git, npm, and how a Node app starts. No Linux sysadmin or backend experience assumed.

---

## Session 1 — The container mental model

**Theory**
- What problem containers actually solve ("works on my machine", dependency drift, environment parity)
- Containers vs virtual machines — shared kernel, process isolation, why containers start in milliseconds
- The three nouns: **image** (blueprint) → **container** (running instance) → **registry** (where images live)
- Docker Engine architecture: CLI → daemon → containerd → runc

**Hands-on**
- Install Docker Desktop; verify with `docker version` and `docker info`
- `docker run hello-world`, then `docker run -d -p 8080:80 nginx`
- Poke at it: `docker ps`, `docker logs`, `docker exec -it <id> sh`, `docker stop`, `docker rm`
- Shell into the nginx container and look around the filesystem — this is the moment it clicks

**Deliverable:** `notes.md` with your own one-paragraph explanation of image vs container, plus a screenshot of nginx served from a container.

**Watch out for:** Confusing `docker stop` (pause the process) with `docker rm` (delete the container). Also the `-p host:container` order — you will get this backwards at least once.

---

## Session 2 — Images, layers, and the CLI you'll actually use

**Theory**
- Layers and the union filesystem — why every instruction adds a layer, and why layer order matters
- Tags are mutable pointers, digests are immutable — why `latest` is a trap
- Docker Hub, GHCR, and other registries; official vs verified vs random images
- Where disk space goes: images, containers, volumes, build cache

**Hands-on**
- `docker pull`, `docker images`, `docker tag`, `docker history <image>` — read the layers of a real image
- `docker inspect` and how to pull one field out of the JSON
- Cleanup: `docker system df`, `docker image prune`, `docker system prune -a` (and understanding what you just deleted)
- Compare `node:22` vs `node:22-alpine` vs `node:22-slim` sizes

**Deliverable:** A personal `docker-cheatsheet.md` — every command you'll reuse, written in your own words, not copied.

**Watch out for:** Running `system prune -a` casually. It will nuke your build cache and your next build will take five minutes.

---

## Session 3 — Your first Dockerfile

**Theory**
- The core instructions: `FROM`, `WORKDIR`, `COPY`, `RUN`, `ENV`, `EXPOSE`, `CMD`, `ENTRYPOINT`
- `CMD` vs `ENTRYPOINT` — the distinction that confuses everyone; when to use each
- Build context: what actually gets sent to the daemon, and why `.dockerignore` matters
- Layer caching — the rule that shapes every Dockerfile you'll write: **copy `package.json`, install, then copy source**

**Hands-on**
- Containerize a minimal Node/Express API from scratch
- Build it wrong first (`COPY . .` before `npm install`), then fix it and watch the rebuild time drop
- Add a `.dockerignore` (`node_modules`, `.git`, `.env`, `.next`) and re-measure the build context size
- `docker build -t myapi:v1 .` → run it → hit the endpoint

**Deliverable:** A committed Dockerfile for a working API, plus a note explaining why the `package.json` copy comes first.

**Watch out for:** Copying local `node_modules` into the image. Native binaries built on macOS won't run in a Linux container.

---

## Session 4 — Containerizing React and Next.js

**Theory**
- Why frontend containers split in two directions: a **dev** container (hot reload, source mounted) vs a **prod** container (static build, no dev deps)
- Vite/CRA: build to `dist/` → serve with nginx
- Next.js: `output: "standalone"`, why the server needs to keep running, and what `.next/static` needs
- Build-time vs runtime environment variables — `NEXT_PUBLIC_*` is baked in at build, which surprises people in production

**Hands-on**
- Dockerfile A: dev container with bind-mounted source and working hot reload
- Dockerfile B: production container serving the built app
- Fix the classic bind-mount problem: host `node_modules` shadowing the container's (anonymous volume trick)
- Add a custom `nginx.conf` for SPA routing so deep links don't 404

**Deliverable:** Your capstone frontend running in both a dev container and a prod container, documented in `notes.md`.

**Watch out for:** File-watching not firing on some setups — you may need `CHOKIDAR_USEPOLLING` or `WATCHPACK_POLLING`.

---

## Session 5 — Multi-stage builds and image optimization

**Theory**
- Multi-stage builds: build in a fat image, ship only the artifacts in a thin one
- Base image choices: `alpine` vs `slim` vs `distroless` — size vs debuggability vs glibc issues
- BuildKit: cache mounts (`--mount=type=cache`), parallel stages, `--platform` for arm64 vs amd64
- Running as a non-root user, and why that's non-negotiable for anything public

**Hands-on**
- Refactor Session 4's production Dockerfile into a multi-stage build
- Measure: record image size before and after, target an 80%+ reduction
- Add `USER node`; hit the permission errors; fix them properly
- Build for a different architecture and understand why your M-series Mac image fails on a cloud VM

**Deliverable:** A before/after size table in `notes.md` and a production image under your stated size budget.

**Watch out for:** Alpine + native modules (`sharp`, `bcrypt`, `canvas`). If a build fails mysteriously, `slim` is often the right call.

---

## Session 6 — Data: volumes, bind mounts, and persistence

**Theory**
- Containers are ephemeral — what disappears when a container dies, and what doesn't
- Named volumes vs bind mounts vs tmpfs: which to use for what
- Where Docker actually stores volume data on the host
- Database containers: fine for local dev, and the tradeoffs of running them in production

**Hands-on**
- Run Postgres or MongoDB in a container with a named volume; write data, destroy the container, prove the data survived
- Bind-mount your source for dev; understand the permission mismatch between host and container users
- Back up and restore a volume with a throwaway container
- Seed the database on first run with an init script

**Deliverable:** A documented database container with a persistence proof (data survives `docker rm`) written up in `notes.md`.

**Watch out for:** Anonymous volumes accumulating silently. `docker volume ls` after a week of work is usually a surprise.

---

## Session 7 — Networking and Docker Compose

**Theory**
- Docker networks: bridge, host, none — and why the default bridge is not what you want
- Service discovery by DNS: containers on a user-defined network reach each other by service name, not IP
- Port publishing vs internal ports — what actually needs to be exposed to the host
- Compose file anatomy: `services`, `volumes`, `networks`, `depends_on`, `healthcheck`, `restart`

**Hands-on**
- Wire up a three-service stack by hand with `docker network create` first — feel the pain
- Then replace all of it with a single `compose.yaml`
- Frontend → API → database, all reachable by service name (`http://api:3000`, not `localhost:3000`)
- Add healthchecks and `depends_on: condition: service_healthy` so the API waits for the DB to be ready
- `docker compose up -d`, `logs -f`, `exec`, `down -v`

**Deliverable:** Your whole capstone stack starting with one `docker compose up`. This is the single most useful thing in the course.

**Watch out for:** `localhost` inside a container means *that container*, not the host or a sibling. This is the #1 Compose bug.

---

## Session 8 — Configuration, environments, and secrets

**Theory**
- Config precedence: Dockerfile `ENV` → `env_file` → Compose `environment` → shell
- Build args (`ARG`) vs runtime env (`ENV`) — and the Next.js gotcha where public vars are frozen at build time
- Why secrets in an image are permanently visible — anyone with the image can read the layer
- Compose overrides: a base file plus `compose.override.yaml` for dev and `compose.prod.yaml` for prod

**Hands-on**
- Split your Compose setup into base + dev override + prod override
- Move all config to `.env` files; commit a `.env.example` and gitignore the real one
- Prove the secret leak: bake a fake secret into an image, then find it with `docker history`
- Use Compose secrets (or mounted files) as the safer pattern

**Deliverable:** A dev/prod configuration split, plus a short `notes.md` section on where secrets should live at each stage.

**Watch out for:** Rebuilding after changing a `NEXT_PUBLIC_` var — a restart alone won't pick it up.

---

## Session 9 — Docker in CI/CD with GitHub Actions

**Theory**
- Where containers fit in a pipeline: build once, tag by commit SHA, promote the same artifact through environments
- Tagging strategy: `sha-abc1234`, semver, and a moving `latest` — why the SHA tag is the one that matters
- GHCR: authentication, permissions, and public vs private packages
- Service containers in Actions for integration tests against a real database

**Hands-on**
- Add a workflow using `docker/setup-buildx-action` and `docker/build-push-action`
- Enable GitHub Actions layer caching and measure the build time difference across runs
- Push to `ghcr.io/<you>/<app>` on merge to main
- Run your test suite inside the container, against a Postgres service container
- Add a build-time image scan (Trivy) and fail the job on high-severity CVEs

**Deliverable:** A green workflow that builds, tests, scans, and pushes a tagged image on every merge — with the package visible on your GitHub profile.

**Watch out for:** Missing `permissions: packages: write` in the workflow. The push will fail with a confusing 403.

---

## Session 10 — Running containers in production

**Theory**
- Restart policies (`unless-stopped` vs `always`), resource limits, and what happens when a container OOMs
- Logging: stdout/stderr as the contract, log drivers, and why you don't write logs to a file inside a container
- Reverse proxy + TLS: Caddy or Traefik in front of your services, automatic certificates
- Hardening checklist: non-root user, pinned digests, read-only filesystem, dropped capabilities, minimal base
- Where this leads: Compose on a single VPS is the right answer for a long time; Kubernetes/ECS is what you graduate to and why

**Hands-on**
- Deploy the capstone stack to a real VPS (Hetzner, DigitalOcean, or similar — a $5 box is enough)
- Put Caddy in front with a real domain and automatic HTTPS
- Add resource limits and healthchecks; kill a container and watch it come back
- Wire a deploy step onto the Session 9 pipeline: merge → build → push → pull and restart on the server

**Deliverable:** A live URL serving your containerized app, plus a `README.md` on the repo documenting the architecture, the pipeline, and the deploy flow.

---

## What you have at the end

- A public repo with a production-grade multi-stage Dockerfile
- A `compose.yaml` that brings up a full stack in one command
- A GitHub Actions pipeline that builds, tests, scans, and publishes container images
- A live deployed app with HTTPS
- Enough of a foundation to start Kubernetes without it feeling like magic

That combination is a genuinely uncommon signal on a frontend developer's profile — it's the concrete evidence behind "full-stack capable" rather than the claim.

---

## Where to go next

| Path | Start with |
|---|---|
| Orchestration | Kubernetes fundamentals — pods, deployments, services |
| Infrastructure as Code | Terraform, provisioning the VPS you deployed to by hand |
| Observability | Prometheus + Grafana against your running containers |
| Security | Image signing (cosign), SBOMs, supply-chain hardening |

---

## Session tracker

| # | Session | Weight | Deliverable | Done |
|---|---|---|---|---|
| 1 | Container mental model | Light | Explanation + nginx running | ☐ |
| 2 | Images, layers, CLI | Light | Personal cheat sheet | ☐ |
| 3 | First Dockerfile | Medium | Working API image | ☐ |
| 4 | React / Next.js containers | Heavy | Dev + prod Dockerfiles | ☐ |
| 5 | Multi-stage + optimization | Heavy | Size before/after table | ☐ |
| 6 | Volumes and persistence | Medium | Persistent DB container | ☐ |
| 7 | Networking + Compose | Heavy | One-command full stack | ☐ |
| 8 | Config and secrets | Light | Dev/prod config split | ☐ |
| 9 | Docker in CI/CD | Heavy | Green build-and-push pipeline | ☐ |
| 10 | Production deployment | Heavy | Live HTTPS URL + README | ☐ |
