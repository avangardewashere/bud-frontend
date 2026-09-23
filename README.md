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

Auth needs a third process, the API from the sibling `Bud - backend` project, on **http://localhost:3102** (`npm run start:dev` there, with its Postgres container up).

**The browser never calls the API directly.** It calls `/api/*` on the shell's own origin, and a rewrite in `next.config.ts` forwards the request to `BUD_API_ORIGIN`. Only the API's own prefixes are forwarded (`auth`, `me`, `courses`, `admin`, `course-spec`, `health`, `ready`), so a new top-level API prefix needs adding there. Development works the same way as production. The reason is the free hosts: the app on `*.vercel.app` and the API on `*.onrender.com` are different *sites*, because both are public suffixes, so the API's `SameSite=Lax` session cookie would never cross between them. Sign-in would appear to work, and then every page would bounce back to `/login`. Through the rewrite, the cookie is first-party on the app's host, which is also where server components read it. Server components skip the detour: they call `BUD_API_ORIGIN` directly and forward the cookie themselves.

| Variable | What | Read |
|---|---|---|
| `NEXT_PUBLIC_APP_ORIGIN` | the shell's own origin | build time |
| `NEXT_PUBLIC_COURSES_ORIGIN` | where course HTML is served. It must differ from the app's origin | build time |
| `BUD_API_ORIGIN` | where the API really is. Server-only | build time (the rewrite) and runtime (server components) |

All three default to the local ports above. A **production build fails** if any of them is blank or has a path: the first deploy shipped with all three blank, and the only sign was a CSP with no origins in it. On Vercel, set them under *Settings → Environment Variables*, then redeploy.

**http://localhost:3100/brand** is the brand gallery: every piece of artwork at every size the screens use — Bud's three poses, the mark and wordmark, the growth meter across course lengths, and the fallback course cover. It is kept as a living styleguide and is the target for `e2e/brand.spec.ts`.

The two throwaway harnesses that came before the real screens — `/spike` for the bridge and `/dev/auth` for the typed client — are gone. The player and the login screen now cover both against the real API.

## Container

```bash
docker build -t bud-web .
docker run --rm -p 3100:3100 bud-web
```

The three origins are fixed at build time: `NEXT_PUBLIC_*` values are inlined into the client bundle, and `BUD_API_ORIGIN` is compiled into the `/api` rewrite. They are build arguments rather than runtime environment, so an image built for one environment can't be re-pointed at another by changing env vars. Build a new image instead:

```bash
docker build -t bud-web \
  --build-arg NEXT_PUBLIC_APP_ORIGIN=https://app.example \
  --build-arg NEXT_PUBLIC_COURSES_ORIGIN=https://courses.example \
  --build-arg BUD_API_ORIGIN=https://api.example .
```

That is also why CI publishes an image only once there is somewhere to build it for. It always builds and scans one, so the Dockerfile is never broken unnoticed, but it pushes `ghcr.io/<owner>/bud-web` from `main` only when the three origins are set as **repository variables** (*Settings → Secrets and variables → Actions → Variables*). Unset, it says so in the run's summary and skips the push.

The runtime stage carries Next's `standalone` output rather than `node_modules`, runs as the non-root `node` user, and serves with `node server.js` — `next` itself is not installed in that stage.

Two things differ when the shell serves `/api` itself (the image, `next start`) rather than behind Vercel, whose edge router handles rewrites on its own:

- **The API sees the shell's IP, not the learner's.** Next's rewrite passes on an `X-Forwarded-For` that something in front of it set, and never adds one itself. With nothing in front, every learner shares one per-IP rate-limit bucket, and one person's failed logins can lock an account for everyone. Put a proxy that sets `X-Forwarded-For` in front of the shell. Then point `BUD_API_ORIGIN` at the API's internal address, so a proxy in front of the API doesn't overwrite the header with the shell's address.
- **Request bodies are capped** at `experimental.proxyClientMaxBodySize`, which is sized from the 50 MB course-archive ceiling in `src/lib/config/limits.ts`. Next's default is 10 MB, which cut uploads off mid-transfer.

## Checks

```bash
npm run typecheck
npm run lint
npx playwright test
node tools/bridge-leak-probe.mjs
```

`npm run lint` covers `src`, `e2e`, `tools` and `next.config.ts`. `npx eslint .` works too but is slow; it walks the build output. The specs that need the API skip with a message when it isn't running, so a red suite always means the frontend broke.

**CI** (`.github/workflows/ci.yml`) runs on every push and pull request: typecheck, lint, a production build, a check that a build still refuses blank origins, the bridge leak probe, and the container build with a vulnerability scan. The Playwright suite is deliberately *not* in CI — it skips itself without the API, so it would be green while proving nothing.

### Cold starts

On the $0 deploy the API sleeps after 15 idle minutes and takes about a minute to wake. What the shell does about it:

- **Browser calls** show a "waking up" notice once they have waited four seconds. A call that a gateway answered for is retried twice, after 4 and then 12 seconds. Only calls that are safe to repeat are retried.
- **Course-state writes** stay in order per key, even across sessions. One that finally fails is sent again later, and closing the tab warns until it lands.
- **A course whose saved work failed to load** can't save over it.
- **Server renders** give up after 5 seconds. The error page then checks `/api/ready` itself, and carries on as soon as the API answers.

`e2e/waking.spec.ts` covers the browser side by intercepting `/api`. The server side can't be intercepted, so `e2e/cold-start.spec.ts` needs a shell built in front of a proxy that can be put to sleep:

```bash
node tools/sleepy-proxy.mjs
```

```bash
BUD_API_ORIGIN=http://127.0.0.1:3197 npm run build && BUD_API_ORIGIN=http://127.0.0.1:3197 npx next start -p 3100
```

```bash
BUD_API_ORIGIN=http://127.0.0.1:3197 BUD_SLEEPY_PROXY=http://127.0.0.1:3197 npx playwright test
```

The proxy passes everything through while it's awake, so the whole suite runs that way. Without `BUD_SLEEPY_PROXY`, the cold-start spec skips.

## The API contract

`src/lib/api/schema.d.ts` is generated from the backend's own OpenAPI document and committed, so the repo typechecks without the API running. Regenerate it whenever the backend changes the spec:

```bash
npm run api:types
```

The backend publishes the spec at `http://localhost:3102/docs/openapi.json` (Swagger UI at `/docs`) and is the single source of truth for it — the frontend never hand-writes a request or response shape. Everything else in `src/lib/api/` is a thin layer over that: `credentials: "include"` on every call, since the session is an httpOnly cookie, and non-2xx responses turned into a `BudApiError` carrying the API's error envelope.

`e2e/api-client.spec.ts` runs that client from Node against the real API, with a session cookie forwarded by hand — the same way server components call it. It's what keeps the client honest for endpoints no screen uses yet.

## Security

Course HTML is author-controlled JavaScript, so most of what keeps a learner's work safe is about what a course *cannot* do. Each rule below was found by trying to break it, and each has a test.

| Rule | Where | Why |
|---|---|---|
| Courses run on a different **host**, sandboxed without `allow-same-origin` | player iframe | Cookies ignore ports; an opaque origin cannot read the shell's cookies, storage or DOM |
| Bridge replies travel over a **MessagePort**, never to the frame's window | `public/bridge.js`, `useCourseBridge` | A `WindowProxy` follows the frame across navigation, so a reply to the window could land on a page the course navigated to. Re-checking the handle does not help |
| **No `allow-popups`** | player iframe | A popup is an unpoliced way out: the learner's data rides in a `window.open` URL, or the course hands the bridge port to the popup |
| **`frame-src`** names only the courses origin | `src/lib/security/csp.ts` | A course can navigate its own frame to `https://evil/?d=…`. Nothing the courses origin sends can stop that; only the embedder's `frame-src` can |
| **`script-src` with a per-request nonce** and `'strict-dynamic'` | `src/proxy.ts` | No inline or injected script runs unless Next rendered it for this request |
| **`connect-src 'self'`**: the API is reached only through `/api` | `next.config.ts`, `src/lib/security/csp.ts` | The session cookie stays first-party on the app's host. The API's real address is not in the policy, so a script has one fewer place to send data |
| **`/api` forwards only the API's own prefixes**, and never a `/{slug}/{version}/…` path | `next.config.ts` | On the free deploy the API's host also serves course content. A catch-all rewrite put course HTML on the shell's origin, top-level and outside the sandbox, with the learner's session a same-origin `fetch` away |
| **Course documents sandbox themselves**: a CSP `sandbox` with exactly the iframe's flags | the backend's course server, `tools/courses-server.mjs` | A course reached outside the player (opened directly, or through any proxy) still gets an opaque origin. The flags must match the iframe's: looser is a hole, tighter breaks courses in the player |
| **Learner-supplied links are parsed before they reach an `href`** | `src/lib/safe-href.ts` | A deliverable is a URL someone typed. `javascript:` in an href runs in the shell's own origin when clicked. The API refuses anything but http(s) on the way in; this refuses it on the way out, for values that predate a validator or come from an endpoint written later |

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
tools/sleepy-proxy.mjs               an API you can put to sleep, for the cold-start spec
src/proxy.ts                         the per-request nonce and CSP
src/lib/config/origins.ts            the three origins, and the production build's check of them
src/lib/config/limits.ts             how large an upload the /api rewrite can carry
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
