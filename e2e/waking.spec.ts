import { test, expect, type Page, type Request } from "@playwright/test";
import { ADMIN, LEARNER, openSession, signIn, skipWithoutApi } from "./support/api";

/**
 * Block 12 — the API waking up.
 *
 * On the $0 deploy the API sleeps after 15 idle minutes and takes about a minute to
 * start. Vercel's rewrite holds a request while it does, so a cold start mostly looks
 * like a very slow call, and sometimes like a gateway error. Both are simulated here
 * by intercepting /api in the browser: a delay, or a 502 whose HTML body is what a
 * gateway — not the API — would send.
 *
 * The server-rendered side (a page render that gives up, and the error page that then
 * recovers by itself) cannot be intercepted from the browser. e2e/cold-start.spec.ts
 * covers it, against a shell built in front of tools/sleepy-proxy.mjs.
 */

const SLUG = "docker-fundamentals";

const GATEWAY_ERROR = {
  status: 502,
  contentType: "text/html",
  body: "<html><body><h1>502 Bad Gateway</h1></body></html>",
};

const notice = (page: Page) => page.getByTestId("waking-notice");
const frame = (page: Page) => page.frameLocator('iframe[title*="Docker"]');
const noteT1 = (page: Page) => frame(page).locator('textarea[data-note="t1"]');
const saveStatus = (page: Page, text: string | RegExp) =>
  page.getByRole("status").filter({ hasText: text });

async function fillSignIn(page: Page, who = LEARNER) {
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

async function enrolled(page: Page) {
  await page.goto(`/courses/${SLUG}`);
  const start = page.getByRole("button", { name: "Start this course" });
  if (await start.isVisible().catch(() => false)) await start.click();
  // Wait for the enrolment to land: the player redirects anyone not enrolled.
  await expect(page.getByRole("button", { name: "Unenroll" })).toBeVisible();
}

const isStatePut = (request: Request, containing?: string) =>
  request.method() === "PUT" &&
  request.url().includes("/api/me/courses/") &&
  request.url().includes("/state/") &&
  (containing === undefined || (request.postData() ?? "").includes(containing));

test.beforeEach(async ({ page }) => {
  await skipWithoutApi(page);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
});

// ── Signing in while the API sleeps ────────────────────────────────────────────

test("the login page starts waking the API as soon as it opens", async ({ page }) => {
  const wake = page.waitForRequest((r) => r.url().endsWith("/api/health"));
  await page.goto("/login");
  // Before anyone has typed anything: the cold start overlaps the typing.
  expect((await wake).method()).toBe("GET");
});

test("a slow API raises the waking notice, which clears once it answers", async ({ page }) => {
  await page.goto("/login");
  await expect(notice(page)).toBeHidden();

  await page.route("**/api/auth/login", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 6000));
    await route.continue();
  });
  await fillSignIn(page);

  await expect(notice(page)).toBeVisible();
  await expect(notice(page)).toContainText("waking up");
  // The Bud in it is asleep, which is the literal truth about the server (block 17).
  await expect(notice(page).locator("svg[data-pose]")).toHaveAttribute("data-pose", "sleepy");
  await page.waitForURL("**/dashboard");
  await expect(notice(page)).toBeHidden();
});

test("a gateway answering for the API is retried until the API answers", async ({ page }) => {
  test.slow();
  let attempts = 0;
  let firstGatewayError = 0;
  await page.route("**/api/auth/login", async (route) => {
    attempts += 1;
    if (attempts <= 2) {
      if (attempts === 1) firstGatewayError = Date.now();
      return route.fulfill(GATEWAY_ERROR);
    }
    return route.continue();
  });

  await page.goto("/login");
  await fillSignIn(page);

  /**
   * Raised by the retry itself, not merely by the call being slow: it must show
   * before the 4s slow-call timer could have fired.
   */
  await expect.poll(() => firstGatewayError, { timeout: 10_000 }).toBeGreaterThan(0);
  await expect(notice(page)).toBeVisible({ timeout: 2500 });

  await page.waitForURL("**/dashboard", { timeout: 45_000 });
  expect(attempts, "two gateway errors, then the real API").toBe(3);
  await expect(notice(page)).toBeHidden();
});

test("an API that stays asleep gets an honest message, not a crash", async ({ page }) => {
  test.slow();
  let attempts = 0;
  await page.route("**/api/auth/login", (route) => {
    attempts += 1;
    return route.fulfill(GATEWAY_ERROR);
  });

  await page.goto("/login");
  await fillSignIn(page);

  await expect(page.getByRole("alert").filter({ hasText: "still waking up" })).toBeVisible({
    timeout: 45_000,
  });
  // The first try and two retries, then it stops rather than hammering a sleeping host.
  expect(attempts).toBe(3);
  await expect(page).toHaveURL(/\/login$/);
});

test("the API's own errors are reported at once, never retried", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/auth/login", (route) => {
    attempts += 1;
    // JSON: the API itself answered, so there is nothing to wait out.
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ statusCode: 500, error: "Internal Server Error", message: "Boom." }),
    });
  });

  await page.goto("/login");
  const started = Date.now();
  await fillSignIn(page);

  await expect(page.getByRole("alert").filter({ hasText: "Boom." })).toBeVisible({ timeout: 3000 });
  expect(Date.now() - started).toBeLessThan(4000);
  expect(attempts).toBe(1);
  await expect(notice(page)).toBeHidden();
});

test("a gateway error with no body at all is treated as the API asleep", async ({ page }) => {
  test.slow();
  let attempts = 0;
  await page.route("**/api/auth/login", async (route) => {
    attempts += 1;
    if (attempts <= 2) return route.fulfill({ status: 503, body: "" });
    return route.continue();
  });

  await page.goto("/login");
  await fillSignIn(page);
  await page.waitForURL("**/dashboard", { timeout: 45_000 });
  expect(attempts).toBe(3);
});

test("leaving the login page stops its wake-up call, and the notice with it", async ({ page }) => {
  test.slow();
  // The wake-up call keeps meeting a gateway error, so it sits in its retry wait...
  await page.route("**/api/health", (route) => route.fulfill(GATEWAY_ERROR));
  await page.goto("/login");
  await expect(notice(page)).toBeVisible({ timeout: 10_000 });

  // ...until signing in navigates away and unmounts the form that made it.
  await fillSignIn(page);
  await page.waitForURL("**/dashboard");
  await expect(notice(page)).toBeHidden({ timeout: 3000 });
});

test("an upload the API slept through is not sent twice, and says why", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto("/admin/courses");

  let attempts = 0;
  await page.route("**/api/admin/courses", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts += 1;
    return route.fulfill(GATEWAY_ERROR);
  });

  await page.setInputFiles('input[type="file"]', {
    name: "any-course.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("PK not really"),
  });

  await expect(page.getByRole("alert").filter({ hasText: "asleep and missed that upload" })).toBeVisible();
  // Resending up to 50MB unasked is not the client's call to make.
  expect(attempts).toBe(1);
});

// ── Saving course state while the API sleeps ────────────────────────────────────

/**
 * Saves are whole values, last write wins, and the client retries a save a gateway
 * answered for. Without ordering, a failed save waiting to retry could land after a
 * newer one that went straight through, and roll the learner's work back.
 */
test("a retried save never lands on top of a newer one", async ({ page }) => {
  test.slow();
  await signIn(page, LEARNER);
  await enrolled(page);
  await openSession(page, SLUG, "s1");

  const stamp = Date.now();
  const older = `older write ${stamp}`;
  const middle = `middle write ${stamp}`;
  const newer = `newer write ${stamp}`;

  // The older save fails twice: a wide window for the newer ones to be made in.
  let olderFailures = 0;
  const succeeded: string[] = [];
  await page.route("**/api/me/courses/**/state/**", async (route) => {
    const body = route.request().postData() ?? "";
    if (isStatePut(route.request(), older) && olderFailures < 2) {
      olderFailures += 1;
      return route.fulfill(GATEWAY_ERROR);
    }
    const response = await route.fetch();
    if (isStatePut(route.request()) && response.ok()) succeeded.push(body);
    return route.fulfill({ response });
  });

  await noteT1(page).fill(older);
  await expect.poll(() => olderFailures, { timeout: 15_000 }).toBe(1);
  // While the older save waits to retry: a value that will be superseded, then the newest.
  await noteT1(page).fill(middle);
  await page.waitForTimeout(800);
  await noteT1(page).fill(newer);

  await expect
    .poll(() => succeeded.some((b) => b.includes(newer)), { timeout: 45_000 })
    .toBe(true);
  await expect(saveStatus(page, "Saved")).toBeVisible();

  // Newest wins, and the superseded middle value never went out at all.
  expect(succeeded.some((b) => b.includes(middle)), "the superseded value was sent").toBe(false);
  const last = succeeded[succeeded.length - 1];
  expect(last).toContain(newer);

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.reload();
  await expect(noteT1(page)).toHaveValue(newer);
});

/**
 * The same guarantee across sessions. Moving to another session remounts the player;
 * a queue that died with it let the old mount's retry land on the new mount's write.
 */
test("a retried save cannot overwrite one made after moving between sessions", async ({ page }) => {
  test.slow();
  await signIn(page, LEARNER);
  await enrolled(page);
  await openSession(page, SLUG, "s1");

  const stamp = Date.now();
  const older = `before leaving ${stamp}`;
  const newer = `after coming back ${stamp}`;

  let olderFailures = 0;
  await page.route("**/api/me/courses/**/state/**", async (route) => {
    if (isStatePut(route.request(), older) && olderFailures < 2) {
      olderFailures += 1;
      return route.fulfill(GATEWAY_ERROR);
    }
    return route.continue();
  });

  await noteT1(page).fill(older);
  await expect.poll(() => olderFailures, { timeout: 15_000 }).toBe(1);

  // Away and back: a different player mount.
  const rail = page.getByRole("navigation");
  await rail.getByRole("link", { name: "Next ›", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/learn/${SLUG}/s2$`));
  await rail.getByRole("link", { name: "‹ Previous", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/learn/${SLUG}/s1$`));
  await expect(frame(page).locator("#t1")).toBeVisible();

  // The course reloaded from the value still queued, not the server's older copy.
  await expect(noteT1(page)).toHaveValue(older);
  await noteT1(page).fill(newer);

  const newerSaved = page.waitForResponse((r) => isStatePut(r.request(), newer) && r.ok(), {
    timeout: 45_000,
  });
  await newerSaved;
  await expect(saveStatus(page, "Saved")).toBeVisible({ timeout: 45_000 });

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.reload();
  await expect(noteT1(page)).toHaveValue(newer);
});

/**
 * A worksheet whose saved work fails to load "carries on with a blank sheet" — and
 * its next save would write that blank sheet over everything saved. The shell refuses
 * that save while there is saved work it could destroy.
 */
test("saved work that failed to load cannot be overwritten by a blank sheet", async ({ page }) => {
  test.slow();
  await signIn(page, LEARNER);
  await enrolled(page);
  await openSession(page, SLUG, "s1");

  const kept = `kept through a failed load ${Date.now()}`;
  const saved = page.waitForResponse((r) => isStatePut(r.request(), kept) && r.ok());
  await noteT1(page).fill(kept);
  await saved;

  // Now every read of saved state meets a gateway error.
  const blankWrites: string[] = [];
  await page.route("**/api/me/courses/**/state/**", (route) => {
    if (route.request().method() === "GET") return route.fulfill(GATEWAY_ERROR);
    blankWrites.push(route.request().postData() ?? "(delete)");
    return route.continue();
  });
  await page.reload();
  await expect(frame(page).locator("#t1")).toBeVisible();
  await expect(saveStatus(page, "didn't load")).toBeVisible({ timeout: 45_000 });

  // The learner, looking at a blank sheet, ticks something — and it must not save.
  const tick = frame(page).locator("#t1");
  await tick.check({ force: true });
  await page.waitForTimeout(3000);
  expect(blankWrites, "a blank-based sheet was written over saved work").toEqual([]);

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.reload();
  await expect(noteT1(page)).toHaveValue(kept);
});

test("a save that failed is sent again once the API is back", async ({ page }) => {
  test.slow();
  await signIn(page, LEARNER);
  await enrolled(page);
  await openSession(page, SLUG, "s1");

  const value = `sent again later ${Date.now()}`;
  let apiAway = true;
  await page.route("**/api/me/courses/**/state/**", (route) =>
    apiAway && isStatePut(route.request(), value) ? route.fulfill(GATEWAY_ERROR) : route.continue(),
  );

  await noteT1(page).fill(value);
  // The first try and both retries fail; the indicator says the work is safe here.
  await expect(saveStatus(page, "will save when")).toBeVisible({ timeout: 45_000 });

  // The API comes back; within the first re-send delay the value goes out by itself.
  apiAway = false;
  const resent = page.waitForResponse((r) => isStatePut(r.request(), value) && r.ok(), {
    timeout: 60_000,
  });
  await resent;
  await expect(saveStatus(page, "Saved")).toBeVisible();

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.reload();
  await expect(noteT1(page)).toHaveValue(value);
});

test("closing the tab warns while a failed save has not gone through", async ({ page }) => {
  test.slow();
  await signIn(page, LEARNER);
  await enrolled(page);
  await openSession(page, SLUG, "s1");

  const value = `only in this tab ${Date.now()}`;
  await page.route("**/api/me/courses/**/state/**", (route) =>
    isStatePut(route.request(), value) ? route.fulfill(GATEWAY_ERROR) : route.continue(),
  );
  await noteT1(page).fill(value);
  await expect(saveStatus(page, "will save when")).toBeVisible({ timeout: 45_000 });

  let dialog: string | null = null;
  page.once("dialog", async (d) => {
    dialog = d.type();
    await d.accept();
  });
  await page.reload();
  expect(dialog).toBe("beforeunload");
});

test("on a phone the waking notice never covers Mark complete", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, LEARNER);
  await enrolled(page);
  await openSession(page, SLUG, "s1");

  // A slow save raises the notice while the player's bottom controls are on screen.
  await page.route("**/api/me/courses/**/state/**", async (route) => {
    if (route.request().method() === "PUT") await new Promise((r) => setTimeout(r, 7000));
    await route.continue();
  });
  await noteT1(page).fill(`slow save ${Date.now()}`);
  await expect(notice(page)).toBeVisible({ timeout: 10_000 });

  const card = await notice(page).boundingBox();
  const button = await page
    .getByRole("button", { name: /^Mark (not )?complete$/ })
    .filter({ visible: true })
    .first()
    .boundingBox();
  expect(card && button).toBeTruthy();
  const overlaps =
    card!.y < button!.y + button!.height && button!.y < card!.y + card!.height;
  expect(overlaps, "the notice covers Mark complete").toBe(false);
});
