import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Bud } from "@/components/bud";
import { Markdown } from "@/components/ui/Markdown";
import { ButtonLink } from "@/components/ui/Button";
import { BudApiError, budApi, type CourseDetail, type NoteList } from "@/lib/api";
import { serverAuth } from "@/lib/api/session";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Your notes — ${slug} — Bud` };
}

/**
 * Every note for a course, in session order — Overall Plan §5.7's "aggregate view".
 *
 * The Markdown a learner wrote is rendered the same way a course outline is, because
 * it is the same kind of document; Export hands back the whole thing as one file,
 * built by the API so its ordering and headings have one implementation rather than
 * two.
 */
export default async function CourseNotesPage({ params }: Params) {
  const { slug } = await params;
  const auth = await serverAuth();

  let course: CourseDetail;
  let notes: NoteList;
  try {
    [course, notes] = await Promise.all([budApi.getCourse(slug, auth), budApi.listNotes(slug, auth)]);
  } catch (error) {
    if (error instanceof BudApiError && error.statusCode === 404) notFound();
    // Notes are a learner's own, and the API only has them for someone enrolled.
    if (error instanceof BudApiError && error.statusCode === 403) redirect(`/courses/${slug}`);
    throw error;
  }

  const ordered = [...notes].sort((a, b) => (a.sessionOrder ?? 0) - (b.sessionOrder ?? 0));

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href={`/courses/${slug}`}
        className="text-sm text-[var(--tint-foreground)] hover:underline"
      >
        ← {course.title}
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl">Your notes</h1>
          <p className="mt-1 font-mono text-sm text-[var(--muted-foreground)]">
            {ordered.length} of {course.sessionCount} sessions
          </p>
        </div>
        {ordered.length > 0 && (
          // A plain link: the browser downloads it under the name the API gives it.
          <a
            href={budApi.notesExportUrl(slug)}
            className="rounded-[10px] border border-[var(--border)] px-4 py-2 font-semibold text-[var(--tint-foreground)] hover:bg-[var(--tint)]"
          >
            Export notes
          </a>
        )}
      </div>

      {ordered.length === 0 ? (
        <section className="mt-12 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--card)] px-6 py-16 text-center">
          <Bud pose="seed" size={110} label={null} className="mx-auto" />
          <h2 className="mt-6 text-2xl">Nothing written yet.</h2>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Each session asks for a few lines. The Notes panel in the player is where they go.
          </p>
          <ButtonLink href={`/learn/${slug}/${resumeKey(course)}`} className="mt-6">
            Open the course
          </ButtonLink>
        </section>
      ) : (
        <div className="mt-10 space-y-10">
          {ordered.map((note) => (
            <article key={note.sessionKey}>
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--border)] pb-2">
                {/* The note's own markdown can have headings too, so this one is named. */}
                <h2 className="text-xl" data-testid="note-session">
                  {note.sessionOrder !== null && (
                    <span className="font-mono text-sm text-[var(--muted-foreground)]">
                      {String(note.sessionOrder).padStart(2, "0")} ·{" "}
                    </span>
                  )}
                  {note.sessionTitle ?? note.sessionKey}
                </h2>
                <Link
                  href={`/learn/${slug}/${note.sessionKey}`}
                  className="text-sm text-[var(--tint-foreground)] hover:underline"
                >
                  Open session
                </Link>
              </div>
              <div className="leading-relaxed">
                <Markdown>{note.bodyMd}</Markdown>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

/** Where "Open the course" goes: the session they last opened, else the first. */
function resumeKey(course: CourseDetail) {
  const last = course.enrollment?.lastSessionKey;
  if (last && course.sessions.some((s) => s.key === last)) return last;
  const ordered = [...course.sessions].sort((a, b) => a.order - b.order);
  return ordered[0]?.key ?? "";
}
