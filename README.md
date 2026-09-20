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

The bridge spike is at http://localhost:3100/spike — session 1 of the Docker course, unmodified, persisting through the bridge into an in-memory store.

## Checks

```bash
npm run typecheck
npx eslint src e2e tools
npx playwright test
```

`npx eslint .` works but is slow; it walks the build output.

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
