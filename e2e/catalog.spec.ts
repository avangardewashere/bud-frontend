import { test, expect, type Page } from "@playwright/test";
import { budApi } from "@/lib/api";
import { coursesOrigin } from "@/lib/config/origins";
import { coverSrc } from "@/lib/safe-href";
import { LEARNER, asSignedIn, signIn, skipWithoutApi } from "./support/api";

/**
 * Block 6 — catalog (mockup 1e) and course detail (1f), against the real API with
 * the Docker course ingested from its manifest.
 *
 * Enrollment is real state on a shared dev database, so the tests that change it put
 * it back afterwards.
 */

const DOCKER = { slug: "docker-fundamentals", title: "Docker: 10-Session Course" };

async function ensureUnenrolled(page: Page) {
  await page.goto(`/courses/${DOCKER.slug}`);
  const unenroll = page.getByRole("button", { name: "Unenroll" });
  if (await unenroll.isVisible().catch(() => false)) {
    await unenroll.click();
    await expect(page.getByRole("button", { name: "Start this course" })).toBeVisible();
  }
}

test.beforeEach(async ({ page }) => {
  await skipWithoutApi(page);
  // The learner, not the admin: these tests enrol and unenrol, and the admin
  // account carries the backend session's own test progress.
  await signIn(page, LEARNER);
});

test("the catalog lists the Docker course with its manifest metadata", async ({ page }) => {
  await page.goto("/catalog");

  await expect(page.getByRole("heading", { name: "Catalog" })).toBeVisible();
  // Counted from the API rather than assumed: the dev catalog gains a course whenever
  // someone uploads a fixture, and "1 course published" was a hostage to that.
  const { courses } = await budApi.listCourses(await asSignedIn(page));
  await expect(
    page.getByText(
      courses.length === 1 ? "1 course published" : `${courses.length} courses published`,
    ),
  ).toBeVisible();

  const card = page.getByRole("article").filter({ hasText: DOCKER.title });
  await expect(card).toBeVisible();
  // Straight from bud.manifest.json, by way of the API.
  await expect(card.getByText("Beginner → Intermediate")).toBeVisible();
  await expect(card.getByText("10 sessions · 30h")).toBeVisible();
  await expect(card.getByText("docker", { exact: true })).toBeVisible();
});

/**
 * A cover is the one thing on a card that does not come from the API as text: the API
 * hands out a URL, the browser fetches it from the courses origin, and until block 17
 * the shell drew its fallback whatever the API said. Which of those is on screen is
 * decided by what the package shipped, so this test asks the API first.
 */
test("a course that ships a cover shows it; one that does not gets the drawn one", async ({
  page,
}) => {
  const { courses } = await budApi.listCourses(await asSignedIn(page));
  const withCover = courses.find((course) => course.coverUrl);
  const withoutCover = courses.find((course) => !course.coverUrl);

  await page.goto("/catalog");

  if (withoutCover) {
    const drawn = page.getByRole("article").filter({ hasText: withoutCover.title });
    // By test id, not by role: on a card the cover sits inside an aria-hidden link,
    // because the title beside it already says which course this is.
    await expect(drawn.getByTestId("course-cover-drawn")).toBeVisible();
  }

  test.skip(
    !withCover,
    "no published course ships a cover — upload cover-check-1.0.0.zip to cover this",
  );

  const card = page.getByRole("article").filter({ hasText: withCover!.title });
  const image = card.getByTestId("course-cover-image");
  await expect(image).toBeVisible();

  const src = await image.getAttribute("src");
  // Covers are served from the courses origin, which is the only host the shell's
  // img-src allows — anything else is refused before it reaches an <img>.
  expect(new URL(src!).origin).toBe(coursesOrigin());

  /**
   * And it is a real image, not merely a real URL. The backend's own cover bug was
   * exactly this distinction: the string was right and the bytes 404'd, for every
   * cover ever uploaded, for months.
   */
  const fetched = await page.request.get(src!);
  expect(fetched.ok(), `the cover at ${src} should load`).toBe(true);
  expect(
    await image.evaluate((el: HTMLImageElement) => el.naturalWidth),
    "the browser should have decoded it",
  ).toBeGreaterThan(0);
});

test("a cover that does not load leaves a drawn cover, not a broken box", async ({ page }) => {
  const { courses } = await budApi.listCourses(await asSignedIn(page));
  const withCover = courses.find((course) => course.coverUrl);
  test.skip(!withCover, "no published course ships a cover");

  // The failure the card has to survive: the URL is right and the bytes are not there,
  // which is exactly what the API did for months. It must look like a course with no
  // cover, not like a broken page.
  await page.route(withCover!.coverUrl!, (route) => route.fulfill({ status: 404 }));
  await page.goto("/catalog");

  const card = page.getByRole("article").filter({ hasText: withCover!.title });
  await expect(card.getByTestId("course-cover-drawn")).toBeVisible();
  await expect(card.getByTestId("course-cover-image")).toBeHidden();
});

/** The guard that decides what may reach an <img src> at all. */
test("a cover is only ever loaded from the courses origin", () => {
  const origin = coursesOrigin();
  expect(coverSrc(`${origin}/cover-check/1.0.0/assets/cover.png`)).toBe(
    `${origin}/cover-check/1.0.0/assets/cover.png`,
  );
  // Anything off that origin: refused here rather than left for the CSP to block.
  expect(coverSrc("https://evil.example/pixel.png")).toBeNull();
  expect(coverSrc("http://127.0.0.1:9999/cover.png")).toBeNull();
  expect(coverSrc("javascript:alert(1)")).toBeNull();
  expect(coverSrc("data:image/png;base64,iVBORw0KGgo=")).toBeNull();
  expect(coverSrc("/local/cover.png")).toBeNull();
  expect(coverSrc(null)).toBeNull();
  expect(coverSrc("")).toBeNull();
});

test("course detail renders the outline and all ten sessions", async ({ page }) => {
  await page.goto(`/courses/${DOCKER.slug}`);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(DOCKER.title);
  // The shape, not a literal: the version moves every time the course is re-ingested.
  await expect(page.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible();

  // The outline Markdown, rendered — this heading comes from the course package.
  await expect(
    page.getByRole("heading", { name: "How the course is structured" }),
  ).toBeVisible();

  // Scoped to the sessions panel: the outline Markdown names the sessions too.
  const sessions = page.locator("aside").getByRole("listitem");
  await expect(sessions).toHaveCount(10);
  await expect(sessions.first()).toContainText("The container mental model");
  await expect(sessions.last()).toContainText("Running containers in production");
});

test("an unknown course is a 404, not a crash", async ({ page }) => {
  const response = await page.goto("/courses/no-such-course");
  expect(response?.status()).toBe(404);
});

test("enrolling shows progress, and the dashboard stops saying nothing is planted", async ({
  page,
}) => {
  await ensureUnenrolled(page);

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Nothing planted yet." })).toBeVisible();

  await page.goto(`/courses/${DOCKER.slug}`);
  await page.getByRole("button", { name: "Start this course" }).click();

  /**
   * Enrolled: the meter is at zero of ten and the panel's button opens the player.
   *
   * Which session it offers is whichever one is next for this learner, not always
   * the first: progress outlives unenrolling, so hard-coding "Session 1" made this
   * test depend on what every other spec had left behind.
   */
  await expect(page.getByText("0 / 10")).toBeVisible();
  await expect(page.getByRole("link", { name: /· Session \d+$/ })).toHaveAttribute(
    "href",
    /^\/learn\/docker-fundamentals\/s\d+$/,
  );
  await expect(page.getByRole("button", { name: "Unenroll" })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Your courses" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nothing planted yet." })).toBeHidden();

  // Put the shared dev database back the way it was found.
  await ensureUnenrolled(page);
});
