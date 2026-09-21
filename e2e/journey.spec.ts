import { test, expect } from "@playwright/test";
import { LEARNER, signIn, skipWithoutApi } from "./support/api";

/**
 * One continuous path through Bud, as a person would actually walk it: arrive
 * signed out, sign in, find the course, start it, do some work, finish a session,
 * and see it counted.
 *
 * The other specs each prove one screen in isolation. This one exists to catch the
 * failures that only appear between them — a link to a route that does not exist, a
 * screen that does not reflect what the previous one just changed, a number that
 * disagrees with the number before it.
 */

const SLUG = "docker-fundamentals";

test("a learner can arrive, start the Docker course and finish a session", async ({
  page,
}) => {
  await skipWithoutApi(page);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());

  // Arrive at nothing in particular, signed out.
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Glad you showed up.")).toBeVisible();

  await signIn(page, LEARNER);

  // Start from a clean slate: unenrolled, so the dashboard is the seed state.
  await page.goto(`/courses/${SLUG}`);
  const unenroll = page.getByRole("button", { name: "Unenroll" });
  if (await unenroll.isVisible().catch(() => false)) await unenroll.click();

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Nothing planted yet." })).toBeVisible();

  // Find the course the way someone would.
  await page.getByRole("link", { name: "Browse the catalog" }).click();
  await page.getByRole("article").filter({ hasText: "Docker" }).getByRole("link").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Docker");

  // Enrol, then open the first session from the course page.
  await page.getByRole("button", { name: "Start this course" }).click();
  await page.getByRole("link", { name: /Session 1/ }).click();
  await expect(page).toHaveURL(new RegExp(`/learn/${SLUG}/s1$`));
  // The worksheet's listeners are attached by a script at the end of its document.
  await expect(page.getByText("Opening the session…")).toBeHidden();

  // Do some work. uncheck-then-check guarantees a change event whatever the
  // starting state; check() alone on a ticked box saves nothing.
  const frame = page.frameLocator('iframe[title*="Docker"]');
  await frame.locator("#t1").uncheck({ force: true });
  await frame.locator("#t1").check({ force: true });
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

  // Finish the session and walk back out to the dashboard.
  await page.getByRole("button", { name: "Mark complete" }).click();
  await expect(page.getByRole("button", { name: "Mark not complete" })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Your courses" })).toBeVisible();
  await expect(page.getByText("1 / 10 sessions")).toBeVisible();

  // The Continue card should now offer the next session rather than the finished
  // one — the behaviour the backend corrected after the player landed.
  await expect(page.getByText(/Session 2 ·/)).toBeVisible();

  // And the same count reaches the catalog card, from a different endpoint.
  await page.goto("/catalog");
  await expect(
    page.getByRole("article").filter({ hasText: "Docker" }),
  ).toContainText("1 / 10");
});
