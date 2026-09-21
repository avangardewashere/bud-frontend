# Bud — frontend (`bud-web`)

The Bud shell: accounts, catalog, dashboard, player, admin. Courses run inside it in a sandboxed iframe on a separate origin and report progress through a small `postMessage` bridge.

This is **v0**: a standalone frontend that works end to end with no backend, by shipping a stub API behind the same HTTP contract the real backend will implement. Planning lives one folder up, in `../Planning/` — start with `Design-Mockups.md` for what the screens look like.

## Run it

```bash
npm install
npm run dev
```

That starts two servers, on purpose:

| | URL | What |
|---|---|---|
| app | http://localhost:3100 | The Next.js shell |
| courses | http://127.0.0.1:3101 | Course HTML, with `bridge.js` injected and a strict CSP |

They must stay on **different hosts**, not just different ports: cookies ignore ports, so `localhost` vs `127.0.0.1` is what keeps course JavaScript away from the session cookie in development. Ports 3100/3101 rather than 3000/3001 because both of those were already in use on the dev machine; override with `COURSES_PORT` and `next dev -p`.

Auth needs a third process, the API from the sibling `Bud - backend` project, on **http://localhost:3102** (`npm run start:dev` there, with its Postgres container up). Its CORS allows `http://localhost:3100` and nothing else — reaching the shell on `127.0.0.1:3100` is a different host, so the preflight fails and the cookie would not match anyway.

**http://localhost:3100/brand** is the brand gallery: every piece of artwork at every size the screens use — Bud's three poses, the mark and wordmark, the growth meter across course lengths, and the fallback course cover. It is kept as a living styleguide and is the target for `e2e/brand.spec.ts`.

The two throwaway harnesses that came before the real screens — `/spike` for the bridge and `/dev/auth` for the typed client — are gone. The player and the login screen now cover both against the real API.

## Container

```bash
docker build -t bud-web .
docker run --rm -p 3100:3100 bud-web
```

`NEXT_PUBLIC_*` values are inlined into the client bundle at build time, so they are build arguments rather than runtime environment — an image built for one environment cannot be re-pointed at another by changing env vars. Build a new image instead:

```bash
docker build -t bud-web \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example \
  --build-arg NEXT_PUBLIC_COURSES_ORIGIN=https://courses.example \
  --build-arg NEXT_PUBLIC_APP_ORIGIN=https://app.example .
```

The runtime stage carries Next's `standalone` output rather than `node_modules`, runs as the non-root `node` user, and serves with `node server.js` — `next` itself is not installed in that stage.

## Checks

```bash
npm run typecheck
npx eslint src e2e tools
npx playwright test
```

`npx eslint .` works but is slow; it walks the build output. `e2e/auth.spec.ts` skips with a message when the API is not running, so a red suite always means the frontend broke.

## The API contract

`src/lib/api/schema.d.ts` is generated from the backend's own OpenAPI document and committed, so the repo typechecks without the API running. Regenerate it whenever the backend changes the spec:

```bash
npm run api:types
```

The backend publishes the spec at `http://localhost:3102/docs/openapi.json` (Swagger UI at `/docs`) and is the single source of truth for it — the frontend never hand-writes a request or response shape. Everything else in `src/lib/api/` is a thin layer over that: `credentials: "include"` on every call, since the session is an httpOnly cookie, and non-2xx responses turned into a `BudApiError` carrying the API's error envelope.

## Layout

```
courses/docker-fundamentals/1.0.0/   the Docker course package + bud.manifest.json
public/bridge.js                     injected into every course HTML entry
tools/courses-server.mjs             the courses origin, for development
src/app/                             routes (src/app/api/ will be the stub API)
e2e/                                 Playwright
```

## What the bridge spike established

The spike is the go/no-go for the whole architecture. It passed, and it surfaced six things the planning docs did not have:

1. **`storage.delete` is required.** Every worksheet calls it from "Clear saved work". The bridge contract in `Overall Plan.md` only had `get` and `set`.
2. **Ten storage keys, not one.** Session 1 uses `docker-course:state`; sessions 2–10 use `docker-course:session-N`. The manifest lists all ten.
3. **The shell must not load a course before it is listening.** Server-rendered, the iframe starts loading before hydration, the worksheet's first `storage.get` reaches a parent with no listener, and the course silently starts blank. The frame's `src` is now set only after the listener is attached.
4. **The sandbox needs `allow-modals`.** Every worksheet `confirm()`s before clearing; without the flag `confirm()` returns `false` and nothing happens. Dialogs grant no access, so the isolation boundary is unchanged.
5. **The frame needs `allow="clipboard-write"`.** Export and the copy buttons use `navigator.clipboard.writeText`, which a cross-origin frame only gets when delegated.
6. **A hanging external stylesheet stalls the course.** The worksheets load Google Fonts render-blocking; when that request hangs rather than fails, the worksheet's own script never runs. The player needs a load timeout with a visible "still loading" state. The e2e tests abort font requests so they are deterministic.

And two that confirmed the design: the frame's origin is opaque (`"null"`) with `document.cookie` blocked, and the worksheets needed **no changes**.
