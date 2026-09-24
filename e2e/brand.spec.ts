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

test("every mood in Design.md §3 is drawn, and says which it is", async ({ page }) => {
  for (const [pose, name] of [
    ["seed", "A seed, not yet sprouted"],
    ["sprout", "Bud, just sprouted"],
    ["default", "Bud"],
    ["bloom", "Bud, in bloom"],
    ["thirsty", "Bud, a little thirsty"],
    ["sleepy", "Bud, dozing"],
  ] as const) {
    await expect(page.getByRole("img", { name, exact: true }).first()).toBeVisible();
    // The caption exactly: "sprout" as a substring also finds the wordmark's
    // "32, sprouting u", which is a different piece of artwork entirely.
    const figure = page.locator("figure").filter({ hasText: new RegExp(`^${pose}$`) });
    await expect(figure.locator(`svg[data-pose="${pose}"]`)).toBeVisible();
  }
});

test("the moods differ where Design.md §3 says they differ", async ({ page }) => {
  const pose = (name: string) =>
    page.locator("figure").filter({ hasText: new RegExp(`^${name}$`) }).locator("svg");

  // Eyes carry the emotion: open, half-closed when thirsty, closed when dozing.
  await expect(pose("default").locator('[data-eyes="open"]')).toHaveCount(1);
  await expect(pose("thirsty").locator('[data-eyes="half"]')).toHaveCount(1);
  await expect(pose("sleepy").locator('[data-eyes="closed"]')).toHaveCount(1);

  // A thirsty Bud's leaves droop; nobody else's are turned at all.
  await expect(pose("thirsty").locator("[data-leaf][transform]")).toHaveCount(2);
  await expect(pose("default").locator("[data-leaf][transform]")).toHaveCount(0);

  // A sprout has one leaf and a smaller everything; the rest keep both leaves.
  await expect(pose("sprout").locator("[data-leaf]")).toHaveCount(1);
  await expect(pose("bloom").locator("[data-leaf]")).toHaveCount(2);

  // The root-toes are in every pose — Design.md §3 calls them Bud's signature.
  for (const name of ["sprout", "default", "bloom", "thirsty", "sleepy"]) {
    await expect(pose(name).locator("[data-toes]"), `${name} keeps its toes`).toHaveCount(1);
  }
});

test("a mood still reads at 24px, where most of Bud is gone", async ({ page }) => {
  // The player's top bar. The eyes and the crown are all that is left to carry it.
  const thirsty = swatch(page, "24 — thirsty").locator("svg");
  await expect(thirsty).toHaveAttribute("data-detail", "simple");
  await expect(thirsty.locator('[data-eyes="half"]')).toHaveCount(1);

  await expect(swatch(page, "24 — sleepy").locator('svg [data-eyes="closed"]')).toHaveCount(1);
  // A sprout has one leaf; every other pose has both.
  await expect(swatch(page, "24 — sprout").locator("svg [data-leaf]")).toHaveCount(1);
  await expect(swatch(page, "24 — default").locator("svg [data-leaf]")).toHaveCount(2);
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
