import { test, expect } from "@playwright/test";
import { ADMIN, signIn, skipWithoutApi } from "./support/api";

/**
 * Block 5 — the shell, the login screen (mockup 1a) and the dashboard.
 *
 * These drive the real screens against the real API, so they cover the thing unit
 * tests cannot: that the session survives the hop between the shell on :3100 and the
 * API on :3102, and that server components see it.
 */

test.beforeEach(async ({ page }) => {
  await skipWithoutApi(page);
});

test("a signed-out visitor is sent to the login screen", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);

  // Bud on this card is decorative — the wordmark beneath it carries the name,
  // so the illustration is aria-hidden rather than announced twice.
  await expect(page.getByText("Glad you showed up.")).toBeVisible();
  await expect(page.getByText("Signup is invite-only for now.")).toBeVisible();

  /**
   * Block 20 retired the disabled placeholder this used to assert. GitHub is a real
   * link now, and it appears only where the API reports it configured — so what the
   * shell must never do is offer a *dead* one. Which of the two is right for this
   * deployment is account.spec's business; here it is enough that nothing on the card
   * is a button that cannot be pressed.
   */
  await expect(page.getByRole("button", { name: /Continue with GitHub/ })).toBeHidden();
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeEnabled();
});

test("the root path leads to the dashboard", async ({ page }) => {
  await signIn(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("a wrong password says so, in Bud's voice", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  // Scoped to the form: Next's route announcer is also role="alert".
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "That email and password don't match.",
  );
  await expect(page).toHaveURL(/\/login$/);
});

test("signing in lands on the dashboard, greeted by name", async ({ page, context }) => {
  await signIn(page);

  // The session is an httpOnly cookie owned by the API: script on any page —
  // including a course's — must not be able to read it.
  const session = (await context.cookies()).find((c) => c.name === "bud_session");
  expect(session, "the API should have set bud_session").toBeTruthy();
  expect(session?.httpOnly, "the session cookie must be httpOnly").toBe(true);

  /**
   * The greeting itself is moods.spec's and theme.spec's business, and after block 19
   * its first two words depend on the hour where the test is running. This one cares
   * that it is greeted by name, so that is what it asks.
   */
  await expect(page.getByRole("heading", { level: 1 })).toContainText(ADMIN.firstName);

  // Deliberately says nothing about enrollment: catalog.spec owns that state, and
  // asserting it here would make this test depend on another file's leftovers.
  await expect(page.getByRole("banner")).toBeVisible();
});

test("the nav shows Admin to an admin, and marks the current section", async ({ page }) => {
  await signIn(page);

  const nav = page.getByRole("banner");
  await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("link", { name: "Catalog" })).toBeVisible();
  /**
   * mockup 1j is a learner and has no Admin item; the seeded user is an admin.
   * `exact`, because block 20 made the avatar a link to /account labelled
   * "Account — Bud Admin", which a substring match claims as a second Admin nav item.
   */
  await expect(nav.getByRole("link", { name: "Admin", exact: true })).toBeVisible();
});

test("Browse the catalog goes somewhere real", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Browse the catalog" }).click();

  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.getByRole("heading", { name: "Catalog" })).toBeVisible();
});

test("signing out ends the session for server components too", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  // The real check: a fresh server-rendered request must also see no session.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});
