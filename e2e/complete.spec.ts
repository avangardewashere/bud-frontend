import { test, expect, type Page } from "@playwright/test";
import { budApi } from "@/lib/api";
import { LEARNER, asSignedIn, signIn, skipWithoutApi } from "./support/api";

/**
 * Block 18 — the end of a course (mockup 1i).
 *
 * The walk is done on `cover-check`, the one-session fixture, on purpose. A course
 * with one session reaches its ending in a single press, so this tests the *ending*
 * rather than ten sessions of clicking — and it catches the copy being hard-coded to
 * the Docker course's ten, which is exactly what the mockup's own wording invites.
 *
 * It is also a course nothing else asserts on, so finishing it leaves the shared
 * learner as the rest of the suite expects. The teardown still puts it back.
 */

const SLUG = "cover-check";
const SESSION = "s1";
const DOCKER = "docker-fundamentals";

const heading = (page: Page) => page.getByRole("heading", { level: 1 });

/** Enrolled, nothing finished: the state every test here starts from. */
async function freshlyEnrolled(page: Page) {
  const auth = await asSignedIn(page);
  await budApi.enroll(SLUG, auth).catch(() => {});
  await budApi.uncompleteSession(SLUG, SESSION, auth).catch(() => {});
}

test.beforeEach(async ({ page }) => {
  await skipWithoutApi(page);
  await signIn(page, LEARNER);
});

/**
 * The one-session fixture has to be published for the walk. The skip lives here rather
 * than in beforeEach so it takes only the tests that need it with it — a missing
 * fixture used to skip the Docker-course tests too, and a block can be wholly broken
 * on a run that looks green.
 */
async function needsCoverCheck(page: Page) {
  const published = await budApi.listCourses(await asSignedIn(page));
  test.skip(
    !published.courses.some((course) => course.slug === SLUG),
    `${SLUG} is not published — upload courses/cover-check/1.0.0 through /admin/courses`,
  );
  await freshlyEnrolled(page);
}

// Whatever a test finished, the learner goes back to owning nothing here.
test.afterEach(async ({ page }) => {
  const auth = await asSignedIn(page).catch(() => null);
  if (!auth) return;
  await budApi.deleteDeliverable(SLUG, SESSION, auth).catch(() => {});
  await budApi.deleteNote(SLUG, SESSION, auth).catch(() => {});
  await budApi.uncompleteSession(SLUG, SESSION, auth).catch(() => {});
  await budApi.unenroll(SLUG, auth).catch(() => {});
});

test("there is no ending for a course you have not finished", async ({ page }) => {
  await needsCoverCheck(page);
  await page.goto(`/courses/${SLUG}/complete`);
  // Not a 404: the truth about where they are is on the course page.
  await expect(page).toHaveURL(new RegExp(`/courses/${SLUG}$`));

  // Nor for one you are not in at all.
  await budApi.unenroll(SLUG, await asSignedIn(page));
  await page.goto(`/courses/${SLUG}/complete`);
  await expect(page).toHaveURL(new RegExp(`/courses/${SLUG}$`));
});

test("finishing the last session ends the course, and says so in its own numbers", async ({
  page,
}) => {
  await needsCoverCheck(page);
  await page.goto(`/learn/${SLUG}/${SESSION}`);
  // The worksheet's own scripts run last; clicking before that is clicking at nothing.
  await expect(page.getByText("Opening the session…")).toBeHidden();
  const pressedAt = Date.now();
  await page.getByRole("button", { name: "Mark complete" }).click();

  // The flower opens first (block 17), then the course's own ending takes the screen.
  await expect(page).toHaveURL(new RegExp(`/courses/${SLUG}/complete$`), { timeout: 15_000 });
  expect(
    Date.now() - pressedAt,
    "the ending waits for the bloom rather than cutting the moment off",
  ).toBeGreaterThan(1000);

  // Exactly: Next's route announcer reads the page title, which contains it too.
  await expect(page.getByText("Course complete", { exact: true })).toBeVisible();
  // One session, not ten: the copy is built from the course.
  await expect(heading(page)).toContainText("One session. A whole course.");
  await expect(heading(page)).toContainText("Bud is very pleased.");

  const course = await budApi.getCourse(SLUG, await asSignedIn(page));
  await expect(
    page.getByText(`${course.title} · 1 / 1 · 100%`),
    "the numbers are the API's, not the screen's own arithmetic",
  ).toBeVisible();

  /**
   * The plant is in full, with Bud's own flower open beside it (mockup 1i). By test id
   * rather than by role: the scene is decorative, because everything it says is in the
   * words beside it and a screen reader should not hear it twice.
   */
  const scene = page.getByTestId("completion-scene");
  await expect(scene.locator("[data-bloom]"), "the meter's bloom is open").toHaveCount(1);
  await expect(scene.locator('svg[data-pose="bloom"]'), "and so is Bud's").toHaveCount(1);

  await page.getByRole("link", { name: "Back to dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("a finished course keeps its ending, and the notes on it export", async ({ page }) => {
  await needsCoverCheck(page);
  const auth = await asSignedIn(page);
  await budApi.completeSession(SLUG, SESSION, auth);

  // No notes yet: nothing to export, so nothing offers to.
  await budApi.deleteNote(SLUG, SESSION, auth).catch(() => {});
  await page.goto(`/courses/${SLUG}/complete`);
  await expect(page.getByRole("link", { name: "Export notes" })).toBeHidden();

  const marker = `Finished this one ${Date.now()}`;
  await budApi.saveNote(SLUG, SESSION, marker, auth);
  await page.reload();

  const exportLink = page.getByRole("link", { name: "Export notes" });
  await expect(exportLink).toBeVisible();

  // A real download, through the shell's own origin so the session cookie goes too.
  const href = await exportLink.getAttribute("href");
  const file = await page.request.get(new URL(href!, "http://localhost:3100").toString());
  expect(file.ok()).toBe(true);
  expect(file.headers()["content-disposition"]).toContain("attachment");
  expect(await file.text()).toContain(marker);

  await budApi.deleteNote(SLUG, SESSION, auth).catch(() => {});
});

test("the ending says what is still owed, and stops saying it once it is in", async ({
  page,
}) => {
  /**
   * The Docker course, because this is about deliverables and every one of its
   * sessions asks for one — the cover-check fixture asks for nothing, which is what
   * makes it a good course to *finish* and a useless one to owe anything on.
   */
  const auth = await asSignedIn(page);
  await budApi.enroll(DOCKER, auth).catch(() => {});
  const course = await budApi.getCourse(DOCKER, auth);
  const asked = course.sessions.filter((s) => s.deliverable).sort((a, b) => a.order - b.order);
  expect(asked.length, "the Docker course asks for something every session").toBeGreaterThan(0);

  /**
   * Inside the try, all of it. This finishes every session of the course the rest of
   * the suite counts on — journey.spec asserts "1 / 10 sessions" — so nothing that
   * changes the Docker course may sit where a failure could skip the putting back.
   */
  try {
    for (const session of course.sessions) {
      await budApi.completeSession(DOCKER, session.key, auth);
    }
    for (const session of asked) {
      await budApi.deleteDeliverable(DOCKER, session.key, auth).catch(() => {});
    }

    // Finished, but nothing handed in — the screen says so rather than leaving the
    // dashboard to mention it days later.
    await page.goto(`/courses/${DOCKER}/complete`);

    // The numbers on a ten-session course, where "1 / 1 · 100%" would prove nothing.
    await expect(
      page.getByText(`${course.title} · ${course.sessions.length} / ${course.sessions.length} · 100%`),
    ).toBeVisible();
    await expect(heading(page)).toContainText("Ten sessions. A whole course.");

    const owed = page.getByTestId("still-to-hand-in");
    await expect(owed).toBeVisible();
    await expect(owed).toContainText(asked[0].title);
    /**
     * Three, and then a count. Ten of them turned the ending into a chore list with
     * the moment scrolled off the top of a phone — the rest are on the course page.
     */
    await expect(owed.getByRole("listitem")).toHaveCount(Math.min(asked.length, 3) + 1);
    await expect(owed).toContainText(`and ${asked.length - 3} more`);

    // And each one leads back to the session it is about.
    await owed.getByRole("link", { name: new RegExp(asked[0].title) }).click();
    await expect(page).toHaveURL(new RegExp(`/learn/${DOCKER}/${asked[0].key}$`));

    // Handing one in takes it off the list, and nothing else with it.
    await budApi.saveDeliverable(
      DOCKER,
      asked[0].key,
      { url: `https://github.com/ari/docker-${Date.now()}` },
      auth,
    );
    await page.goto(`/courses/${DOCKER}/complete`);
    const left = page.getByTestId("still-to-hand-in");
    await expect(left, "the one handed in is off the list").not.toContainText(asked[0].title);
    await expect(left, "and the count behind it drops by one").toContainText(
      `and ${asked.length - 4} more`,
    );
    // The overflow points at a list that really exists: the dashboard's own.
    await expect(left.getByRole("link", { name: "dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  } finally {
    for (const session of course.sessions) {
      await budApi.uncompleteSession(DOCKER, session.key, auth).catch(() => {});
    }
    await budApi.deleteDeliverable(DOCKER, asked[0].key, auth).catch(() => {});
  }
});

test("the course page leads back to the ending once there is one", async ({ page }) => {
  await needsCoverCheck(page);
  const auth = await asSignedIn(page);

  await page.goto(`/courses/${SLUG}`);
  await expect(page.getByRole("link", { name: "Course complete" })).toBeHidden();

  await budApi.completeSession(SLUG, SESSION, auth);
  await page.reload();
  await page.getByRole("link", { name: "Course complete" }).click();
  await expect(page).toHaveURL(new RegExp(`/courses/${SLUG}/complete$`));
});

test("a course with sessions left does not send anyone to the ending", async ({ page }) => {
  // The Docker course, where finishing one session of ten is just a session.
  const auth = await asSignedIn(page);
  await budApi.enroll(DOCKER, auth).catch(() => {});
  const course = await budApi.getCourse(DOCKER, auth);
  const first = [...course.sessions].sort((a, b) => a.order - b.order)[0];
  await budApi.uncompleteSession(DOCKER, first.key, auth).catch(() => {});

  await page.goto(`/learn/${DOCKER}/${first.key}`);
  await expect(page.getByText("Opening the session…")).toBeHidden();
  await page.getByRole("button", { name: "Mark complete" }).click();
  await expect(page.getByRole("button", { name: "Mark not complete" })).toBeVisible();

  // Long enough that the completion screen's own timer would have fired.
  await page.waitForTimeout(3000);
  await expect(page).toHaveURL(new RegExp(`/learn/${DOCKER}/${first.key}$`));

  await budApi.uncompleteSession(DOCKER, first.key, auth).catch(() => {});
});
