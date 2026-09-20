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

  // Shown because the mockup shows it, disabled because Phase 2 owns it.
  await expect(page.getByRole("button", { name: /Continue with GitHub/ })).toBeDisabled();
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

test("signing in lands on the dashboard, greeted by name", async ({ page }) => {
  await signIn(page);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    `Welcome back, ${ADMIN.firstName}.`,
  );

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
  // mockup 1j is a learner and has no Admin item; the seeded user is an admin.
  await expect(nav.getByRole("link", { name: "Admin" })).toBeVisible();
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
