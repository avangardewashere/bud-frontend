import { test, expect, type BrowserContext } from "@playwright/test";
import { budApi, type RequestOptions } from "@/lib/api";
import { safeHref, linkLabel } from "@/lib/safe-href";
import { LEARNER, signIn, skipWithoutApi } from "./support/api";

/**
 * Block 14 — the typed client against the real API, before any screen uses it.
 *
 * This imports the shell's own client and calls it from Node, exactly as server
 * components do: base URL from BUD_API_ORIGIN, session cookie forwarded by hand
 * (see serverAuth in src/lib/api/session.ts). So it tests the paths and shapes the
 * app will actually use, not a second copy of them written for a test.
 *
 * Notes and deliverables have no UI yet (blocks 15 and 16). Until they do, this is
 * what stops the client drifting from the API.
 */

const SLUG = "docker-fundamentals";
const SESSION = "s1";

/** The learner's session, as a header — the shape every server-side call takes. */
async function asLearner(context: BrowserContext): Promise<RequestOptions> {
  const cookies = await context.cookies();
  const jar = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  expect(jar, "signing in should have set a session cookie").toContain("bud_session=");
  return { headers: { cookie: jar } };
}

test.beforeEach(async ({ page }) => {
  await skipWithoutApi(page);
});

test("the client reads and writes a session's note", async ({ page, context }) => {
  await signIn(page, LEARNER);
  const auth = await asLearner(context);

  // Enrolment is the API's precondition for notes; the shell's own button does this.
  await budApi.enroll(SLUG, auth).catch(() => {});

  const body = `# What I learned\n\nImage vs container, ${Date.now()}.`;
  const saved = await budApi.saveNote(SLUG, SESSION, body, auth);
  expect(saved?.bodyMd).toBe(body);
  expect(saved?.sessionKey).toBe(SESSION);

  expect((await budApi.getNote(SLUG, SESSION, auth))?.bodyMd).toBe(body);

  const all = await budApi.listNotes(SLUG, auth);
  expect(all.map((n) => n.sessionKey)).toContain(SESSION);
  // Ordered by session, so the aggregate view can render it straight.
  expect(all.map((n) => n.sessionOrder)).toEqual([...all.map((n) => n.sessionOrder)].sort());

  // An empty body deletes rather than storing emptiness — the API's rule.
  expect(await budApi.saveNote(SLUG, SESSION, "", auth)).toBeNull();
  expect(await budApi.getNote(SLUG, SESSION, auth)).toBeNull();
});

test("the client submits, retracts and removes a deliverable", async ({ page, context }) => {
  await signIn(page, LEARNER);
  const auth = await asLearner(context);
  await budApi.enroll(SLUG, auth).catch(() => {});

  const url = `https://github.com/ari/bud-docker-${Date.now()}`;
  const submitted = await budApi.saveDeliverable(
    SLUG,
    SESSION,
    { url, comment: "nginx in a container" },
    auth,
  );
  expect(submitted.url).toBe(url);
  expect(submitted.submittedAt, "submitted by default").not.toBeNull();
  // What the course asked for, so a screen can show the ask beside the answer.
  expect(submitted.asked).toBeTruthy();

  const retracted = await budApi.saveDeliverable(SLUG, SESSION, { url, submitted: false }, auth);
  expect(retracted.submittedAt, "retracted, but the link is kept").toBeNull();
  expect(retracted.url).toBe(url);

  expect((await budApi.listDeliverables(SLUG, auth)).map((d) => d.sessionKey)).toContain(SESSION);

  await budApi.deleteDeliverable(SLUG, SESSION, auth);
  expect((await budApi.listDeliverables(SLUG, auth)).map((d) => d.sessionKey)).not.toContain(
    SESSION,
  );
});

test("the API refuses a deliverable the shell would refuse to render", async ({ page, context }) => {
  await signIn(page, LEARNER);
  const auth = await asLearner(context);
  await budApi.enroll(SLUG, auth).catch(() => {});

  await expect(
    budApi.saveDeliverable(SLUG, SESSION, { url: "javascript:alert(document.cookie)" }, auth),
    "javascript: must never be storable",
  ).rejects.toThrow();

  // And the shell's own check agrees, for anything already stored or yet to come.
  expect(safeHref("javascript:alert(1)")).toBeNull();
  expect(safeHref("java\nscript:alert(1)")).toBeNull();
  expect(safeHref("  JavaScript:alert(1)")).toBeNull();
  expect(safeHref("data:text/html,<script>alert(1)</script>")).toBeNull();
  expect(safeHref("/dashboard")).toBeNull();
  expect(safeHref("")).toBeNull();
  expect(safeHref(null)).toBeNull();
  expect(safeHref("https://github.com/ari/bud")).toBe("https://github.com/ari/bud");
  expect(safeHref("HTTP://Example.com/x")).toBe("http://example.com/x");
  expect(linkLabel("https://github.com/ari/bud")).toBe("github.com/ari/bud");
  expect(linkLabel("javascript:alert(1)")).toBe("javascript:alert(1)");
});

test("notes export downloads a markdown file the browser names itself", async ({
  page,
  context,
}) => {
  await signIn(page, LEARNER);
  const auth = await asLearner(context);
  await budApi.enroll(SLUG, auth).catch(() => {});
  await budApi.saveNote(SLUG, SESSION, `Exported at ${Date.now()}`, auth);

  // Same-origin through the rewrite: the cookie rides along and no fetch is needed.
  const url = budApi.notesExportUrl(SLUG);
  expect(url).toContain(`/me/courses/${SLUG}/notes/export`);

  const response = await page.request.get(new URL(url, "http://localhost:3100").toString());
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("text/markdown");
  expect(response.headers()["content-disposition"]).toContain("attachment");
  expect(await response.text()).toContain("Exported at");

  await budApi.saveNote(SLUG, SESSION, "", auth);
});

test("the dashboard carries the recent notes and the deliverables still owed", async ({
  page,
  context,
}) => {
  await signIn(page, LEARNER);
  const auth = await asLearner(context);
  await budApi.enroll(SLUG, auth).catch(() => {});

  const body = `Dashboard sees this ${Date.now()}`;
  await budApi.saveNote(SLUG, SESSION, body, auth);

  const dashboard = await budApi.dashboard(auth);
  expect(dashboard.recentNotes.some((n) => n.excerpt.includes("Dashboard sees this"))).toBe(true);
  // Excerpts, not whole notes: this is the first screen after signing in.
  for (const note of dashboard.recentNotes) expect(note.excerpt.length).toBeLessThan(500);

  const owed = dashboard.upcomingDeliverables;
  expect(owed.every((d) => d.asked.length > 0)).toBe(true);
  // Finished sessions first: the work is done and only the handing in is left.
  const finishedFirst = [...owed].sort((a, b) => Number(b.sessionComplete) - Number(a.sessionComplete));
  expect(owed.map((d) => d.sessionKey)).toEqual(finishedFirst.map((d) => d.sessionKey));

  await budApi.saveNote(SLUG, SESSION, "", auth);
});

test("providers says which sign-in options this deployment offers", async ({ page }) => {
  await skipWithoutApi(page);
  const providers = await budApi.providers();

  expect(providers.password).toBe(true);
  expect(typeof providers.github).toBe("boolean");
  expect(["invite_only", "open", "closed"]).toContain(providers.signupMode);
});
