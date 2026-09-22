import { expect, test, type Page } from "@playwright/test";

/**
 * Shared helpers for the specs that need the real API.
 *
 * Those specs skip with a message when it is not running, rather than failing, so a
 * red suite always means the frontend broke rather than that a sibling service is down.
 */

/**
 * Where the API really is — the same BUD_API_ORIGIN the shell forwards /api to, so
 * the suite probes, and asserts against, the API the shell under test is using.
 * Test-side only: the browser never calls it directly.
 */
export const API = (process.env.BUD_API_ORIGIN ?? "http://localhost:3102").replace(/\/+$/, "");

/** The backend's seeded admin (SEED_ADMIN_PASSWORD in its .env). */
export const ADMIN = {
  email: "admin@bud.local",
  password: "bud-dev-admin-pw",
  /** Greetings use the first name only. */
  firstName: "Bud",
};

/**
 * A learner with no enrolments.
 *
 * Anything that changes enrolment or progress runs as this user, not the admin:
 * both sessions working on Bud share one database, and the admin account collects
 * whatever the backend's own testing leaves behind — it already carries a completed
 * session and a deliberately mistyped storage key. Tests that assume a clean slate
 * have to own the account they assume it about.
 *
 * Admin-only assertions (the Admin nav item) stay on ADMIN, since this user is a
 * learner and correctly cannot see them.
 */
export const LEARNER = {
  email: "learner@bud.local",
  password: "learner-password-123",
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

/**
 * Opens a session and waits for the course to be interactive.
 *
 * The wait is not optional. A worksheet's checkboxes exist the moment the HTML
 * parses, but the script that attaches their change listeners runs at the end of the
 * document — so ticking in between toggles the box with nobody listening, nothing is
 * saved, and the test fails as though the bridge were broken. The player's own
 * loading overlay clears on the frame's load event, which is after scripts have run.
 */
export async function openSession(page: Page, slug: string, sessionKey: string) {
  await page.goto(`/learn/${slug}/${sessionKey}`);
  await expect(page.getByText("Opening the session…")).toBeHidden();
  await expect(page.frameLocator('iframe[title*="Docker"]').locator("#t1")).toBeVisible();
}

/** Signs in through the real login screen and waits for the dashboard. */
export async function signIn(
  page: Page,
  who: { email: string; password: string } = ADMIN,
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  // "Continue" alone also matches "Continue with GitHub".
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForURL("**/dashboard");
}
