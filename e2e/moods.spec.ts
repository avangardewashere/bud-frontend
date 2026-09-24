import { test, expect, type Page } from "@playwright/test";
import { budApi, type Dashboard } from "@/lib/api";
import { atThisHour, moodFor, poseForCourse } from "@/lib/bud/mood";
import { canPublish } from "@/lib/admin/publishable";
import { LEARNER, asSignedIn, openSession, signIn, skipWithoutApi } from "./support/api";

/**
 * Block 17 — Bud's moods (Design.md §3).
 *
 * The rules are a pure function, so most of this file never opens a browser: it states
 * the mood table as tests and checks it directly, the way `safeHref` is checked. What
 * the browser is for is the two things a function cannot prove — that the dashboard
 * shows the mood its data justifies, and that the bloom happens once, when a session
 * is finished, and is a fade for anyone who asked for less motion.
 */

const SLUG = "docker-fundamentals";
const SESSION = "s1";

/**
 * A dashboard with nothing in it, which each test then makes true of one learner.
 *
 * Typed as the generated `Dashboard`, so a field the API adds — streak and the
 * estimated hours arrived on 24 September — breaks this file rather than quietly
 * leaving the rules untested against the shape they actually run on.
 */
const empty: Dashboard = {
  continueCard: null,
  courses: [],
  recentNotes: [],
  upcomingDeliverables: [],
  streak: { current: 0, longest: 0, lastActiveDate: null },
  totals: {
    enrolledCourses: 0,
    completedCourses: 0,
    completedSessions: 0,
    totalSessions: 0,
    estimatedHours: { total: 0, completed: 0 },
  },
};

const card = (over: Partial<NonNullable<Dashboard["continueCard"]>> = {}) => ({
  slug: SLUG,
  title: "Docker",
  accentColor: null,
  sessionKey: "s3",
  sessionTitle: "Your first Dockerfile",
  sessionOrder: 3,
  weight: null,
  percent: 20,
  resuming: true,
  ...over,
});

const course = (over: Partial<Dashboard["courses"][number]> = {}) => ({
  slug: SLUG,
  title: "Docker",
  accentColor: null,
  coverUrl: null,
  completedSessions: 2,
  totalSessions: 10,
  percent: 20,
  lastOpenedAt: new Date().toISOString(),
  completedAt: null,
  estimatedHours: { total: 30, completed: 6 },
  ...over,
});

const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);
const daysAgo = (days: number) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

test("the mood table, as Design.md §3 states it", () => {
  // Nothing enrolled: the empty state, not a person who is behind.
  expect(moodFor(empty, NOW).pose).toBe("seed");

  const enrolled = {
    ...empty,
    continueCard: card(),
    courses: [course()],
    totals: { ...empty.totals, enrolledCourses: 1, completedSessions: 2, totalSessions: 10 },
  };
  expect(moodFor(enrolled, NOW).pose).toBe("default");

  // Started, nothing finished yet.
  expect(
    moodFor(
      { ...enrolled, totals: { ...enrolled.totals, completedSessions: 0 } },
      NOW,
    ).pose,
  ).toBe("sprout");

  // Away a week. Six days is not away.
  const away = (days: number) => ({ ...enrolled, courses: [course({ lastOpenedAt: daysAgo(days) })] });
  expect(moodFor(away(6), NOW).pose).toBe("default");
  expect(moodFor(away(8), NOW).pose).toBe("thirsty");

  /**
   * Just enrolled, nothing opened yet: the beginning, not an absence. The dashboard
   * cannot tell "never opened" from "enrolled a minute ago" — there is no enrolment
   * date in it — so reading a null as seven days away drooped at people for pressing
   * Start, which is the one moment the mood table has a face for.
   */
  const fresh = {
    ...enrolled,
    courses: [course({ lastOpenedAt: null, completedSessions: 0 })],
    totals: { ...enrolled.totals, completedSessions: 0 },
  };
  expect(moodFor(fresh, NOW).pose).toBe("sprout");
  expect(moodFor(fresh, NOW).greeting).toContain("It begins");
  // One open course is enough to date the whole dashboard from.
  expect(
    moodFor({ ...enrolled, courses: [course({ lastOpenedAt: null }), course()] }, NOW).pose,
  ).toBe("default");

  // Nothing left to continue: every course finished.
  expect(moodFor({ ...enrolled, continueCard: null }, NOW).pose).toBe("bloom");
});

test("the greetings say something specific, and never shout", () => {
  const enrolled = {
    ...empty,
    continueCard: card({ sessionOrder: 4 }),
    courses: [course()],
    totals: { ...empty.totals, enrolledCourses: 1, completedSessions: 2, totalSessions: 10 },
  };

  expect(moodFor(enrolled, NOW).greeting).toContain("Session 4");
  expect(moodFor({ ...enrolled, continueCard: null }, NOW).greeting).toContain("Bud is very pleased");
  // Design.md §8's inactive line: an invitation, not a scolding.
  const thirsty = moodFor({ ...enrolled, courses: [course({ lastOpenedAt: daysAgo(30) })] }, NOW);
  expect(thirsty.greeting).toContain("Whenever you're ready");

  // Every mood's words, not a sample of them: Bud never shouts and never nags.
  const everyMood = [
    moodFor(empty, NOW),
    moodFor(enrolled, NOW),
    moodFor({ ...enrolled, continueCard: null }, NOW),
    moodFor({ ...enrolled, totals: { ...enrolled.totals, completedSessions: 0 } }, NOW),
    moodFor({ ...enrolled, continueCard: card({ resuming: false }) }, NOW),
    thirsty,
  ];
  // Every mood the data can produce is in that list — sleepy is the hour's, not the
  // data's, and is checked on its own below.
  expect([...new Set(everyMood.map((m) => m.pose))].sort()).toEqual([
    "bloom",
    "default",
    "seed",
    "sprout",
    "thirsty",
  ]);
  for (const mood of everyMood) {
    expect(mood.greeting, "Bud does not use exclamation marks").not.toContain("!");
    expect(mood.greeting.length, "and says something").toBeGreaterThan(10);
    for (const word of ["lost", "streak", "don't give up", "behind"]) {
      expect(mood.greeting.toLowerCase(), `no nagging: "${word}"`).not.toContain(word);
    }
  }
});

test("dozing is about the hour, not about progress", () => {
  const mid = { pose: "default", greeting: "Bud has been keeping track." } as const;
  expect(atThisHour(mid, 14).pose).toBe("default");
  expect(atThisHour(mid, 22).pose).toBe("sleepy");
  expect(atThisHour(mid, 2).pose).toBe("sleepy");
  expect(atThisHour(mid, 5).pose).toBe("default");
  // The words never change with the hour; only the face does.
  expect(atThisHour(mid, 23).greeting).toBe(mid.greeting);

  // A beginning and a celebration are not slept through.
  for (const pose of ["seed", "sprout", "bloom"] as const) {
    expect(atThisHour({ pose, greeting: "" }, 23).pose).toBe(pose);
  }
  // Thirsty does doze: it is the everyday face of someone who is not here.
  expect(atThisHour({ pose: "thirsty", greeting: "" }, 23).pose).toBe("sleepy");
});

test("the player's Bud reads one course, and never dozes over someone's work", () => {
  expect(poseForCourse({ completed: 0, total: 10 })).toBe("sprout");
  expect(poseForCourse({ completed: 3, total: 10 })).toBe("default");
  expect(poseForCourse({ completed: 10, total: 10 })).toBe("bloom");
  // A course with no sessions is not a finished course.
  expect(poseForCourse({ completed: 0, total: 0 })).toBe("sprout");
});

test("Publish is offered for a course that has a package, current version or not", () => {
  // The bug this replaced: a freshly uploaded course has no currentVersion, because
  // publishing is what gives it one — and the button was disabled for exactly that.
  expect(canPublish({ versionCount: 1 })).toBe(true);
  expect(canPublish({ versionCount: 3 })).toBe(true);
  // An upload that failed validation leaves a course with nothing to serve.
  expect(canPublish({ versionCount: 0 })).toBe(false);
});

// ── in the browser ──────────────────────────────────────────────────────────────

/**
 * The dashboard's Bud carries no accessible name — the heading beside it already says
 * who it is — so the pose is what a test can read, which is also what a designer
 * checking the mood table would look at.
 */
const greetingPose = (page: Page) => page.getByTestId("greeting").locator("svg[data-pose]");

async function enrolled(page: Page) {
  await page.goto(`/courses/${SLUG}`);
  const start = page.getByRole("button", { name: "Start this course" });
  if (await start.isVisible().catch(() => false)) await start.click();
  await expect(page.getByRole("button", { name: "Unenroll" })).toBeVisible();
}

test.describe("on screen", () => {
  test.beforeEach(async ({ page }) => {
    await skipWithoutApi(page);
    await signIn(page, LEARNER);
    await enrolled(page);
  });

  test.afterEach(async ({ page }) => {
    // Leave the learner as the rest of the suite expects: enrolled, s1 unfinished.
    await budApi.uncompleteSession(SLUG, SESSION, await asSignedIn(page)).catch(() => {});
  });

  test("the dashboard shows the mood its own numbers justify", async ({ page }) => {
    /**
     * Pin the clock to the middle of the day. The pose a learner sees after hydration
     * is the dozing one between 22:00 and 05:00 (MoodBud), so without this the test
     * would assert the daytime face and fail every night — on the developer's machine
     * rather than in CI, which is the worst place for a test to be wrong.
     */
    await page.clock.setFixedTime(new Date("2026-09-24T12:00:00"));

    const auth = await asSignedIn(page);
    const detail = await budApi.getCourse(SLUG, auth);
    for (const session of detail.sessions) {
      if (session.status === "complete") {
        await budApi.uncompleteSession(SLUG, session.key, auth).catch(() => {});
      }
    }

    // Enrolled, nothing finished: it begins.
    await page.goto("/dashboard");
    await expect(greetingPose(page)).toHaveAttribute("data-pose", "sprout");
    await expect(page.getByText("It begins.")).toBeVisible();

    // One session in, and Bud is simply attentive.
    await budApi.completeSession(SLUG, SESSION, auth);
    await page.goto("/dashboard");
    await expect(greetingPose(page)).toHaveAttribute("data-pose", "default");
    await expect(page.getByText("It begins.")).toBeHidden();
  });

  test("late at night the same dashboard dozes instead", async ({ page }) => {
    // The hour is the browser's, not the server's: the pose in the HTML is the daytime
    // one and the browser corrects it, which is the only way a datacentre can be right
    // about midnight in Manila.
    await page.clock.setFixedTime(new Date("2026-09-24T23:30:00"));
    // Mid-course, so the daytime face would be the everyday one — a beginning or a
    // celebration is never slept through, and this proves the ordinary case.
    await budApi.completeSession(SLUG, SESSION, await asSignedIn(page));

    await page.goto("/dashboard");
    await expect(greetingPose(page)).toHaveAttribute("data-pose", "sleepy");
  });

  test("finishing a session blooms, once, and then closes again", async ({ page }) => {
    await budApi.uncompleteSession(SLUG, SESSION, await asSignedIn(page)).catch(() => {});
    await openSession(page, SLUG, SESSION);

    const bud = page.getByRole("banner").locator("svg[data-pose]");
    await expect(bud).toHaveAttribute("data-pose", "sprout");

    await page.getByRole("button", { name: "Mark complete" }).click();
    await expect(bud).toHaveAttribute("data-pose", "bloom");
    // The flower is animated for this moment only — a finished course is drawn open
    // and still, and this is neither.
    await expect(bud.locator("[data-bloom-animate]")).toHaveCount(1);

    // "For a moment, then closes again" (Design.md §3).
    await expect(bud).toHaveAttribute("data-pose", "default", { timeout: 10_000 });
  });

  test("reduced motion swaps the bloom's movement for a fade", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await budApi.uncompleteSession(SLUG, SESSION, await asSignedIn(page)).catch(() => {});
    await openSession(page, SLUG, SESSION);

    await page.getByRole("button", { name: "Mark complete" }).click();
    const flower = page.getByRole("banner").locator("[data-bloom-animate]");
    await expect(flower).toHaveCount(1);

    // Design.md §6: the movement is swapped for opacity, not deleted — so the moment
    // still happens for someone who asked for less of it.
    const animation = await flower.evaluate((el) => {
      const style = getComputedStyle(el);
      return { name: style.animationName, duration: style.animationDuration };
    });
    expect(animation.name).toBe("bud-bloom-fade");
    expect(Number.parseFloat(animation.duration)).toBeGreaterThan(0.1);
  });

  /**
   * The waking notice's own Bud is asserted in waking.spec.ts, where a slow API is
   * already being staged — the notice watches this tab's own fetches, so raising it
   * means holding one open for six seconds, and once per suite is enough.
   */
});
