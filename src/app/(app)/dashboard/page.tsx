import type { Metadata } from "next";
import Link from "next/link";
import { Bud, MoodBud } from "@/components/bud";
import { ContinueCard } from "@/components/course/ContinueCard";
import { CourseCard } from "@/components/course/CourseCard";
import { RecentNotes } from "@/components/dashboard/RecentNotes";
import { WaitingToHandIn } from "@/components/dashboard/WaitingToHandIn";
import { ButtonLink } from "@/components/ui/Button";
import { budApi } from "@/lib/api";
import { getSessionUser, serverAuth } from "@/lib/api/session";
import { moodFor } from "@/lib/bud/mood";

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
  const [{ courses }, dashboard] = await Promise.all([
    budApi.listCourses(auth),
    budApi.dashboard(auth),
  ]);
  const enrolled = courses.filter((course) => course.enrollment !== null);

  // Design.md §3's mood table, decided in one place for every screen that shows Bud.
  const mood = moodFor(dashboard);

  /**
   * Whether anything is planted is asked of the same endpoint the mood is, not of the
   * catalog: the two disagree when a course a learner is enrolled in stops being
   * published, and the screen then said "Nothing planted yet" under a Bud saying which
   * session to resume. The grid below can only draw courses the catalog still carries,
   * so it may show fewer cards than this count — but the page no longer contradicts
   * itself about whether this learner has started anything.
   */
  const planted = dashboard.totals.enrolledCourses > 0;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      {/* Bud is unlabelled here on purpose: the heading beside it says who this is. */}
      <div className="flex items-center gap-5" data-testid="greeting">
        <MoodBud mood={mood} size={72} label={null} />
        <div>
          <h1 className="text-4xl">Welcome back, {firstName(user!.name)}.</h1>
          {/*
            Except when the empty state is about to say the same thing in bigger type:
            two seeds and two sentences about nothing being planted is one too many.
          */}
          {planted && <p className="mt-1 text-[var(--muted-foreground)]">{mood.greeting}</p>}
        </div>
      </div>

      {dashboard.continueCard && (
        <div className="mt-8">
          <ContinueCard
            card={dashboard.continueCard}
            completedSessions={dashboard.totals.completedSessions}
            totalSessions={dashboard.totals.totalSessions}
          />
        </div>
      )}

      {!planted ? (
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

      {/* Both disappear when they have nothing to say (§5.5, Phase 2). */}
      <WaitingToHandIn items={dashboard.upcomingDeliverables} />
      <RecentNotes notes={dashboard.recentNotes} />
    </main>
  );
}

/** "Welcome back, Ari." — the greeting uses the first name only (Design.md §8). */
function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}
