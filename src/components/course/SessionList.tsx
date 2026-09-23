import type { CourseSession, DeliverableList } from "@/lib/api";
import { linkLabel, safeHref } from "@/lib/safe-href";
import { STATUS_LABELS, StatusDot } from "./meta";

/**
 * The session list from mockups 1d and 1f: status dot, mono two-digit number, title,
 * and the status on the right. The active row is tinted.
 *
 * Sessions are not links yet — the player is block 7. Rendering them as inert rows
 * beats linking to a route that does not exist.
 *
 * A session someone has handed something in for carries its link on a second line, so
 * the course page answers "where did I put that?" without opening the session again.
 */
export function SessionList({
  sessions,
  deliverables = [],
}: {
  sessions: CourseSession[];
  /** What this learner has handed in for the course; empty when they are not enrolled. */
  deliverables?: DeliverableList;
}) {
  const bySession = new Map(deliverables.map((d) => [d.sessionKey, d]));

  return (
    <ol className="divide-y divide-[var(--border)]">
      {sessions.map((session) => {
        const handedIn = bySession.get(session.key);
        return (
          <li
            key={session.key}
            className={
              "px-3 py-2.5 text-sm " +
              (session.status === "in_progress" ? "bg-[var(--tint)]" : "")
            }
          >
            <div className="flex items-center gap-3">
              <StatusDot status={session.status} />
              <span className="font-mono text-xs text-[var(--muted-foreground)]">
                {String(session.order).padStart(2, "0")}
              </span>
              <span className="flex-1">{session.title}</span>
              <span
                className={
                  "text-xs " +
                  (session.status === "not_started"
                    ? "text-[var(--muted-foreground)]"
                    : "text-[var(--tint-foreground)]")
                }
              >
                {session.status === "not_started" && session.weight
                  ? session.weight
                  : STATUS_LABELS[session.status]}
              </span>
            </div>

            {handedIn && <HandedIn deliverable={handedIn} />}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The learner's own link, which is why it goes through safeHref: the API refuses
 * anything but http(s) on the way in, and this is the check on the way out. Anything
 * that fails it is shown as text — visible, inert, and never an href.
 */
function HandedIn({ deliverable }: { deliverable: DeliverableList[number] }) {
  const href = safeHref(deliverable.url);
  return (
    <p className="ml-[26px] mt-1 flex flex-wrap items-baseline gap-x-2 text-xs [overflow-wrap:anywhere]">
      <span
        className={
          deliverable.submittedAt
            ? "text-[var(--tint-foreground)]"
            : "text-[var(--muted-foreground)]"
        }
      >
        {deliverable.submittedAt ? "Handed in" : "Kept, not handed in"}
      </span>
      {href ? (
        // A link a learner typed: the page it opens gets no handle on this tab.
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 text-[var(--tint-foreground)] hover:underline"
        >
          {linkLabel(deliverable.url)}
        </a>
      ) : (
        <span className="min-w-0 text-[var(--muted-foreground)]">{deliverable.url}</span>
      )}
    </p>
  );
}
