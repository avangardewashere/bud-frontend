import { test, expect, type Page } from "@playwright/test";
import { signIn, skipWithoutApi } from "./support/api";

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
  await signIn(page);
});

test("the catalog lists the Docker course with its manifest metadata", async ({ page }) => {
  await page.goto("/catalog");

  await expect(page.getByRole("heading", { name: "Catalog" })).toBeVisible();
  await expect(page.getByText("1 course published")).toBeVisible();

  const card = page.getByRole("article").filter({ hasText: DOCKER.title });
  await expect(card).toBeVisible();
  // Straight from bud.manifest.json, by way of the API.
  await expect(card.getByText("Beginner → Intermediate")).toBeVisible();
  await expect(card.getByText("10 sessions · 30h")).toBeVisible();
  await expect(card.getByText("docker", { exact: true })).toBeVisible();
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

  // Enrolled: the meter is at zero of ten and the player is promised, not linked.
  await expect(page.getByText("0 / 10")).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue · Session 1/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Unenroll" })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Your courses" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nothing planted yet." })).toBeHidden();

  // Put the shared dev database back the way it was found.
  await ensureUnenrolled(page);
});
