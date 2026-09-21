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

## Security

Course HTML is author-controlled JavaScript, so most of what keeps a learner's work safe is about what a course *cannot* do. Each rule below was found by trying to break it, and each has a test.

| Rule | Where | Why |
|---|---|---|
| Courses run on a different **host**, sandboxed without `allow-same-origin` | player iframe | Cookies ignore ports; an opaque origin cannot read the shell's cookies, storage or DOM |
| Bridge replies travel over a **MessagePort**, never to the frame's window | `public/bridge.js`, `useCourseBridge` | A `WindowProxy` follows the frame across navigation, so a reply to the window could land on a page the course navigated to. Re-checking the handle does not help |
| **No `allow-popups`** | player iframe | A popup is an unpoliced way out: the learner's data rides in a `window.open` URL, or the course hands the bridge port to the popup |
| **`frame-src`** names only the courses origin | `src/lib/security/csp.ts` | A course can navigate its own frame to `https://evil/?d=…`. Nothing the courses origin sends can stop that; only the embedder's `frame-src` can |
| **`script-src` with a per-request nonce** and `'strict-dynamic'` | `src/proxy.ts` | No inline or injected script runs unless Next rendered it for this request |

The CSP is built per request in `src/proxy.ts` from `src/lib/security/csp.ts`, which is where to read the reasoning for each directive. Two consequences worth knowing:

- **Every page renders per request** — the root layout opts in, because Next can only stamp a nonce while rendering against a live request. Nothing is prerendered, `/brand` included.
- **`style-src` is split.** Components use React `style={…}` props, which render as `style` attributes that a nonce cannot cover, and once a directive holds a nonce browsers ignore `'unsafe-inline'` in it. So `<style>` elements are nonced (`style-src-elem`) and attributes are allowed (`style-src-attr`).

`node tools/bridge-leak-probe.mjs` runs the real `bridge.js` on two real origins and fails if a learner's data can reach a document the course chose. `e2e/security.spec.ts` checks the shell's policy, including that no page in the app violates it.

## Layout

```
courses/docker-fundamentals/1.0.0/   the Docker course package + bud.manifest.json
public/bridge.js                     injected into every course HTML entry
tools/courses-server.mjs             the courses origin, for development
tools/bridge-leak-probe.mjs          guards the bridge against the exfiltration routes above
src/proxy.ts                         the per-request nonce and CSP
src/lib/security/csp.ts              the policy itself, and why each directive is there
src/app/                             routes
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
