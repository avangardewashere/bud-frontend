/**
 * The small repeated bits of course metadata from mockups 1e and 1f: the level pill
 * over the cover, the mono tag row, the version pill, and the session status dot.
 *
 * Mono is used deliberately for anything machine-ish — tags, versions, counts — and
 * never for prose. That discipline is most of what makes the screens feel like one
 * product (Design-Mockups.md, "Component inventory").
 */

import type { CourseSession } from "@/lib/api";

/** "beginner-intermediate" reads as "Beginner → Intermediate" in the mockups. */
export function formatLevel(level: string) {
  return level
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" → ");
}

export function LevelPill({ level }: { level: string }) {
  return (
    <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs font-semibold">
      {formatLevel(level)}
    </span>
  );
}

export function VersionPill({ version }: { version: string }) {
  return (
    <span className="rounded-full border border-[var(--border)] px-2 py-0.5 font-mono text-xs text-[var(--muted-foreground)]">
      v{version}
    </span>
  );
}

export function TagList({ tags, className = "" }: { tags: string[]; className?: string }) {
  if (tags.length === 0) return null;
  return (
    <ul className={`flex flex-wrap gap-3 font-mono text-xs text-[var(--tint-foreground)] ${className}`}>
      {tags.map((tag) => (
        <li key={tag}>{tag}</li>
      ))}
    </ul>
  );
}

/**
 * Complete is a filled circle, in progress is a ring, not started is a small grey
 * dot — the workhorse of every session list in the mockups.
 */
export function StatusDot({ status }: { status: CourseSession["status"] }) {
  if (status === "complete") {
    return <span aria-hidden className="size-2.5 rounded-full bg-[var(--color-leaf-500)]" />;
  }
  if (status === "in_progress") {
    return (
      <span
        aria-hidden
        className="size-2.5 rounded-full border-2 border-[var(--color-leaf-500)]"
      />
    );
  }
  return <span aria-hidden className="size-2 rounded-full bg-[var(--color-stone-300)]" />;
}

export const STATUS_LABELS: Record<CourseSession["status"], string> = {
  complete: "Complete",
  in_progress: "In progress",
  not_started: "Not started",
};
