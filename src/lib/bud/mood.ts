import type { BudPose } from "@/components/bud";
import type { Dashboard } from "@/lib/api";

/**
 * Which Bud a learner meets, and what it says — Design.md §3's mood table and §8's
 * voice, in one pure function.
 *
 * Kept away from the screens deliberately. A mood read off whatever a component
 * happened to have in scope would drift: the dashboard would call someone "away a
 * while" while the player showed the cheerful face, and the rules would have to be
 * re-derived every time a screen was touched. Here they are stated once, take data
 * rather than components, and can be checked without rendering anything.
 *
 * The rules, in the order they win:
 *
 *   seed     nothing enrolled — the empty state (mockup 1b)
 *   bloom    every enrolled course finished
 *   thirsty  nothing opened for a week; §3 is emphatic that this is not a guilt trip
 *   sprout   enrolled, nothing finished yet — "It begins"
 *   default  mid-course, attentive
 *
 * Sleepy is not in that list, because it is not about progress: it is dark mode or a
 * late hour, and it only ever replaces the two everyday faces (see `atThisHour`).
 */

export type Mood = {
  pose: BudPose;
  greeting: string;
  /** Late where the reader is — the one thing that changes the words, not just the face. */
  evening?: boolean;
};

const AWAY_MS = 7 * 24 * 60 * 60 * 1000;
/** Design.md §3: "late local time". After this hour, and before 5, Bud dozes. */
const LATE_FROM = 22;
const LATE_UNTIL = 5;
/** Mockup 1k's "Good evening" — which is only true in the evening. */
const EVENING_FROM = 18;

export function moodFor(dashboard: Dashboard, now: number = Date.now()): Mood {
  const { totals, continueCard, courses } = dashboard;

  if (totals.enrolledCourses === 0) {
    return {
      pose: "seed",
      greeting: "Nothing is growing yet. Bud will keep track once you start a course.",
    };
  }

  // The API sends no continue card when there is nothing left to continue.
  if (!continueCard) {
    return { pose: "bloom", greeting: "Every course finished. Bud is very pleased." };
  }

  if (awayFor(courses, now) >= AWAY_MS) {
    return {
      pose: "thirsty",
      greeting: `Whenever you're ready, session ${continueCard.sessionOrder} is waiting.`,
    };
  }

  if (totals.completedSessions === 0) {
    return {
      pose: "sprout",
      greeting: continueCard.resuming
        ? `It begins. Session ${continueCard.sessionOrder} is where you left off.`
        : "It begins. Session 1 whenever you are.",
    };
  }

  return {
    pose: "default",
    greeting: continueCard.resuming
      ? `Session ${continueCard.sessionOrder} is where you left off.`
      : "Bud has been keeping track.",
  };
}

/**
 * The player's 24px Bud, which knows about one course rather than all of them.
 *
 * The same faces, read from the only thing that screen has: sprout before the first
 * session is finished, bloom when the course is, and the everyday face in between. No
 * thirsty — someone with the course open in front of them is plainly not away — and no
 * dozing, because a mascot asleep beside the work you are doing is a joke at your
 * expense.
 */
export function poseForCourse({
  completed,
  total,
}: {
  completed: number;
  total: number;
}): BudPose {
  if (total > 0 && completed >= total) return "bloom";
  return completed === 0 ? "sprout" : "default";
}

/**
 * How long since any enrolled course was opened.
 *
 * A course that has never been opened has `lastOpenedAt: null`, and the dashboard says
 * nothing about when it was enrolled — so "never opened" cannot be told from "enrolled
 * a minute ago". This used to read it as away, which meant the reward for pressing
 * Start was Bud drooping at you and "whenever you're ready", before you had had the
 * chance to not be ready. Unopened courses are skipped instead, and someone with
 * nothing open at all is simply not away: they are at the beginning, which is the
 * sprout's job to say.
 */
function awayFor(courses: Dashboard["courses"], now: number): number {
  let mostRecent = 0;
  for (const course of courses) {
    const at = Date.parse(course.lastOpenedAt ?? "");
    if (!Number.isNaN(at) && at > mostRecent) mostRecent = at;
  }
  return mostRecent === 0 ? 0 : now - mostRecent;
}

/**
 * The same mood, in the room the reader is actually in — Design.md §3's sleepy row is
 * "dark mode, or late local time", and mockup 1k's dark dashboard also changes the
 * words: "Good evening, Ari." / "Session 4 is where you left off. It'll keep."
 *
 * The two halves of that are deliberately not the same condition. **Dozing** follows
 * either the hour or the theme, because a dark screen is a dark room often enough and
 * Bud asleep on it looks right. **The evening words** follow only the hour: someone
 * who simply prefers dark at ten in the morning is not having an evening, and a page
 * that tells them they are is a page that does not know what time it is.
 *
 * Separate from `moodFor` because the server cannot know either thing for certain: it
 * renders in a datacentre's timezone, and the theme may be the device's own. The
 * browser applies this after hydration (src/components/dashboard/Greeting.tsx).
 *
 * Only the everyday faces doze. A seed is an empty state, a sprout is a beginning and
 * a bloom is a celebration — none of them should be asleep at their own moment.
 */
export function atThisHour(mood: Mood, { hour, dark = false }: { hour: number; dark?: boolean }): Mood {
  const late = hour >= LATE_FROM || hour < LATE_UNTIL;
  /** An evening is an evening. At three in the morning "Good evening" is a joke. */
  const evening = hour >= EVENING_FROM && hour <= 23;
  const everyday = mood.pose === "default" || mood.pose === "thirsty";

  return {
    ...mood,
    pose: everyday && (late || dark) ? "sleepy" : mood.pose,
    /**
     * "It'll keep" is about work that is waiting, so it is only said to someone who
     * has some. A finished course does not keep, and a beginning has not started.
     */
    greeting: late && everyday ? `${mood.greeting} It'll keep.` : mood.greeting,
    evening,
  };
}
