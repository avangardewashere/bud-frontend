import { test, expect, type Page } from "@playwright/test";

/**
 * Block 8 — the brand artwork. These assert the rules that are easy to break silently
 * while nudging SVG paths: the accessible names, the leaf arithmetic, and the
 * small-size simplification.
 *
 * How the artwork *looks* is reviewed at /brand by eye; only its behaviour is asserted here.
 */

/** The gallery labels each example, so a caption is the stable way to find one. */
const swatch = (page: Page, label: string) =>
  page.locator("figure").filter({ hasText: label });

test.beforeEach(async ({ page }) => {
  await page.goto("/brand");
});

test("every illustration has an accessible name", async ({ page }) => {
  await expect(page.getByRole("img", { name: "Bud" }).first()).toBeVisible();
  await expect(page.getByRole("img", { name: "Bud, in bloom" }).first()).toBeVisible();
  await expect(
    page.getByRole("img", { name: "A seed, not yet sprouted" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "3 of 10 sessions complete" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Docker: 10-Session Course — no cover image/ }),
  ).toBeVisible();
});

test("Bud sheds detail below the 32px threshold", async ({ page }) => {
  const full = swatch(page, "32 — full").locator("svg");
  const small = swatch(page, "24 — player bar").locator("svg");

  await expect(full).toHaveAttribute("data-detail", "full");
  await expect(small).toHaveAttribute("data-detail", "simple");

  // The root-toes are the signature detail, and the first thing to go when tiny.
  await expect(full.locator("[data-toes]")).toHaveCount(1);
  await expect(small.locator("[data-toes]")).toHaveCount(0);
});

test("the meter draws one leaf per completed session", async ({ page }) => {
  for (const [label, done] of [
    ["0 / 10", 0],
    ["3 / 10", 3],
    ["7 / 10", 7],
  ] as const) {
    const meter = swatch(page, label).first().locator("svg");
    await expect(meter.locator('[data-leaf="done"]')).toHaveCount(done);
    // One pale leaf for the session in progress, until the course is finished.
    await expect(meter.locator('[data-leaf="pending"]')).toHaveCount(1);
  }
});

test("the bloom opens only when the course is finished", async ({ page }) => {
  await expect(swatch(page, "7 / 10").first().locator("[data-bloom]")).toHaveCount(0);

  const finished = swatch(page, "10 / 10").first().locator("svg").first();
  await expect(finished.locator("[data-bloom]")).toHaveCount(1);
  await expect(finished.locator('[data-leaf="done"]')).toHaveCount(10);
  await expect(finished.locator('[data-leaf="pending"]')).toHaveCount(0);
});

test("leaf count follows the course length, and is capped for long courses", async ({
  page,
}) => {
  await expect(
    swatch(page, "2 / 6").locator('svg [data-leaf="done"]'),
  ).toHaveCount(2);

  // 30 sessions would not fit up the stem; the plant becomes representative.
  const long = swatch(page, "9 / 30").locator("svg");
  const leaves = await long.locator('[data-leaf="done"]').count();
  expect(leaves).toBeGreaterThan(0);
  expect(leaves).toBeLessThanOrEqual(12);
  await expect(long).toHaveAttribute("aria-label", "9 of 30 sessions complete");
});
