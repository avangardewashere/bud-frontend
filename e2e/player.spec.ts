import { test, expect, type Page } from "@playwright/test";
import { LEARNER, signIn, skipWithoutApi } from "./support/api";

/**
 * Block 7 — the course player, and with it the Phase 1 exit criterion from
 * Overall Plan §7: complete Docker session 1 inside Bud, refresh, log out and in,
 * and it is still complete.
 *
 * Everything here runs against the real API and the real course package, so this is
 * the first test that exercises the whole product rather than one half of it.
 *
 * Google Fonts is aborted throughout. The worksheets load it render-blocking, and
 * when the request hangs rather than fails their own script never runs — which is a
 * real failure mode the player handles, but a terrible source of test flake.
 */

const SLUG = "docker-fundamentals";
const SESSION_1 = "s1";

const frame = (page: Page) => page.frameLocator('iframe[title*="Docker"]');

async function enrol(page: Page) {
  await page.goto(`/courses/${SLUG}`);
  const start = page.getByRole("button", { name: "Start this course" });
  if (await start.isVisible().catch(() => false)) await start.click();
  await expect(page.getByRole("button", { name: "Unenroll" })).toBeVisible();
}

/** Leaves the learner enrolled but with session 1 not complete. */
async function resetSession1(page: Page) {
  await page.goto(`/learn/${SLUG}/${SESSION_1}`);
  const undo = page.getByRole("button", { name: "Mark not complete" });
  if (await undo.isVisible().catch(() => false)) await undo.click();
  await expect(page.getByRole("button", { name: "Mark complete" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await skipWithoutApi(page);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await signIn(page, LEARNER);
  await enrol(page);
});

test("the player mounts the course in an isolated frame", async ({ page }) => {
  await page.goto(`/learn/${SLUG}/${SESSION_1}`);

  await expect(frame(page).locator("#t1")).toBeVisible();

  const courseFrame = page.frames().find((f) => f.url().includes("/docker-session-1"));
  expect(courseFrame, "the course frame should be mounted").toBeTruthy();

  // Sandboxed without allow-same-origin: opaque origin, no cookie access. This is
  // what stops author-controlled JavaScript reaching the session.
  expect(await courseFrame!.evaluate(() => self.origin)).toBe("null");
  expect(
    await courseFrame!.evaluate(() => {
      try {
        void document.cookie;
        return "readable";
      } catch {
        return "blocked";
      }
    }),
  ).toBe("blocked");

  // bridge.js injected, exposing exactly contract v1 (Overall Plan §3) — including
  // storage.delete, which the original contract omitted and every worksheet calls.
  const api = await courseFrame!.evaluate(() => ({
    storage: Object.keys((window as unknown as { storage: object }).storage).sort(),
    bud: Object.keys((window as unknown as { bud: object }).bud).sort(),
  }));
  expect(api.storage).toEqual(["delete", "get", "set"]);
  expect(api.bud).toEqual(["complete", "height", "progress", "ready"]);
});

test("the rail shows every session and marks the current one", async ({ page }) => {
  await page.goto(`/learn/${SLUG}/${SESSION_1}`);

  const rail = page.getByRole("navigation");
  await expect(rail.getByRole("listitem")).toHaveCount(10);
  await expect(rail.locator('[aria-current="page"]')).toContainText(
    "The container mental model",
  );

  // Exact: /Next/ also matches "Containerizing React and Next.js".
  await rail.getByRole("link", { name: "Next ›", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/learn/${SLUG}/s2$`));
});

/** The exit criterion, in one test. */
test("work done in the course survives a reload and a fresh sign-in", async ({ page }) => {
  await resetSession1(page);
  await page.goto(`/learn/${SLUG}/${SESSION_1}`);

  const saved = page.getByRole("status").filter({ hasText: "Saved" });
  const tick = frame(page).locator("#t1");
  const note = frame(page).locator('textarea[data-note="t1"]');
  const written = `Survived a round trip at ${Date.now()}`;

  /**
   * Force a change event whatever the starting state. State persists per learner, so
   * a previous run leaves the box already ticked — and check() on a ticked box is a
   * no-op that fires no change event, so the worksheet never saves and nothing
   * reaches the API.
   */
  await tick.uncheck({ force: true });
  await tick.check({ force: true });
  await expect(saved).toBeVisible();

  await note.fill(written);
  // The worksheet debounces at 400ms; waiting for the indicator to settle again is
  // what proves the note itself reached the API rather than just the checkbox.
  await expect(saved).toBeVisible();

  // 1. A full reload: nothing in memory survives this.
  await page.reload();
  await expect(frame(page).locator("#t1")).toBeChecked();
  await expect(note).toHaveValue(written);

  // 2. A different session, and the shell records completion.
  await page.getByRole("button", { name: "Mark complete" }).click();
  await expect(page.getByRole("button", { name: "Mark not complete" })).toBeVisible();

  // 3. Out and back in — a new browser session reading it from the database.
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await signIn(page, LEARNER);
  await page.goto(`/learn/${SLUG}/${SESSION_1}`);

  await expect(frame(page).locator("#t1")).toBeChecked();
  await expect(note).toHaveValue(written);
  await expect(page.getByRole("button", { name: "Mark not complete" })).toBeVisible();
});

test("completing a session moves the dashboard and the meter", async ({ page }) => {
  await resetSession1(page);

  await page.goto(`/learn/${SLUG}/${SESSION_1}`);
  await page.getByRole("button", { name: "Mark complete" }).click();
  await expect(page.getByRole("button", { name: "Mark not complete" })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByText("1 / 10 sessions")).toBeVisible();
  /**
   * Deliberately not asserting which session the Continue card offers. The API
   * currently points it at the session just completed rather than the next
   * unfinished one, which the mockups say should read "up next" — raised with the
   * backend rather than worked around here.
   */

  await resetSession1(page);
});

test("Clear saved work deletes the state through the bridge", async ({ page }) => {
  await page.goto(`/learn/${SLUG}/${SESSION_1}`);

  const tick = frame(page).locator("#t1");
  await tick.uncheck({ force: true });
  await tick.check({ force: true });
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

  // The worksheet confirm()s first, which only works because the frame is granted
  // allow-modals — without it confirm() returns false and reset silently does nothing.
  page.on("dialog", (dialog) => dialog.accept());
  await frame(page).getByRole("button", { name: "Clear saved work" }).click();

  await expect(tick).not.toBeChecked();
  await page.reload();
  await expect(tick).not.toBeChecked();
});

test("an unknown session key is a 404", async ({ page }) => {
  const response = await page.goto(`/learn/${SLUG}/no-such-session`);
  expect(response?.status()).toBe(404);
});
