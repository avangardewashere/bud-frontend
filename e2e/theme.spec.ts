import { test, expect, type Page } from "@playwright/test";
import { budApi } from "@/lib/api";
import { LEARNER, asSignedIn, signIn, skipWithoutApi } from "./support/api";

/**
 * Block 19 — dark mode (mockup 1k, Design.md §4).
 *
 * Three things are worth proving, and they are the three that go wrong in every
 * dark-mode implementation:
 *
 *   the first paint is already right — no flash, and no script to make it so;
 *   an explicit choice beats the device, and "auto" really does follow it;
 *   the two routes into dark set the same values, because the CSS says them twice.
 */

const APP = "http://localhost:3100";
const SLUG = "docker-fundamentals";
const SOIL = "rgb(28, 25, 23)";
const PAPER = "rgb(250, 250, 247)";

const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

/** Every semantic token, as the browser resolves it — the whole themed surface. */
const TOKENS = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--muted",
  "--muted-foreground",
  "--border",
  "--primary",
  "--primary-foreground",
  "--accent",
  "--accent-foreground",
  "--tint",
  "--tint-foreground",
  "--ring",
  "--danger",
];

const tokens = (page: Page) =>
  page.evaluate((names) => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]));
  }, TOKENS);

test.beforeEach(async ({ page }) => {
  await skipWithoutApi(page);
});

test("the first paint is dark, with no script to make it so", async ({ browser }) => {
  /**
   * JavaScript off, deliberately. The usual way to avoid a flash of light is a
   * blocking inline script that reads localStorage — which this app's nonce CSP
   * refuses (block 11). If the colours are right with no script at all, there is
   * nothing left to flash.
   */
  const context = await browser.newContext({ javaScriptEnabled: false });
  await context.addCookies([{ name: "bud_theme", value: "dark", url: APP }]);
  const page = await context.newPage();

  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await background(page)).toBe(SOIL);

  await context.close();
});

test("an explicit choice beats the device, both ways", async ({ browser }) => {
  for (const [choice, device, expected] of [
    ["light", "dark", PAPER],
    ["dark", "light", SOIL],
  ] as const) {
    const context = await browser.newContext({ colorScheme: device });
    await context.addCookies([{ name: "bud_theme", value: choice, url: APP }]);
    const page = await context.newPage();

    await page.goto("/login");
    expect(await background(page), `${choice} chosen on a ${device} device`).toBe(expected);
    await context.close();
  }
});

test("auto follows the device, and changes with it", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  // No cookie at all: "system" is what someone gets before they ever choose.
  const page = await context.newPage();

  await page.goto("/login");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  expect(await background(page), "a dark device gets the dark theme").toBe(SOIL);

  // Some systems switch at sunset; the page should not need reloading for that.
  await page.emulateMedia({ colorScheme: "light" });
  expect(await background(page), "and follows it when it changes").toBe(PAPER);

  await context.close();
});

/**
 * The drift guard the CSS comment promises. Dark is written twice — once for the
 * attribute, once inside a prefers-color-scheme block — because a selector list cannot
 * span a media query. This is what stops the copy quietly diverging from the original.
 */
test("both routes into dark set the same values, token for token", async ({ browser }) => {
  const chosen = await browser.newContext({ colorScheme: "light" });
  await chosen.addCookies([{ name: "bud_theme", value: "dark", url: APP }]);
  const chosenPage = await chosen.newPage();
  await chosenPage.goto("/login");
  const byAttribute = await tokens(chosenPage);

  const device = await browser.newContext({ colorScheme: "dark" });
  const devicePage = await device.newPage();
  await devicePage.goto("/login");
  const byMediaQuery = await tokens(devicePage);

  expect(byMediaQuery).toEqual(byAttribute);

  /**
   * And it is really the dark set. Two empty copies would agree with each other
   * perfectly, which is the one way a drift guard can pass while the thing it guards
   * has been deleted — so every token is checked against the light theme it replaces.
   */
  const light = await browser.newContext({ colorScheme: "light" });
  const lightPage = await light.newPage();
  await lightPage.goto("/login");
  const inTheLight = await tokens(lightPage);

  for (const token of TOKENS) {
    expect(byAttribute[token], `${token} should have a value`).not.toBe("");
  }
  for (const token of ["--background", "--foreground", "--card", "--primary", "--muted", "--danger"]) {
    expect(byAttribute[token], `${token} should differ from the light theme`).not.toBe(
      inTheLight[token],
    );
  }
  expect(await background(devicePage)).toBe(SOIL);
  await light.close();

  await chosen.close();
  await device.close();
});

test("the toggle changes the theme, and the choice outlives the page", async ({ page }) => {
  await signIn(page, LEARNER);

  const toggle = page.getByTestId("theme-toggle");
  await expect(toggle).toBeVisible();
  expect(await background(page)).toBe(PAPER);

  await toggle.getByRole("button", { name: "Dark" }).click();
  expect(await background(page), "the colours turn over at once").toBe(SOIL);
  await expect(toggle.getByRole("button", { name: "Dark" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // The cookie is the point: the next first paint has to agree with this screen.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await background(page)).toBe(SOIL);
  /**
   * And the control agrees with it from the first byte. The server knows the choice —
   * it just used it — so a toggle that renders "Auto" pressed and then corrects itself
   * is a control lying about its own state for a frame.
   */
  await expect(toggle.getByRole("button", { name: "Dark" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await toggle.getByRole("button", { name: "Auto" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  expect(await background(page), "back to the device's own preference").toBe(PAPER);
  // "Auto" is a choice like any other, and has to survive the same way.
  const cookie = (await page.context().cookies()).find((c) => c.name === "bud_theme");
  expect(cookie?.value).toBe("system");
});

test("the toggle is reachable on a phone, where the nav is a tab bar", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await signIn(page, LEARNER);

  // The nav's links move to a bottom bar at this width; the toggle must not go with
  // them, or dark mode would be a setting only a laptop can reach.
  const toggle = page.getByTestId("theme-toggle");
  await expect(toggle).toBeVisible();
  const box = await toggle.boundingBox();
  expect(box!.x + box!.width, "and it fits on the bar").toBeLessThanOrEqual(375);

  await toggle.getByRole("button", { name: "Dark" }).click();
  expect(await background(page)).toBe(SOIL);
  await context.close();
});

test("choosing dark moves Bud there and then, without a reload", async ({ page }) => {
  await signIn(page, LEARNER);
  const auth = await asSignedIn(page);
  await budApi.enroll(SLUG, auth).catch(() => {});
  await budApi.completeSession(SLUG, "s1", auth);

  try {
    await page.clock.setFixedTime(new Date("2026-09-28T12:00:00"));
    await page.goto("/dashboard");

    const bud = page.getByTestId("greeting").locator("svg[data-pose]");
    await expect(bud).toHaveAttribute("data-pose", "default");

    /**
     * The point of the store: everything watching the theme hears about a change, so
     * the face turns over with the colours rather than at the next page load.
     */
    await page.getByTestId("theme-toggle").getByRole("button", { name: "Dark" }).click();
    await expect(bud).toHaveAttribute("data-pose", "sleepy");
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 1000 });
  } finally {
    await budApi.uncompleteSession(SLUG, "s1", auth).catch(() => {});
  }
});

test("in the dark, Bud dozes — whatever the hour", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  await signIn(page, LEARNER);

  /**
   * Mid-course, because only the everyday face dozes: a sprout is a beginning and a
   * bloom is a celebration, and neither is slept through (Design.md §3).
   */
  const auth = await asSignedIn(page);
  await budApi.enroll(SLUG, auth).catch(() => {});
  await budApi.completeSession(SLUG, "s1", auth);

  try {
    // Midday, so only the theme can be what closes Bud's eyes.
    await page.clock.setFixedTime(new Date("2026-09-28T12:00:00"));
    await page.goto("/dashboard");

    const greeting = page.getByTestId("greeting");
    await expect(greeting.locator("svg[data-pose]")).toHaveAttribute("data-pose", "sleepy");
    // But the words are about the clock, not the colours: it is not evening.
    await expect(greeting.getByRole("heading")).toContainText("Welcome back");
  } finally {
    await budApi.uncompleteSession(SLUG, "s1", auth).catch(() => {});
    await context.close();
  }
});
