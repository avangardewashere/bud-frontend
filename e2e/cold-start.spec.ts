import { test, expect, type Page } from "@playwright/test";
import { LEARNER, signIn, skipWithoutApi } from "./support/api";

/**
 * Block 12 — the server-rendered side of a cold start.
 *
 * Server components call the API directly, and Playwright cannot intercept those
 * calls. So this runs only against a shell whose API sits behind a proxy that can be
 * put to sleep:
 *
 *   node tools/sleepy-proxy.mjs
 *   BUD_API_ORIGIN=http://127.0.0.1:3197 npm run build
 *   BUD_API_ORIGIN=http://127.0.0.1:3197 npx next start -p 3100
 *   BUD_SLEEPY_PROXY=http://127.0.0.1:3197 npx playwright test e2e/cold-start.spec.ts
 *
 * Without BUD_SLEEPY_PROXY it skips. Run it on its own: while the proxy sleeps, so
 * does every other test's API.
 */

const PROXY = process.env.BUD_SLEEPY_PROXY?.replace(/\/+$/, "");

const control = async (page: Page, path: string) => {
  const res = await page.request.get(`${PROXY}${path}`);
  expect(res.ok(), `sleepy-proxy ${path}`).toBe(true);
  return res.json();
};

const phase = (page: Page) => page.getByTestId("recovery-phase");
const dashboard = (page: Page) => page.getByRole("heading", { name: /^Welcome back/ });

test.skip(!PROXY, "Set BUD_SLEEPY_PROXY to run the cold-start checks — see this file's header.");

test.beforeEach(async ({ page }) => {
  await skipWithoutApi(page);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await control(page, "/__sleep?ms=0");
  await control(page, "/__fix");
});

test.afterEach(async ({ page }) => {
  // Never leave the API asleep or broken for whatever runs next.
  await control(page, "/__sleep?ms=0");
  await control(page, "/__fix");
});

test("a cold start shows the waking page, then the page itself, with no reload", async ({ page }) => {
  test.slow();
  await signIn(page, LEARNER);

  await control(page, "/__sleep?ms=20000");
  const started = Date.now();
  await page.goto("/dashboard");

  // The server gave up quickly rather than leave a blank tab for the whole wake-up.
  await expect(phase(page)).toBeVisible();
  expect(Date.now() - started).toBeLessThan(12_000);
  await expect(phase(page)).toHaveAttribute("data-phase", "waking", { timeout: 10_000 });

  // And carried on by itself once the API answered.
  await expect(dashboard(page)).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(phase(page)).toHaveCount(0);
});

test("a page that fails with the API awake is retried once, then said plainly", async ({ page }) => {
  await signIn(page, LEARNER);
  // Settle somewhere that never calls /me/dashboard first: sign-in's own refresh of
  // the dashboard can still be in flight, and would be counted as a retry below.
  await page.goto("/catalog");
  await page.waitForLoadState("networkidle");
  await control(page, "/__break?path=/me/dashboard");

  const started = Date.now();
  await page.goto("/dashboard");
  await expect(phase(page)).toHaveAttribute("data-phase", "broken", { timeout: 30_000 });
  await expect(phase(page)).toHaveText("Bud couldn't load this page.");

  // Exactly one automatic retry: the first render and one more, then it stops.
  const { log } = (await control(page, "/__state")) as { log: { at: number; path: string }[] };
  const calls = log.filter((e) => e.path === "/me/dashboard" && e.at >= started - 100);
  expect(calls).toHaveLength(2);

  await control(page, "/__fix");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(dashboard(page)).toBeVisible({ timeout: 30_000 });
});

test("recovery works in browsers without AbortSignal.any", async ({ page }) => {
  test.slow();
  // Part of the supported browser range lacks it; the recovery page must not need it.
  await page.addInitScript(() => {
    delete (AbortSignal as unknown as { any?: unknown }).any;
  });
  await signIn(page, LEARNER);

  await control(page, "/__sleep?ms=12000");
  await page.goto("/dashboard");
  await expect(phase(page)).toBeVisible();
  await expect(dashboard(page)).toBeVisible({ timeout: 60_000 });
});

test("a signed-out visitor is still simply sent to sign in, asleep or not", async ({ page }) => {
  await control(page, "/__sleep?ms=15000");
  const started = Date.now();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  // No API call is needed to know there is no session, so the sleep costs nothing.
  expect(Date.now() - started).toBeLessThan(5000);
});
