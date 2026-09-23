import Link from "next/link";
import { LocalDay } from "@/components/ui/LocalDay";
import type { Dashboard } from "@/lib/api";

/**
 * The notes touched most recently, across every enrolled course — §5.5, Phase 2.
 *
 * Excerpts, and the API cuts them: this is the first screen after signing in, and a
 * dashboard should not carry the whole of the longest thing anyone has written. They
 * are rendered as plain text rather than Markdown, because half a document rendered
 * as Markdown is a document with a heading and no body — the notes page is where they
 * are read properly, and that is where each card leads.
 *
 * Gone when there are none: an empty "Recent notes" heading is a reproach, not a
 * feature.
 */
export function RecentNotes({ notes }: { notes: Dashboard["recentNotes"] }) {
  if (notes.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="text-2xl">Recent notes</h2>
      <p className="mt-1 text-[var(--muted-foreground)]">What you wrote down as you worked.</p>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {notes.map((note) => {
          return (
            <li key={`${note.slug}/${note.sessionKey}`}>
              <Link
                href={`/courses/${note.slug}/notes`}
                className="flex h-full flex-col rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-4 hover:bg-[var(--muted)]"
              >
                <span className="font-mono text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                  {note.courseTitle} · <LocalDay iso={note.updatedAt} />
                </span>
                <span className="mt-1 font-semibold">
                  {note.sessionTitle ?? note.sessionKey}
                </span>
                {/*
                  A learner's own words, so the excerpt is shown as the text it is:
                  no Markdown renderer, no HTML, nothing that treats it as markup.
                */}
                <span className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-[var(--muted-foreground)] [overflow-wrap:anywhere]">
                  {note.excerpt}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
