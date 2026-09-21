import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CourseStatusButton } from "@/components/admin/CourseStatusButton";
import { UploadCourse } from "@/components/admin/UploadCourse";
import { budApi, type AdminCourse } from "@/lib/api";
import { getSessionUser, serverAuth } from "@/lib/api/session";

export const metadata: Metadata = { title: "Courses — Bud admin" };

/**
 * Admin course management — mockup 1h.
 *
 * Course management is the whole admin surface in Phase 1: no user list, no invites,
 * no per-learner stats. That is the owner's call recorded in Overall Plan §5.8.
 */
export default async function AdminCoursesPage() {
  const user = await getSessionUser();

  /**
   * notFound() rather than a redirect or a "forbidden" page: the API answers 404 for
   * things a learner may not see, and the shell should not be more informative about
   * what exists than the API is.
   */
  if (user?.role !== "admin") notFound();

  const auth = await serverAuth();
  const [{ courses }, spec] = await Promise.all([
    budApi.adminCourses(auth),
    budApi.courseSpec(auth),
  ]);

  const published = courses.filter((c) => c.status === "published").length;
  const enrollments = courses.reduce((total, c) => total + c.enrollmentCount, 0);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-4xl">Courses</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">
            {courses.length} {courses.length === 1 ? "course" : "courses"} · {published}{" "}
            published · {enrollments} {enrollments === 1 ? "enrollment" : "enrollments"}
          </p>
        </div>
      </div>

      <div className="mt-8 overflow-x-auto rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left font-mono text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
              <th className="px-4 py-3 font-medium">Course</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Version</th>
              <th className="px-4 py-3 font-medium">Enrollments</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {courses.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[var(--muted-foreground)]">
                  No courses yet. Drop a zip below.
                </td>
              </tr>
            ) : (
              courses.map((course) => <Row key={course.id} course={course} />)
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mt-12 text-2xl">Upload a course</h2>
      <div className="mt-6">
        <UploadCourse spec={spec} />
      </div>
    </main>
  );
}

function Row({ course }: { course: AdminCourse }) {
  return (
    <tr className="border-b border-[var(--border)] last:border-0">
      <td className="px-4 py-3">
        <div className="font-semibold">{course.title}</div>
        <div className="font-mono text-xs text-[var(--muted-foreground)]">{course.slug}</div>
      </td>
      <td className="px-4 py-3">
        <Status status={course.status} />
      </td>
      <td className="px-4 py-3 font-mono text-xs">
        {course.currentVersion ?? "—"}
        {course.versionCount > 1 && (
          <span className="ml-1 text-[var(--muted-foreground)]">
            ({course.versionCount})
          </span>
        )}
      </td>
      <td className="px-4 py-3 font-mono text-xs">{course.enrollmentCount}</td>
      <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
        {new Date(course.updatedAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </td>
      <td className="px-4 py-3 text-right">
        <CourseStatusButton course={course} />
      </td>
    </tr>
  );
}

/** Published reads as plain emerald text; anything else as an outline pill (1h). */
function Status({ status }: { status: AdminCourse["status"] }) {
  if (status === "published") {
    return <span className="font-semibold text-[var(--tint-foreground)]">Published</span>;
  }
  return (
    <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs capitalize">
      {status}
    </span>
  );
}
