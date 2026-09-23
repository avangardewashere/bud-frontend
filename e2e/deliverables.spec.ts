import { test, expect, type Page } from "@playwright/test";
import { budApi, type Deliverable } from "@/lib/api";
import { LEARNER, asSignedIn, openSession, signIn, skipWithoutApi } from "./support/api";

/**
 * Block 16 — handing in what a session asked for, and the dashboard sections that
 * read the result.
 *
 * A deliverable is a link the learner types: a repo, a gist, a live page. Two rules
 * run through everything here.
 *
 * **Nothing typed is ever lost.** Every failure leaves the box exactly as it was —
 * the address of a thing someone spent an evening building is not something a failed
 * request gets to swallow.
 *
 * **A learner's URL is never trusted with an href.** The API refuses anything but
 * http(s) on the way in, the shell refuses it again before it renders one, and this
 * spec proves the shell's check happens before the request is even sent.
 */

const SLUG = "docker-fundamentals";
const SESSION = "s1";
/** A second session, for proving the dashboard only waits on what is finished. */
const OTHER = "s2";

/** What a sleeping API looks like through the rewrite: someone else's HTML. */
const GATEWAY_ERROR = {
  status: 502,
  contentType: "text/html",
  body: "<html><body><h1>502 Bad Gateway</h1></body></html>",
};

const handInToggle = (page: Page) => page.getByRole("button", { name: /^Hand in/ });
const panel = (page: Page) => page.getByRole("region", { name: "Hand in" });
const urlField = (page: Page) => page.getByLabel(/^Link to your work/);
const commentField = (page: Page) => page.getByLabel(/^A note about what you handed in/);
const status = (page: Page) => page.getByTestId("hand-in-status");

async function enrolled(page: Page) {
  await page.goto(`/courses/${SLUG}`);
  const start = page.getByRole("button", { name: "Start this course" });
  if (await start.isVisible().catch(() => false)) await start.click();
  await expect(page.getByRole("button", { name: "Unenroll" })).toBeVisible();
}

/** What the API holds for a session, asked directly rather than read off the screen. */
async function stored(page: Page, key = SESSION): Promise<Deliverable | undefined> {
  const all = await budApi.listDeliverables(SLUG, await asSignedIn(page));
  return all.find((d) => d.sessionKey === key);
}

/** The state every test starts from: enrolled, nothing handed in, nothing finished. */
async function clean(page: Page) {
  const auth = await asSignedIn(page);
  for (const key of [SESSION, OTHER]) {
    await budApi.deleteDeliverable(SLUG, key, auth).catch(() => {});
    await budApi.uncompleteSession(SLUG, key, auth).catch(() => {});
  }
}

test.beforeEach(async ({ page }) => {
  await skipWithoutApi(page);
  await signIn(page, LEARNER);
  await enrolled(page);
  await clean(page);
});

// Whatever a test left, the next spec should not inherit — the suite shares one
// learner, and journey.spec counts finished sessions.
test.afterEach(async ({ page }) => {
  await clean(page).catch(() => {});
});

test("the panel asks for what the manifest asks for, and takes a link", async ({ page }) => {
  const auth = await asSignedIn(page);
  const course = await budApi.getCourse(SLUG, auth);
  const session = course.sessions.find((s) => s.key === SESSION);
  expect(session?.deliverable, "this test needs a session that asks for something").toBeTruthy();

  await openSession(page, SLUG, SESSION);
  await expect(panel(page), "closed until asked for").toBeHidden();
  await handInToggle(page).click();

  // The manifest's own words, not a copy of them written into the shell.
  await expect(page.getByTestId("hand-in-ask")).toHaveText(session!.deliverable!);

  const url = `https://github.com/ari/bud-docker-${Date.now()}`;
  await urlField(page).fill(url);
  await commentField(page).fill("nginx served from a bind mount");
  await panel(page).getByRole("button", { name: "Hand it in" }).click();

  await expect(status(page)).toContainText("Handed in");
  const saved = await stored(page);
  expect(saved?.url).toBe(url);
  expect(saved?.comment).toBe("nginx served from a bind mount");
  expect(saved?.submittedAt, "submitting means submitted").not.toBeNull();

  // The toggle says so without being opened, the way the notes dot does.
  await expect(page.getByRole("img", { name: "you have handed this in" })).toBeVisible();
});

test("the course page carries the link, and it opens away from Bud", async ({ page }) => {
  const url = `https://github.com/ari/bud-course-page-${Date.now()}`;
  await budApi.saveDeliverable(SLUG, SESSION, { url }, await asSignedIn(page));

  await page.goto(`/courses/${SLUG}`);
  const link = page.getByRole("link", { name: new RegExp(url.replace("https://", "")) });
  await expect(link).toHaveAttribute("href", url);
  // A link a learner typed: the page it opens gets no handle on this tab.
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noreferrer/);
  await expect(page.getByRole("listitem").filter({ has: link })).toContainText("Handed in");
});

test("a link that is not http(s) never leaves the browser", async ({ page }) => {
  let sent = false;
  await page.route("**/api/me/courses/*/sessions/*/deliverable", async (route) => {
    sent = true;
    await route.continue();
  });

  await openSession(page, SLUG, SESSION);
  await handInToggle(page).click();
  await urlField(page).fill("javascript:alert(document.cookie)");
  await panel(page).getByRole("button", { name: "Hand it in" }).click();

  await expect(panel(page).getByRole("alert")).toContainText("http://");
  expect(sent, "the shell refuses it without asking the API").toBe(false);
  expect(await stored(page)).toBeUndefined();
  // And what they typed is still there to be fixed, not wiped.
  await expect(urlField(page)).toHaveValue("javascript:alert(document.cookie)");
});

test("retracting keeps the link, removing asks first and then takes it away", async ({ page }) => {
  const url = `https://github.com/ari/bud-retract-${Date.now()}`;
  await budApi.saveDeliverable(SLUG, SESSION, { url, comment: "first pass" }, await asSignedIn(page));

  await openSession(page, SLUG, SESSION);
  await handInToggle(page).click();
  await expect(urlField(page)).toHaveValue(url);

  await panel(page).getByRole("button", { name: "Retract" }).click();
  await expect(status(page)).toContainText("Kept, not handed in");
  // Retract takes its own button away with it; focus must not fall to the document.
  await expect(panel(page).getByRole("button", { name: "Hand it in" })).toBeFocused();
  const retracted = await stored(page);
  expect(retracted?.submittedAt, "retracted").toBeNull();
  expect(retracted?.url, "but the link survives it").toBe(url);

  // Removing throws away something Bud cannot get back, so it asks.
  await panel(page).getByRole("button", { name: "Remove", exact: true }).click();
  expect(await stored(page), "asking is not doing").toBeTruthy();
  // The same button, asking again — so the keyboard's focus is still on it.
  await panel(page).getByRole("button", { name: "Remove it?" }).click();

  await expect(status(page)).toBeHidden();
  await expect(urlField(page)).toHaveValue("");
  await expect(urlField(page), "and the cursor lands where the next link goes").toBeFocused();
  expect(await stored(page)).toBeUndefined();
});

test("an edit made while a save is in flight survives the answer", async ({ page }) => {
  await openSession(page, SLUG, SESSION);
  await handInToggle(page).click();

  const url = `https://github.com/ari/bud-inflight-${Date.now()}`;
  await urlField(page).fill(url);

  // Hold the save open, so there is a window to keep typing in — the same window that
  // cost a note in block 15, when the answer to an old request refilled the box.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/me/courses/*/sessions/*/deliverable", async (route) => {
    await held;
    await route.continue();
  });

  await panel(page).getByRole("button", { name: "Hand it in" }).click();
  await commentField(page).fill("added while it was saving");
  release();

  await expect(status(page)).toContainText("Handed in");
  await expect(
    commentField(page),
    "the answer is about what was sent, not about what has been typed since",
  ).toHaveValue("added while it was saving");
  expect((await stored(page))?.url).toBe(url);
});

test("a save the API slept through leaves the link in the box", async ({ page }) => {
  await openSession(page, SLUG, SESSION);
  await handInToggle(page).click();

  const url = `https://github.com/ari/bud-asleep-${Date.now()}`;
  await urlField(page).fill(url);
  await page.route("**/api/me/courses/*/sessions/*/deliverable", (route) =>
    route.fulfill(GATEWAY_ERROR),
  );
  await panel(page).getByRole("button", { name: "Hand it in" }).click();

  // The client retries a gateway error twice before giving up (4s, then 12s).
  await expect(panel(page).getByRole("alert")).toContainText("waking up", { timeout: 40_000 });
  await expect(urlField(page), "nothing typed is lost by a failure").toHaveValue(url);
  expect(await stored(page)).toBeUndefined();
});

test("a link typed but not handed in survives closing the panel", async ({ page }) => {
  await openSession(page, SLUG, SESSION);
  await handInToggle(page).click();

  const url = `https://github.com/ari/bud-draft-${Date.now()}`;
  await urlField(page).fill(url);
  // Escape is a reflex in a text field, and it closed the panel — which used to take
  // the only copy of the link with it.
  await urlField(page).press("Escape");
  await expect(panel(page)).toBeHidden();

  await handInToggle(page).click();
  await expect(urlField(page), "the tab remembers what the page never saw").toHaveValue(url);
  expect(await stored(page), "and nothing was handed in on anyone's behalf").toBeUndefined();
});

test("signing out takes the typed link with it", async ({ page }) => {
  await openSession(page, SLUG, SESSION);
  await handInToggle(page).click();
  await urlField(page).fill(`https://github.com/ari/bud-private-${Date.now()}`);

  // Closing first, so the only copy is the one this tab is holding.
  await urlField(page).press("Escape");

  /**
   * Every step from here is a click, never a page load: a reload would clear the tab's
   * memory on its own and prove nothing. This is the path a second person on one
   * laptop actually walks.
   */
  await page.getByRole("link", { name: "Back to the course" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill(LEARNER.email);
  await page.getByLabel("Password").fill(LEARNER.password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForURL("**/dashboard");

  // The Continue card leads back to the session this test opened.
  await page.getByRole("link", { name: /^(Continue|Start)$/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`/learn/${SLUG}/${SESSION}$`));
  await expect(page.getByText("Opening the session…")).toBeHidden();

  await handInToggle(page).click();
  await expect(urlField(page), "not left lying around for whoever signs in next").toHaveValue("");
});

test("a removed link does not come back when the panel is reopened", async ({ page }) => {
  const url = `https://github.com/ari/bud-removed-${Date.now()}`;
  await budApi.saveDeliverable(SLUG, SESSION, { url }, await asSignedIn(page));

  await openSession(page, SLUG, SESSION);
  await handInToggle(page).click();
  await panel(page).getByRole("button", { name: "Remove", exact: true }).click();
  await panel(page).getByRole("button", { name: "Remove it?" }).click();
  await expect(status(page)).toBeHidden();

  // Straight back in, while the page's own copy is still the one from before the
  // removal: the panel must believe this tab, not the page it was rendered from.
  await handInToggle(page).click();
  await handInToggle(page).click();
  await expect(urlField(page)).toHaveValue("");
  await expect(status(page)).toBeHidden();
  expect(await stored(page)).toBeUndefined();
});

test("the API's own refusals are shown where they belong", async ({ page }) => {
  await openSession(page, SLUG, SESSION);
  await handInToggle(page).click();
  const url = "https://github.com/ari/bud";
  await urlField(page).fill(url);

  const envelope = (body: Record<string, unknown>) => ({
    status: body.statusCode as number,
    contentType: "application/json",
    body: JSON.stringify({ path: "/me/courses", timestamp: new Date().toISOString(), ...body }),
  });

  // A field-level refusal lands against the field, not in a general heap.
  await page.route("**/api/me/courses/*/sessions/*/deliverable", (route) =>
    route.fulfill(
      envelope({
        statusCode: 400,
        error: "Bad Request",
        code: "validation_failed",
        message: "Validation failed",
        errors: [{ path: "url", message: "Must be an http or https URL", code: "invalid_format" }],
      }),
    ),
  );
  await panel(page).getByRole("button", { name: "Hand it in" }).click();
  await expect(panel(page).getByRole("alert")).toContainText("Must be an http or https URL");
  await expect(urlField(page)).toHaveAttribute("aria-invalid", "true");
  await expect(urlField(page), "and the link is still there to fix").toHaveValue(url);

  // One that is about the learner rather than the link is said as a whole.
  await page.unroute("**/api/me/courses/*/sessions/*/deliverable");
  await page.route("**/api/me/courses/*/sessions/*/deliverable", (route) =>
    route.fulfill(
      envelope({
        statusCode: 403,
        error: "Forbidden",
        code: "not_enrolled",
        message: "You are not enrolled in this course.",
      }),
    ),
  );
  await panel(page).getByRole("button", { name: "Hand it in" }).click();
  await expect(panel(page).getByRole("alert")).toContainText("not enrolled");
});

test("marking complete against a sleeping API says nothing was recorded", async ({ page }) => {
  await openSession(page, SLUG, SESSION);
  await page.route("**/api/me/courses/*/sessions/*/complete", (route) =>
    route.fulfill(GATEWAY_ERROR),
  );

  await page.getByRole("button", { name: "Mark complete" }).click();
  // Retried twice first (4s, then 12s), as every waking call is. Filtered because
  // Next's own route announcer is an alert too, and an empty one.
  await expect(
    page.getByRole("alert").filter({ hasText: "Nothing was recorded" }),
  ).toBeVisible({ timeout: 40_000 });
  await expect(page.getByRole("button", { name: "Mark complete" })).toBeEnabled();
});

test("finishing a session opens the panel, since that is when it is owed", async ({ page }) => {
  await openSession(page, SLUG, SESSION);
  await expect(panel(page)).toBeHidden();

  await page.getByRole("button", { name: "Mark complete" }).click();
  await expect(page.getByRole("button", { name: "Mark not complete" })).toBeVisible();
  await expect(panel(page), "the moment the link is owed").toBeVisible();
  // Opened, not submitted: nothing is claimed on anyone's behalf.
  expect(await stored(page)).toBeUndefined();
});

test("on a phone the waking notice never covers the hand-in panel", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openSession(page, SLUG, SESSION);
  await handInToggle(page).click();
  await urlField(page).fill(`https://github.com/ari/bud-notice-${Date.now()}`);

  // A slow hand-in raises the notice while the panel is on screen — which is exactly
  // when the panel is saying "your link is still here", and exactly what the notice
  // was landing on top of.
  await page.route("**/api/me/courses/*/sessions/*/deliverable", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 7000));
    await route.continue();
  });
  await panel(page).getByRole("button", { name: "Hand it in" }).click();

  const notice = page.getByTestId("waking-notice");
  await expect(notice).toBeVisible({ timeout: 10_000 });
  const card = await notice.boundingBox();
  const form = await panel(page).boundingBox();
  expect(card && form).toBeTruthy();
  const overlaps = card!.y < form!.y + form!.height && form!.y < card!.y + card!.height;
  expect(overlaps, "the notice covers the panel it is talking about").toBe(false);
});

test("the dashboard waits on finished sessions only, and stops once they are in", async ({
  page,
}) => {
  const auth = await asSignedIn(page);
  const course = await budApi.getCourse(SLUG, auth);
  const finished = course.sessions.find((s) => s.key === SESSION)!;
  const untouched = course.sessions.find((s) => s.key === OTHER)!;
  await budApi.completeSession(SLUG, SESSION, auth);

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Waiting to hand in" })).toBeVisible();
  const waiting = page.getByRole("link", { name: new RegExp(finished.title) });
  await expect(waiting).toBeVisible();
  await expect(waiting).toContainText(finished.deliverable!.slice(0, 30));
  // A session nobody has started is the syllabus, not a debt.
  await expect(page.getByRole("link", { name: new RegExp(untouched.title) })).toBeHidden();

  // It leads to the session it is about.
  await waiting.click();
  await expect(page).toHaveURL(new RegExp(`/learn/${SLUG}/${SESSION}$`));

  await budApi.saveDeliverable(
    SLUG,
    SESSION,
    { url: `https://github.com/ari/bud-dash-${Date.now()}` },
    auth,
  );
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: new RegExp(finished.title) })).toBeHidden();
});

test("a note reaches the dashboard, as the text it is", async ({ page }) => {
  const auth = await asSignedIn(page);
  const marker = `Dashboard shows this ${Date.now()}`;
  // A heading, so the card can prove it renders the excerpt rather than the Markdown.
  await budApi.saveNote(SLUG, SESSION, `# ${marker}\n\nAnd a second line.`, auth);

  try {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Recent notes" })).toBeVisible();
    const card = page.getByRole("link", { name: new RegExp(marker) });
    await expect(card, "the excerpt is text, not markup").toContainText(`# ${marker}`);
    await expect(card.getByRole("heading")).toHaveCount(0);

    await card.click();
    await expect(page).toHaveURL(new RegExp(`/courses/${SLUG}/notes$`));
  } finally {
    await budApi.saveNote(SLUG, SESSION, "", auth).catch(() => {});
  }
});
