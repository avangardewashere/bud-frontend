import type { AdminCourse } from "@/lib/api";

/**
 * Whether the admin table's Publish button should do anything — mockup 1h's last step.
 *
 * This used to ask `currentVersion !== null`, which is the wrong question and disabled
 * the button for exactly the courses that need it. `currentVersion` is the version the
 * catalog serves, and a course that has only ever been uploaded has none: publishing is
 * what gives it one (the API picks the newest package when asked to publish a course
 * without a current version). So the screen offered upload → validate → and then a dead
 * button, for every course but the one that had already been published before the
 * button existed — which is why nothing noticed.
 *
 * The question that matters is whether a package was ever accepted. `versionCount` is
 * that: an upload that fails validation leaves a course row with no versions, and
 * publishing one would put something in the catalog that cannot be opened.
 */
export function canPublish(course: Pick<AdminCourse, "versionCount">): boolean {
  return course.versionCount > 0;
}
