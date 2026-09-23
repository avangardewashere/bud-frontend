import Link from "next/link";
import type { Dashboard } from "@/lib/api";

/**
 * What a learner has finished but not handed in — Overall Plan §5.5, Phase 2.
 *
 * The API sends every session that asks for something and has nothing submitted,
 * finished ones first. This shows only the finished ones, on purpose: a session you
 * have not started yet is not *waiting* on you, it is simply the syllabus, and a
 * dashboard that opens with ten things you owe on a course you started yesterday is a
 * dashboard people stop reading. The asks for sessions still ahead live where they
 * are useful — in the session itself, above the field they get pasted into.
 *
 * So this section is empty exactly when nothing is owed, and it disappears then.
 */
export function WaitingToHandIn({ items }: { items: Dashboard["upcomingDeliverables"] }) {
  const owed = items.filter((item) => item.sessionComplete);
  if (owed.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="text-2xl">Waiting to hand in</h2>
      <p className="mt-1 text-[var(--muted-foreground)]">
        {owed.length === 1
          ? "One session is finished but still owes its link."
          : `${owed.length} finished sessions still owe their links.`}
      </p>

      <ul className="mt-6 space-y-3">
        {owed.map((item) => (
          <li key={`${item.slug}/${item.sessionKey}`}>
            <Link
              href={`/learn/${item.slug}/${item.sessionKey}`}
              className="flex items-baseline justify-between gap-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-4 hover:bg-[var(--muted)]"
            >
              <span className="min-w-0">
                <span className="block font-mono text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                  {item.courseTitle}
                </span>
                <span className="mt-1 block font-semibold">{item.sessionTitle}</span>
                {/* The manifest's own words for what it wants. */}
                <span className="mt-1 block line-clamp-2 text-sm text-[var(--muted-foreground)]">
                  {item.asked}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-[var(--tint-foreground)]">
                Hand in →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
