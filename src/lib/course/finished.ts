import type { CourseDetail } from "@/lib/api";

/**
 * Whether a learner has finished a course — asked the same way everywhere.
 *
 * Not `completedSessions >= sessionCount`. That counts progress rows, which outlive
 * the sessions they belong to: a course that publishes a new version with a session
 * renamed or removed keeps the old rows, so the count can reach the total while a
 * session of the version actually being served has never been opened. The sessions
 * carry their own status, and that is what the player, the course page and the
 * completion screen all read — because when two screens disagree about this, the link
 * on one of them bounces off the guard on the other.
 */
export function isFinished(course: Pick<CourseDetail, "sessions" | "enrollment">): boolean {
  if (!course.enrollment) return false;
  return course.sessions.length > 0 && course.sessions.every((s) => s.status === "complete");
}

/** How many of the served sessions are done — the number beside the plant. */
export function finishedCount(course: Pick<CourseDetail, "sessions">): number {
  return course.sessions.filter((s) => s.status === "complete").length;
}
