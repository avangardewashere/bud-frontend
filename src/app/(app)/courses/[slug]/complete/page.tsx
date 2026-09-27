import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GrowthMeter } from "@/components/bud";
import { ButtonLink, buttonClasses } from "@/components/ui/Button";
import { BudApiError, budApi, type CourseDetail } from "@/lib/api";
import { serverAuth } from "@/lib/api/session";
import { finishedCount, isFinished } from "@/lib/course/finished";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  // The course's name, not its slug: this title is also what the router announces to a
  // screen reader when the player hands over to this page.
  try {
    const course = await budApi.getCourse(slug, await serverAuth());
    return { title: `${course.title} complete — Bud` };
  } catch {
    return { title: "Course complete — Bud" };
  }
}

/**
 * The end of a course — mockup 1i.
 *
 * The one screen in Bud that exists only to mark a moment: the plant in full, Bud
 * beside it with its own flower open, and the plain numbers underneath. No next
 * steps beyond the two that make sense — go back, or take your notes with you.
 *
 * It is a real page rather than a state of the player, so it can be returned to. A
 * course finished six months ago still has this screen, and the notes export on it is
 * the reason someone would come looking.
 */
export default async function CourseCompletePage({ params }: Params) {
  const { slug } = await params;
  const auth = await serverAuth();

  let course: CourseDetail;
  try {
    course = await budApi.getCourse(slug, auth);
  } catch (error) {
    if (error instanceof BudApiError && error.statusCode === 404) notFound();
    throw error;
  }

  /**
   * Nobody is congratulated for something they have not done. Someone not enrolled, or
   * not finished, goes to the course page — which is where the truth about where they
   * are actually is, rather than a 404 pretending the screen does not exist.
   */
  if (!isFinished(course)) {
    redirect(`/courses/${slug}`);
  }
  // Counted from the sessions being served, so the numbers cannot read "10 / 8 · 125%"
  // beside a plant drawn as eight of eight.
  const total = course.sessions.length;
  const done = finishedCount(course);

  /**
   * Notes are a learner's own and only exist for the enrolled; a course with none is
   * not a failure, it just has nothing to export. A read that *fails* is different
   * again, and comes back null: taking the export away is the one thing this screen
   * must not do on a timeout, since the export is why someone comes back to it.
   */
  const [notes, deliverables] = await Promise.all([
    budApi.listNotes(slug, auth).catch(() => null),
    /**
     * Null, not an empty list, when the read fails. Empty means "nothing handed in",
     * and this screen would then tell someone who handed in everything that they owe
     * all of it — an accusation built out of a timeout. Block 16 learned the same
     * lesson on the player; the difference is carried rather than flattened.
     */
    budApi.listDeliverables(slug, auth).catch(() => null),
  ]);

  /**
   * Finished is not always the same as done. A session can ask for a link the learner
   * has not handed in, and this screen is where they arrive the moment the course ends
   * — so it says what is still open rather than letting the dashboard mention it days
   * later. Sessions, not counts: the point is to be able to go back to the right one.
   */
  const handedIn = new Set(
    (deliverables ?? []).filter((d) => d.submittedAt !== null).map((d) => d.sessionKey),
  );
  const owed =
    deliverables === null
      ? []
      : course.sessions
          .filter((session) => session.deliverable && !handedIn.has(session.key))
          .sort((a, b) => a.order - b.order);

  /**
   * A few, not all of them. On a ten-session course where nothing was handed in, the
   * full list turns the one screen whose job is to mark a moment into a chore list
   * with the moment scrolled off the top — checked on a phone, which is where it
   * showed. The rest are on the course page, and on the dashboard, and will keep.
   */
  const shown = owed.slice(0, 3);
  const rest = owed.length - shown.length;

  return (
    <main className="mx-auto flex max-w-3xl flex-col items-center px-6 py-16 text-center">
      {/*
        Decorative: everything it shows is said in words directly below it, and a
        screen reader that reads the scene as well hears the same thing twice.
      */}
      <div data-testid="completion-scene">
        <GrowthMeter
          completed={done}
          total={total}
          size="hero"
          label={null}
        />
      </div>

      {/*
        Gold-600 is the only gold Design.md §4 allows as text, and at 3.02:1 it clears
        AA only at large-text size — so this banner is 20px bold rather than a small
        grey-gold label that nobody with tired eyes can read.
      */}
      <p className="mt-8 font-mono text-xl font-bold uppercase tracking-[0.2em] text-[var(--color-gold-600)]">
        Course complete
      </p>

      {/*
        Built from the course, not from the Docker course: "Ten sessions" is what the
        mockup shows because that course has ten, and a one-session course that
        announced ten would be a strange way to end.
      */}
      <h1 className="mt-4 text-3xl leading-tight sm:text-4xl">
        {sessionsWord(total)}. A whole course.
        <br />
        Bud is very pleased.
      </h1>

      <p className="mt-6 font-mono text-sm text-[var(--muted-foreground)]">
        {course.title} · {done} / {total} · 100%
      </p>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <ButtonLink href="/dashboard">Back to dashboard</ButtonLink>
        {(notes === null || notes.length > 0) && (
          // A plain link, so the browser downloads it under the name the API gives it
          // — wearing the secondary button 1i asks for, rather than its own clothes.
          <a href={budApi.notesExportUrl(slug)} className={buttonClasses("secondary")}>
            Export notes
          </a>
        )}
      </div>

      {owed.length > 0 && (
        <section
          data-testid="still-to-hand-in"
          className="mt-10 w-full rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--card)] p-5 text-left"
        >
          <h2 className="text-sm font-semibold">
            {owed.length === 1 ? "One session still owes its link" : "Still to hand in"}
          </h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            The course is finished either way — these are just not handed in yet.
          </p>
          <ul className="mt-3 space-y-2">
            {shown.map((session) => (
              <li key={session.key}>
                <Link
                  href={`/learn/${slug}/${session.key}`}
                  className="text-sm text-[var(--tint-foreground)] hover:underline"
                >
                  Session {session.order} · {session.title}
                </Link>
              </li>
            ))}
            {rest > 0 && (
              // The dashboard, not the course page: "waiting to hand in" is a real list
              // of exactly these, and the course page is not.
              <li className="text-sm text-[var(--muted-foreground)]">
                and {rest} more — the{" "}
                <Link href="/dashboard" className="text-[var(--tint-foreground)] hover:underline">
                  dashboard
                </Link>{" "}
                keeps the list.
              </li>
            )}
          </ul>
        </section>
      )}

      <Link
        href={`/courses/${slug}`}
        className="mt-8 text-sm text-[var(--tint-foreground)] hover:underline"
      >
        Back to {course.title}
      </Link>
    </main>
  );
}

/** "Ten sessions." — words up to twelve, which is where the meter stops drawing leaves. */
const WORDS = [
  "No",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
];

function sessionsWord(total: number) {
  const word = WORDS[total] ?? String(total);
  return `${word} ${total === 1 ? "session" : "sessions"}`;
}
