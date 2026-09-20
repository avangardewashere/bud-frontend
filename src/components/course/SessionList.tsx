import type { CourseSession } from "@/lib/api";
import { STATUS_LABELS, StatusDot } from "./meta";

/**
 * The session list from mockups 1d and 1f: status dot, mono two-digit number, title,
 * and the status on the right. The active row is tinted.
 *
 * Sessions are not links yet — the player is block 7. Rendering them as inert rows
 * beats linking to a route that does not exist.
 */
export function SessionList({ sessions }: { sessions: CourseSession[] }) {
  return (
    <ol className="divide-y divide-[var(--border)]">
      {sessions.map((session) => (
        <li
          key={session.key}
          className={
            "flex items-center gap-3 px-3 py-2.5 text-sm " +
            (session.status === "in_progress" ? "bg-[var(--tint)]" : "")
          }
        >
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
        </li>
      ))}
    </ol>
  );
}
