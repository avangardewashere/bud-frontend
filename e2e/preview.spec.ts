import { test, expect } from "@playwright/test";
import { apiCourseStore, memoryCourseStore } from "@/components/player/courseStore";
import {
  PreviewManifestError,
  courseFileUrl,
  courseFromManifest,
  parseManifest,
  type CourseManifest,
} from "@/lib/preview/manifest";

/**
 * `npm run preview` — an author's course folder, in the real shell.
 *
 * These are pure: no API, no servers, no browser. The parts of preview that need two
 * listeners are exercised by `tools/preview.mjs` itself and by the leak probe's second
 * target, not from here — but the mapping from a manifest to what the screens render,
 * and the store that stands in for the API, are rules, and rules can be checked.
 */

const MANIFEST: CourseManifest = {
  id: "my-course",
  title: "My Course",
  version: "2.1.0",
  summary: "A summary.",
  level: "beginner",
  estimatedHours: 4,
  tags: ["a", "b"],
  outline: "outline.md",
  cover: "art/cover.png",
  theme: { accent: "#123456" },
  sessions: [
    { id: "s2", order: 2, title: "Second", entry: "two.html", weight: "heavy", deliverable: "A repo" },
    { id: "s1", order: 1, title: "First", entry: "one.html", weight: "light", deliverable: null },
  ],
};

const build = (manifest = MANIFEST, outlineMarkdown: string | null = "# Outline") =>
  courseFromManifest({
    manifest,
    outlineMarkdown,
    coursesOrigin: "http://127.0.0.1:3101",
    now: "2026-10-01T00:00:00.000Z",
  });

test("a manifest becomes the shape every screen already renders", () => {
  const course = build();

  expect(course.slug).toBe("my-course");
  expect(course.version).toBe("2.1.0");
  expect(course.accentColor).toBe("#123456");
  expect(course.sessionCount).toBe(2);
  expect(course.outlineMarkdown).toBe("# Outline");

  // Ordered by the manifest's own `order`, not the order they happen to be listed in.
  expect(course.sessions.map((s) => s.key)).toEqual(["s1", "s2"]);
  expect(course.sessions[0].entryPath).toBe("one.html");
  expect(course.sessions[1].deliverable).toBe("A repo");

  // The cover is a path inside the package, composed onto the courses origin — the
  // course never supplies its own URL, in preview any more than in production.
  expect(course.coverUrl).toBe("http://127.0.0.1:3101/my-course/2.1.0/art/cover.png");
});

test("the two fields preview cannot know are stated, not faked", () => {
  const course = build();

  /**
   * The load-bearing one. `/learn/[slug]/[sessionKey]` redirects anyone without an
   * enrollment to the course page to enrol — which in preview is a dead end, so a
   * null here would make every session bounce to a page that cannot help.
   */
  expect(course.enrollment, "the player redirects without one").not.toBeNull();
  expect(course.enrollment?.completedSessions).toBe(0);
  expect(course.enrollment?.totalSessions).toBe(2);

  // Preview keeps no progress, so claiming any would be a lie about the author's own
  // course rather than a convenience.
  expect(course.sessions.every((s) => s.status === "not_started")).toBe(true);
});

test("a package with no cover and no outline still previews", () => {
  // Both are warnings in the validator, not errors — an author part-way through
  // writing should still see their worksheets.
  const course = build({ ...MANIFEST, cover: null, outline: null }, null);
  expect(course.coverUrl).toBeNull();
  expect(course.outlineMarkdown).toBeNull();
  expect(course.sessions).toHaveLength(2);
});

test("a manifest it cannot read names the field, and nothing else", () => {
  const missing = (raw: unknown) => {
    try {
      parseManifest(raw);
      return null;
    } catch (error) {
      return error instanceof PreviewManifestError ? error.message : String(error);
    }
  };

  expect(missing(null)).toContain("not a JSON object");
  expect(missing({ id: "x", title: "y", version: "1" })).toContain('"sessions"');
  expect(missing({ title: "y", version: "1", sessions: [{}] })).toContain('"id"');
  expect(missing({ id: "x", title: "y", version: "1", sessions: [{ id: "s1", title: "t" }] })).toContain(
    "sessions[0].entry",
  );

  /**
   * And it stops at reading. Preview is not a validator and must never become one —
   * the backend owns those rules and publishes them as JSON Schema, and a second
   * implementation here would drift until an author met the difference at upload
   * time. A manifest carrying a field the spec forbids is still previewable.
   */
  const odd = parseManifest({
    ...MANIFEST,
    somethingTheSpecForbids: true,
    tags: ["ok", 42],
    weight: "enormous",
  });
  expect(odd.sessions).toHaveLength(2);
  expect(odd.tags, "a bad entry is dropped, not refused").toEqual(["ok"]);
});

test("paths inside a package are escaped on the way into a URL", () => {
  const url = courseFileUrl("http://127.0.0.1:3101", MANIFEST, "a dir/a file.html");
  expect(url).toBe("http://127.0.0.1:3101/my-course/2.1.0/a%20dir/a%20file.html");
  // Separators survive; only the segments are encoded.
  expect(url.split("/").length).toBe(7);
});

test("preview's store is interchangeable with the real one", () => {
  /**
   * The extraction's whole claim is that the bridge cannot tell which store it has.
   * The type system already enforces the shape — `CourseStore` is a `Pick` of the real
   * client — but a method the memory store forgot would be `undefined` at runtime, so
   * this checks every one is actually there.
   */
  const memory = memoryCourseStore();
  for (const method of Object.keys(memory)) {
    expect(typeof (apiCourseStore as Record<string, unknown>)[method], method).toBe("function");
  }
  expect(Object.keys(memory).length).toBeGreaterThanOrEqual(7);
});

test("the memory store answers an unwritten key rather than failing on it", async () => {
  const store = memoryCourseStore();

  /**
   * The bridge treats a failed *read* as "this course started blank, refuse to let it
   * overwrite what is there". If an unwritten key threw, every brand-new worksheet in
   * preview would be unable to save anything at all — so `{ value: null }` is the
   * behaviour the host depends on, not merely a convenience.
   */
  expect(await store.getState("c", "never-written")).toEqual({ value: null });

  await store.putState("c", "k", "written");
  expect((await store.getState("c", "k")).value).toBe("written");

  await store.deleteState("c", "k");
  expect((await store.getState("c", "k")).value).toBeNull();

  // Keys are per course, so two courses cannot read each other's work.
  await store.putState("one", "k", "first");
  await store.putState("two", "k", "second");
  expect((await store.getState("one", "k")).value).toBe("first");
});
