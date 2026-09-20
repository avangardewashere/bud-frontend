import type { Metadata } from "next";
import Link from "next/link";
import { Bud } from "@/components/bud";
import { CourseCard } from "@/components/course/CourseCard";
import { ButtonLink } from "@/components/ui/Button";
import { budApi } from "@/lib/api";
import { getSessionUser, serverAuth } from "@/lib/api/session";

export const metadata: Metadata = { title: "Dashboard — Bud" };

/**
 * The dashboard — mockup 1b's greeting and course grid.
 *
 * The Continue hero card still needs /me/dashboard, which is the backend's block 4.
 * Until then the enrolled courses come from the catalog's own enrollment field, so
 * the dashboard at least tells the truth: showing the "Nothing planted yet" empty
 * state to someone who has enrolled would be a lie the screen can already avoid.
 */
export default async function DashboardPage() {
  // The layout has already redirected anyone without a session.
  const [user, auth] = await Promise.all([getSessionUser(), serverAuth()]);
  const { courses } = await budApi.listCourses(auth);
  const enrolled = courses.filter((course) => course.enrollment !== null);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex items-center gap-5">
        <Bud size={72} label={null} />
        <div>
          <h1 className="text-4xl">Welcome back, {firstName(user!.name)}.</h1>
          <p className="mt-1 text-[var(--muted-foreground)]">
            {enrolled.length === 0
              ? "Nothing is growing yet. Bud will keep track once you start a course."
              : "Bud has been keeping track."}
          </p>
        </div>
      </div>

      {enrolled.length === 0 ? (
        <section className="mt-12 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--card)] px-6 py-16 text-center">
          <Bud pose="seed" size={110} label={null} className="mx-auto" />
          <h2 className="mt-6 text-2xl">Nothing planted yet.</h2>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Pick a course to start. Bud will keep track from there.
          </p>
          <ButtonLink href="/catalog" className="mt-6">
            Browse the catalog
          </ButtonLink>
        </section>
      ) : (
        <section className="mt-12">
          <div className="flex items-baseline justify-between">
            <h2 className="text-2xl">Your courses</h2>
            <Link
              href="/catalog"
              className="text-sm text-[var(--tint-foreground)] hover:underline"
            >
              Browse the catalog →
            </Link>
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {enrolled.map((course) => (
              <CourseCard key={course.slug} course={course} />
            ))}

            {/* "More room in the greenhouse." — mockup 1b's dashed slot. */}
            <Link
              href="/catalog"
              className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--border)] p-10 text-center hover:bg-[var(--muted)]"
            >
              <p className="text-sm text-[var(--muted-foreground)]">
                More room in the greenhouse.
              </p>
              <span className="mt-3 text-sm font-semibold text-[var(--tint-foreground)]">
                Pick a course
              </span>
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}

/** "Welcome back, Ari." — the greeting uses the first name only (Design.md §8). */
function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}
