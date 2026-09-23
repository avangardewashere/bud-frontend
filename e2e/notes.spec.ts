import { test, expect, type Page } from "@playwright/test";
import { budApi } from "@/lib/api";
import { LEARNER, openSession, signIn, skipWithoutApi } from "./support/api";

/**
 * Block 15 — the notes panel in the player, and the page that gathers them.
 *
 * Every Docker session asks for a `notes.md` entry. These are where it goes: Bud's
 * own notes, not the worksheet's little boxes inside the frame, which are course
 * state and disappear with a re-upload.
 *
 * Several of these guard one rule, learned the hard way in review: **what the server
 * holds is not "what my last save returned"**. A write in flight, or waiting to be
 * re-sent, has already promised the server a value — and treating those as unsaved
 * made clearing the box do nothing while the queue wrote the deleted note back.
 */

const SLUG = "docker-fundamentals";
const GATEWAY_ERROR = {
  status: 502,
  contentType: "text/html",
  body: "<html><body><h1>502 Bad Gateway</h1></body></html>",
};

const notesButton = (page: Page) =>
  page.getByRole("banner").getByRole("button", { name: /^Notes/ });
const notesDot = (page: Page) =>
  page.getByRole("banner").getByRole("img", { name: "you have notes for this session" });
const panel = (page: Page) => page.getByRole("complementary", { name: "Your notes" });
const editor = (page: Page) => page.getByTestId("note-editor");
/** The panel's own indicator — the player has another one for the worksheet's state. */
const noteSaved = (page: Page) => page.getByRole("status", { name: "Note: Saved" });
const noteStatus = (page: Page, text: string | RegExp) =>
  page.getByRole("status").filter({ hasText: text });

async function enrolled(page: Page) {
  await page.goto(`/courses/${SLUG}`);
  const start = page.getByRole("button", { name: "Start this course" });
  if (await start.isVisible().catch(() => false)) await start.click();
  await expect(page.getByRole("button", { name: "Unenroll" })).toBeVisible();
}

/** The learner's cookie, for asking the API directly what it holds. */
async function auth(page: Page) {
  const cookies = await page.context().cookies();
  return { headers: { cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") } };
}

const serverNote = async (page: Page, key: string) =>
  (await budApi.getNote(SLUG, key, await auth(page)))?.bodyMd ?? null;

async function clearNotes(page: Page, keys: string[]) {
  const as = await auth(page);
  for (const key of keys) await budApi.deleteNote(SLUG, key, as).catch(() => {});
}

const isNotePut = (method: string, url: string) =>
  method === "PUT" && /\/api\/me\/courses\/.+\/sessions\/.+\/notes$/.test(url);

test.beforeEach(async ({ page }) => {
  await skipWithoutApi(page);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await signIn(page, LEARNER);
  await enrolled(page);
});

test("the panel says what the session asks for, and keeps what is written", async ({ page }) => {
  await clearNotes(page, ["s1"]);
  await openSession(page, SLUG, "s1");
  await notesButton(page).click();

  // The manifest's own ask for THIS session, beside the answer — otherwise it is in
  // the worksheet the panel is covering.
  await expect(page.getByTestId("session-ask")).toContainText("This session asks for:");
  await expect(page.getByTestId("session-ask")).toContainText("notes.md");
  // Whose notes these are: not the worksheet's own boxes.
  await expect(panel(page).getByText("kept by Bud, not by the course")).toBeVisible();

  const body = `# Session 1\n\nImages are the blueprint. ${Date.now()}`;
  await editor(page).fill(body);
  await expect(noteSaved(page)).toBeVisible();
  expect(await serverNote(page, "s1")).toBe(body);

  await page.reload();
  // The dot says there is a note without opening the panel.
  await expect(notesDot(page)).toBeVisible();
  await notesButton(page).click();
  await expect(editor(page)).toHaveValue(body);

  await clearNotes(page, ["s1"]);
});

test("the ask follows the session, and so does the note", async ({ page }) => {
  const stamp = Date.now();
  const first = `First session ${stamp}`;
  const second = `Second session ${stamp}`;
  await clearNotes(page, ["s1", "s2"]);
  // Session 2's note exists before it is ever opened, so the assertion is about
  // finding ITS note rather than merely not finding session 1's.
  await budApi.saveNote(SLUG, "s2", second, await auth(page));

  await openSession(page, SLUG, "s1");
  await notesButton(page).click();
  const askedOfSession1 = await page.getByTestId("session-ask").textContent();
  await editor(page).fill(first);
  await expect(noteSaved(page)).toBeVisible();

  await page.getByRole("navigation").getByRole("link", { name: "Next ›", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/learn/${SLUG}/s2$`));
  await notesButton(page).click();
  await expect(editor(page)).toHaveValue(second);
  expect(
    await page.getByTestId("session-ask").textContent(),
    "the ask is per session, not a constant",
  ).not.toBe(askedOfSession1);

  await page.getByRole("navigation").getByRole("link", { name: "‹ Previous", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/learn/${SLUG}/s1$`));
  await expect(page.frameLocator('iframe[title*="Docker"]').locator("#t1")).toBeVisible();
  await notesButton(page).click();
  await expect(editor(page)).toHaveValue(first);

  await clearNotes(page, ["s1", "s2"]);
});

test("clearing the note deletes it rather than saving emptiness", async ({ page }) => {
  await openSession(page, SLUG, "s1");
  await notesButton(page).click();
  await editor(page).fill(`Written, then cleared ${Date.now()}`);
  await expect(noteSaved(page)).toBeVisible();

  await editor(page).fill("");
  await expect(noteSaved(page)).toBeVisible();

  expect(await serverNote(page, "s1")).toBeNull();
  await page.reload();
  await expect(notesDot(page)).toBeHidden();
});

/**
 * The first of the three ways a note came back from the dead. Clearing the box while
 * the first save is still in flight used to do nothing at all: the hook thought the
 * server still held the old value, so "empty" looked like no change, and the write
 * already on its way stored the text that had just been deleted — under "Saved".
 */
test("clearing while the first save is in flight still deletes the note", async ({ page }) => {
  test.slow();
  await clearNotes(page, ["s1"]);
  await openSession(page, SLUG, "s1");
  await notesButton(page).click();

  // A slow API: the save is in flight for four seconds.
  await page.route("**/api/me/courses/**/sessions/**/notes", async (route) => {
    if (isNotePut(route.request().method(), route.request().url())) {
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
    await route.continue();
  });

  const body = `Typed, then deleted before it landed ${Date.now()}`;
  const inFlight = page.waitForRequest((r) => isNotePut(r.method(), r.url()));
  const landed = page.waitForResponse(
    (r) => isNotePut(r.request().method(), r.url()) && (r.request().postData() ?? "").includes(body),
  );
  await editor(page).fill(body);
  await inFlight;
  await editor(page).fill("");

  // Wait for the write the learner deleted mid-flight to actually reach the API —
  // asking before it lands would see the "no note" it started from and prove nothing.
  await landed;
  expect(await serverNote(page, "s1")).toBe(body);

  // Now the deletion has to follow it, rather than the note standing as "Saved".
  await expect
    .poll(() => serverNote(page, "s1"), { timeout: 30_000, message: "the deleted note survived" })
    .toBeNull();
  await expect(notesDot(page)).toBeHidden();
});

/**
 * The second, and the one the free deploy makes easy: the API is asleep, the save
 * fails, the queue keeps it for 30 seconds — and the learner deletes the note in the
 * meantime. The re-send used to write it back.
 */
test("a note deleted while its save was failing does not come back", async ({ page }) => {
  test.slow();
  await clearNotes(page, ["s1"]);
  await openSession(page, SLUG, "s1");
  await notesButton(page).click();

  const doomed = `Written while Bud slept ${Date.now()}`;
  let asleep = true;
  await page.route("**/api/me/courses/**/sessions/**/notes", async (route) => {
    const failing =
      asleep &&
      isNotePut(route.request().method(), route.request().url()) &&
      (route.request().postData() ?? "").includes(doomed);
    return failing ? route.fulfill(GATEWAY_ERROR) : route.continue();
  });

  await editor(page).fill(doomed);
  await expect(noteStatus(page, /waking up|Can't reach/)).toBeVisible({ timeout: 45_000 });

  // The API comes back, and the learner deletes the note before the queue re-sends.
  asleep = false;
  await editor(page).fill("");
  await expect(noteSaved(page)).toBeVisible({ timeout: 20_000 });

  // Past the queue's first re-send delay: the deletion has to be what stands.
  await page.waitForTimeout(35_000);
  expect(await serverNote(page, "s1"), "the re-send resurrected a deleted note").toBeNull();
});

/**
 * The third: the browser's Back button replays a page from its cache, note and all.
 * The tab's own memory of what it wrote has to win, or the panel opens empty for a
 * note that exists and the next keystroke saves the empty box over it.
 */
test("coming back to a session shows the note written since the page was cached", async ({
  page,
}) => {
  test.slow();
  await clearNotes(page, ["s1"]);
  // Opened with no note, so the cached page for s1 carries an empty one.
  await openSession(page, SLUG, "s1");
  await notesButton(page).click();

  const body = `Written after this page was rendered ${Date.now()}`;
  await editor(page).fill(body);
  await expect(noteSaved(page)).toBeVisible();

  await page.getByRole("navigation").getByRole("link", { name: "Next ›", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/learn/${SLUG}/s2$`));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/learn/${SLUG}/s1$`));

  await expect(notesDot(page), "no dot, so the note looked lost").toBeVisible();
  await notesButton(page).click();
  await expect(editor(page)).toHaveValue(body);
  // And the server still has it: nothing overwrote it with the cached empty note.
  expect(await serverNote(page, "s1")).toBe(body);

  await clearNotes(page, ["s1"]);
});

test("closing the panel saves at once, without waiting out the pause", async ({ page }) => {
  await clearNotes(page, ["s1"]);
  await openSession(page, SLUG, "s1");
  await notesButton(page).click();

  let sentAfterMs = Number.POSITIVE_INFINITY;
  const typedAt = { at: 0 };
  await page.route("**/api/me/courses/**/sessions/**/notes", async (route) => {
    if (isNotePut(route.request().method(), route.request().url())) {
      sentAfterMs = Math.min(sentAfterMs, Date.now() - typedAt.at);
    }
    await route.continue();
  });

  const body = `Closed straight after typing ${Date.now()}`;
  typedAt.at = Date.now();
  await editor(page).fill(body);
  await notesButton(page).click(); // closes, which flushes

  await expect.poll(() => serverNote(page, "s1"), { timeout: 15_000 }).toBe(body);
  // The autosave pause is 800ms; a flush beats it rather than waiting it out.
  expect(sentAfterMs, "the close did not flush").toBeLessThan(800);

  await clearNotes(page, ["s1"]);
});

test("preview renders the markdown, never raw HTML, and stays inside the panel", async ({
  page,
}) => {
  await clearNotes(page, ["s1"]);
  await openSession(page, SLUG, "s1");
  await notesButton(page).click();

  const longToken = `sha256:${"a".repeat(220)}`;
  await editor(page).fill(
    [
      "# What clicked",
      "",
      "- containers share a kernel",
      "",
      '<img src=x onerror="alert(1)">',
      "",
      longToken,
    ].join("\n"),
  );
  await expect(noteSaved(page)).toBeVisible();
  await page.getByRole("button", { name: "Preview" }).click();

  const preview = page.getByTestId("note-preview");
  await expect(preview.getByRole("heading", { name: "What clicked" })).toBeVisible();
  await expect(preview.getByRole("listitem")).toHaveText("containers share a kernel");

  // A note is whatever someone pasted into it, so the HTML stays text.
  expect(await preview.locator("img").count(), "raw HTML was rendered").toBe(0);
  await expect(preview).toContainText("<img src=x");

  // An unbroken 200-character token must wrap, not push the panel off screen.
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows, "a long token widened the page").toBe(false);
  expect((await panel(page).boundingBox())!.width).toBeLessThanOrEqual(400);

  await clearNotes(page, ["s1"]);
});

test("the panel can be opened, written in and closed from the keyboard", async ({ page }) => {
  await clearNotes(page, ["s1"]);
  await openSession(page, SLUG, "s1");

  await notesButton(page).click();
  // Opening puts the cursor in the editor: the panel comes after the course frame in
  // the document, so tabbing to it would walk into the sandboxed course instead.
  await expect(editor(page)).toBeFocused();

  await page.keyboard.type("Typed without touching the mouse");
  await page.keyboard.press("Escape");
  await expect(editor(page)).toBeHidden();
  await expect(notesButton(page), "focus was dropped to the top of the page").toBeFocused();

  await expect.poll(() => serverNote(page, "s1"), { timeout: 15_000 }).toContain("without touching");
  await clearNotes(page, ["s1"]);
});

test("the notes page gathers a course's notes in session order, with an export", async ({
  page,
}) => {
  const as = await auth(page);
  const stamp = Date.now();
  await budApi.saveNote(SLUG, "s2", `## Second\n\nVolumes ${stamp}`, as);
  await budApi.saveNote(SLUG, "s1", `## First\n\nImages ${stamp}`, as);

  await page.goto(`/courses/${SLUG}/notes`);
  await expect(page.getByRole("heading", { name: "Your notes", level: 1 })).toBeVisible();

  // The course's own session order, whatever order the API or the learner used.
  const course = await budApi.getCourse(SLUG, as);
  const expected = [...course.sessions]
    .sort((a, b) => a.order - b.order)
    .filter((s) => ["s1", "s2"].includes(s.key))
    .map((s) => s.title);
  const shown = await page.getByTestId("note-session").allTextContents();
  expect(shown.map((t) => t.replace(/^\d+ · /, ""))).toEqual(expected);

  // Origin-relative, so the browser sends the session cookie through the rewrite.
  await expect(page.getByRole("link", { name: "Export notes" })).toHaveAttribute(
    "href",
    `/api/me/courses/${SLUG}/notes/export`,
  );

  await page.getByRole("link", { name: "Open session" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/learn/${SLUG}/s1$`));

  await clearNotes(page, ["s1", "s2"]);
});

test("the notes page says so plainly when nothing is written", async ({ page }) => {
  await clearNotes(page, ["s1", "s2"]);
  await page.goto(`/courses/${SLUG}/notes`);

  await expect(page.getByRole("heading", { name: "Nothing written yet." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Export notes" })).toBeHidden();
  await page.getByRole("link", { name: "Open the course" }).click();
  await expect(page).toHaveURL(new RegExp(`/learn/${SLUG}/`));
});

test("on a phone the notes are a tab in the session sheet", async ({ page }) => {
  await clearNotes(page, ["s1"]);
  await page.setViewportSize({ width: 375, height: 812 });
  await openSession(page, SLUG, "s1");

  // The header's desktop-only buttons stay off a phone; the sheet is the whole chrome.
  await expect(page.getByRole("banner").getByRole("button", { name: "Focus" })).toBeHidden();
  await expect(notesButton(page)).toBeHidden();

  await expect(editor(page)).toBeHidden();
  await page.getByRole("button", { name: /^Notes/ }).click();
  await expect(editor(page)).toBeVisible();

  const body = `On the train ${Date.now()}`;
  await editor(page).fill(body);
  await expect(noteSaved(page)).toBeVisible();
  expect(await serverNote(page, "s1")).toBe(body);

  // Room to write in: an editor of three lines is not somewhere to put a notes.md.
  expect((await editor(page).boundingBox())!.height).toBeGreaterThan(150);

  // The two tabs share the sheet: opening the sessions closes the notes.
  await page.getByRole("button", { name: /^Sessions/ }).click();
  await expect(editor(page)).toBeHidden();

  await clearNotes(page, ["s1"]);
});
