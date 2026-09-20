import { test, type Page } from "@playwright/test";

/**
 * Shared helpers for the specs that need the real API.
 *
 * Those specs skip with a message when it is not running, rather than failing, so a
 * red suite always means the frontend broke rather than that a sibling service is down.
 */

export const API = "http://localhost:3102";

/** The backend's seeded admin (SEED_ADMIN_PASSWORD in its .env). */
export const ADMIN = {
  email: "admin@bud.local",
  password: "bud-dev-admin-pw",
  /** Greetings use the first name only. */
  firstName: "Bud",
};

let reachable: boolean | undefined;

export async function apiReachable(page: Page) {
  if (reachable === undefined) {
    try {
      const res = await page.request.get(`${API}/ready`, { timeout: 5000 });
      reachable = res.ok();
    } catch {
      reachable = false;
    }
  }
  return reachable;
}

export async function skipWithoutApi(page: Page) {
  test.skip(
    !(await apiReachable(page)),
    `Bud API not reachable at ${API} — start it with "npm run start:dev" in "Bud - backend".`,
  );
}

/** Signs in through the real login screen and waits for the dashboard. */
export async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  // "Continue" alone also matches "Continue with GitHub".
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForURL("**/dashboard");
}
