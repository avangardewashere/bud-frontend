import type { SaveState } from "./useCourseBridge";

/**
 * "Saved" — Design.md §8, which is emphatic that it reads "Saved" and not
 * "Successfully saved your progress!".
 *
 * The shell shows this as well as the course's own flash, because the worksheets
 * report failure as a small grey message that is easy to miss, and a failed save is
 * the one thing a learner must not miss.
 */
export function SavedIndicator({ save }: { save: SaveState }) {
  if (save.status === "idle") return null;

  if (save.status === "error") {
    return (
      <span role="status" className="flex items-center gap-1.5 text-sm text-[var(--danger)]">
        <span aria-hidden className="size-2 rounded-full bg-[var(--danger)]" />
        {save.message}
      </span>
    );
  }

  return (
    <span
      role="status"
      className="flex items-center gap-1.5 text-sm text-[var(--muted-foreground)]"
    >
      <span
        aria-hidden
        className={
          "size-2 rounded-full " +
          (save.status === "saving"
            ? "bg-[var(--color-stone-300)]"
            : "bg-[var(--color-leaf-500)]")
        }
      />
      {save.status === "saving" ? "Saving…" : "Saved"}
    </span>
  );
}
