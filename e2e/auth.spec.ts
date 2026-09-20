import { test, expect, type Page } from "@playwright/test";
import { ADMIN, skipWithoutApi } from "./support/api";

/**
 * Block 2 — the typed client against the real API.
 *
 * These are the only tests that need a second service: the Bud API on 3102 with
 * Postgres behind it. Rather than fail for the wrong reason when it is not running,
 * they skip with a message saying so — a red suite should mean the frontend broke.
 *
 * Credentials come from the backend's seed (SEED_ADMIN_PASSWORD in its .env).
 */

const status = (page: Page) => page.getByTestId("status");
const user = (page: Page) => page.getByTestId("user");

test.beforeEach(async ({ page }) => {
  await skipWithoutApi(page);
  await page.goto("/dev/auth");
});

test("signing in returns the user and sets the session cookie", async ({ page, context }) => {
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(status(page)).toHaveText(`Signed in as ${ADMIN.email}`);
  await expect(user(page)).toContainText(`"role": "admin"`);
  // The unified PublicUser shape, not the narrower one /me used to return.
  await expect(user(page)).toContainText(`"timezone"`);
  await expect(user(page)).toContainText(`"createdAt"`);

  const session = (await context.cookies()).find((c) => c.name === "bud_session");
  expect(session, "the API should have set bud_session").toBeTruthy();
  expect(session?.httpOnly, "the session cookie must be httpOnly").toBe(true);
});

test("the session survives a page reload", async ({ page }) => {
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(status(page)).toContainText("Signed in");

  // A reload throws away every bit of in-page state, so anything that survives
  // came back from the cookie.
  await page.reload();
  await page.getByRole("button", { name: "Who am I" }).click();

  await expect(status(page)).toHaveText(`/me says ${ADMIN.email} (admin)`);
});

test("signing out clears the session", async ({ page }) => {
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(status(page)).toContainText("Signed in");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(status(page)).toHaveText("Signed out");

  await page.getByRole("button", { name: "Who am I" }).click();
  await expect(status(page)).toHaveText("/me says nobody is signed in");
});

test("a bad password surfaces the API's error envelope", async ({ page }) => {
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  // BudApiError, carrying the status from the envelope rather than a generic failure.
  await expect(status(page)).toContainText("401");
  await expect(user(page)).toHaveText("no user");
});
