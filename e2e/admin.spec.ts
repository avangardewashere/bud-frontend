import { test, expect } from "@playwright/test";
import { ADMIN, LEARNER, signIn, skipWithoutApi } from "./support/api";

/**
 * Block 9 — admin course management, mockup 1h.
 *
 * The upload tests push a real (deliberately broken) archive at the real API, so the
 * checklist being rendered is the one the server actually produced rather than a
 * fixture that could drift from it.
 */

test.beforeEach(async ({ page }) => {
  await skipWithoutApi(page);
});

test("a learner cannot reach the admin screens", async ({ page }) => {
  await signIn(page, LEARNER);

  const response = await page.goto("/admin/courses");
  // 404 rather than a forbidden page: the shell should not be more informative
  // about what exists than the API is.
  expect(response?.status()).toBe(404);

  await expect(page.getByRole("banner").getByRole("link", { name: "Admin" })).toBeHidden();
});

test("the table lists courses with status, version and enrollments", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto("/admin/courses");

  await expect(page.getByRole("heading", { name: "Courses", level: 1 })).toBeVisible();

  const row = page.getByRole("row").filter({ hasText: "docker-fundamentals" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Published");
  await expect(row).toContainText(/\d+\.\d+\.\d+/);
});

test("the pre-flight refuses a non-zip without troubling the API", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto("/admin/courses");

  let uploaded = false;
  await page.route("**/admin/courses", (route) => {
    if (route.request().method() === "POST") uploaded = true;
    return route.continue();
  });

  await page.setInputFiles('input[type="file"]', {
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not a course"),
  });

  // Filtered: Next's route announcer is also role="alert", and empty.
  await expect(page.getByRole("alert").filter({ hasText: ".zip" })).toBeVisible();
  expect(uploaded, "a non-zip should never be uploaded").toBe(false);
});

test("a broken package comes back as a checklist, not a crash", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto("/admin/courses");

  // Named .zip so it clears the pre-flight, but it is not an archive — the server
  // should answer 201 with ok:false rather than an error.
  await page.setInputFiles('input[type="file"]', {
    name: "broken-course.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("PK not really"),
  });

  const results = page.getByTestId("validation-results");
  await expect(results).toBeVisible();
  await expect(results.locator('[data-code="manifest_missing"]')).toBeVisible();

  // The short honest list: validation stopped, and says so rather than inventing
  // failures for checks that never ran.
  await expect(results.locator('[data-code="checks_skipped"]')).toBeVisible();
  await expect(results.locator('[data-code="checks_skipped"]')).toContainText(/did not run/i);

  await expect(page.getByText("Publish unlocks when the errors are fixed.")).toBeVisible();
});

/**
 * Uploads travel through the shell's /api rewrite, and Next's router cuts request
 * bodies off at 10MB unless told otherwise. A package over that used to reach the API
 * truncated, hang until the proxy gave up, and come back as "Couldn't reach Bud" — for
 * an archive well under the 50MB cap. Any answer from the API proves the whole body
 * arrived: a truncated one never gets one.
 */
test("an archive past Next's default 10MB body limit still reaches the API whole", async ({
  page,
}) => {
  test.slow();
  await signIn(page, ADMIN);
  await page.goto("/admin/courses");

  const uploaded = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().endsWith("/api/admin/courses"),
  );
  await page.setInputFiles('input[type="file"]', {
    name: "large-broken-course.zip",
    mimeType: "application/zip",
    buffer: Buffer.concat([Buffer.from("PK not really"), Buffer.alloc(12 * 1024 * 1024, 0x20)]),
  });

  const response = await uploaded;
  expect(response.headers()["content-type"] ?? "", "the API should have answered").toContain(
    "application/json",
  );
  await expect(page.getByTestId("validation-results")).toBeVisible();
});

test("publishing and unpublishing round-trips", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto("/admin/courses");

  const row = page.getByRole("row").filter({ hasText: "docker-fundamentals" });
  await expect(row).toContainText("Published");

  await row.getByRole("button", { name: "Unpublish" }).click();
  await expect(row).toContainText("draft");

  // Unpublishing is not destructive: the enrolment count survives it.
  await expect(row).toContainText(/\d/);

  await row.getByRole("button", { name: "Publish" }).click();
  await expect(row).toContainText("Published");
});
