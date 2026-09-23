import { test, expect } from "@playwright/test";
import { LEARNER, resetProgress, signIn, skipWithoutApi } from "./support/api";

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

  // Start from a clean slate: unenrolled, so the dashboard is the seed state. Waiting
  // for the button to change is waiting for the API to have answered — clicking and
  // walking away leaves the request racing the next page.
  await page.goto(`/courses/${SLUG}`);
  const unenroll = page.getByRole("button", { name: "Unenroll" });
  if (await unenroll.isVisible().catch(() => false)) {
    await unenroll.click();
    await expect(page.getByRole("button", { name: "Start this course" })).toBeVisible();
  }

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Nothing planted yet." })).toBeVisible();

  // Find the course the way someone would.
  await page.getByRole("link", { name: "Browse the catalog" }).click();
  await page.getByRole("article").filter({ hasText: "Docker" }).getByRole("link").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Docker");

  /**
   * Enrol, then open a session from the course page. The panel offers whichever
   * session is next for this learner — progress survives unenrolling — so the rail
   * is where this walk picks session 1 deliberately.
   */
  await page.getByRole("button", { name: "Start this course" }).click();
  // Enrolled for certain, not merely asked for: everything below this line needs the
  // enrolment to exist, and the player redirects away from a course you are not in.
  await expect(page.getByRole("button", { name: "Unenroll" })).toBeVisible();
  /**
   * Enrolled again — and now nothing is finished. Progress outlives unenrolling and
   * the suite shares one learner, so "1 / 10 sessions" below has to be counted from a
   * known zero rather than from whatever the last run left behind. It needs the
   * enrolment, which is why it is here rather than at the top.
   */
  await resetProgress(page, SLUG);
  await page.reload();

  await page.getByRole("link", { name: /· Session \d+$/ }).click();
  await expect(page).toHaveURL(/\/learn\/docker-fundamentals\/s\d+$/);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "The container mental model" })
    .click();
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
