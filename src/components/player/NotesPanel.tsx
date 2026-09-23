"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Markdown } from "@/components/ui/Markdown";
import { budApi } from "@/lib/api";
import { SavedIndicator } from "./SavedIndicator";
import type { useSessionNote } from "./useSessionNote";

/**
 * Where the `notes.md` every Docker session asks for actually gets written
 * (Overall Plan §5.7).
 *
 * Two things this is careful about:
 *
 * **Whose notes these are.** The worksheet inside the frame has its own little note
 * boxes, saved as course state. These are different: they belong to Bud, they survive
 * a course being re-uploaded, and they are what "Export notes" exports. The heading
 * says so rather than leaving a learner to guess which box to type in.
 *
 * **What the session asked for.** The manifest's `deliverable` line is shown at the
 * top, so the ask and the answer are on the same screen — otherwise it lives in the
 * worksheet the panel is covering.
 *
 * Markdown, with a preview, because notes.md is a Markdown file: someone writing one
 * wants to see their headings and lists, and the preview is the same renderer the
 * course outline uses — which never renders raw HTML.
 */
export function NotesPanel({
  slug,
  session,
  note,
  onClose,
}: {
  slug: string;
  session: { key: string; order: number; title: string; deliverable: string | null };
  note: ReturnType<typeof useSessionNote>;
  onClose?: () => void;
}) {
  const [preview, setPreview] = useState(false);
  // useId, not the session key: the drawer and the phone sheet can both be mounted
  // across a breakpoint change, and two labels pointing at one id would send a
  // learner's typing to the wrong box.
  const textareaId = useId();
  const editorRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Opening the panel puts the cursor in it. Without this a keyboard user pressing
   * Notes has nowhere to go: the panel comes after the course frame in the document,
   * so the next Tab walks into the sandboxed course instead.
   */
  useEffect(() => {
    editorRef.current?.focus();
  }, []);

  return (
    <div
      className="flex h-full min-w-0 flex-col gap-3 [overflow-wrap:anywhere]"
      onKeyDown={(event) => {
        if (event.key === "Escape" && onClose) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">Your notes</h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Session {session.order} · kept by Bud, not by the course
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SavedIndicator save={note.save} subject="Note" />
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notes"
              className="rounded px-2 text-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {session.deliverable && (
        <p
          data-testid="session-ask"
          className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-xs leading-relaxed"
        >
          <span className="font-semibold">This session asks for: </span>
          {session.deliverable}
        </p>
      )}

      <div className="flex items-center gap-1 text-sm">
        <TabButton active={!preview} onClick={() => setPreview(false)}>
          Write
        </TabButton>
        <TabButton active={preview} onClick={() => setPreview(true)}>
          Preview
        </TabButton>
      </div>

      {preview ? (
        <div
          data-testid="note-preview"
          className="min-h-0 flex-1 overflow-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
        >
          {note.hasNote ? (
            <Markdown>{note.value}</Markdown>
          ) : (
            <p className="text-[var(--muted-foreground)]">Nothing written yet.</p>
          )}
        </div>
      ) : (
        <>
          <label htmlFor={textareaId} className="sr-only">
            Your notes for session {session.order}, {session.title}
          </label>
          <textarea
            ref={editorRef}
            id={textareaId}
            data-testid="note-editor"
            value={note.value}
            onChange={(event) => note.change(event.target.value)}
            onBlur={note.flush}
            spellCheck
            placeholder="What clicked, what didn't, and the command you'll want again next week. Markdown works."
            className="min-h-0 flex-1 resize-none rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 font-mono text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)]"
          />
        </>
      )}

      <div className="flex shrink-0 items-center justify-between gap-3 text-sm">
        <Link
          href={`/courses/${slug}/notes`}
          className="text-[var(--tint-foreground)] hover:underline"
        >
          All notes
        </Link>
        {/*
          A plain link, so the browser downloads it with the name the API gives it.
          Same-origin through the /api rewrite, so the session cookie goes along.
        */}
        <a
          href={budApi.notesExportUrl(slug)}
          className="text-[var(--tint-foreground)] hover:underline"
        >
          Export notes
        </a>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "rounded-[10px] px-3 py-1 transition-colors duration-200 " +
        (active
          ? "bg-[var(--tint)] font-semibold text-[var(--tint-foreground)]"
          : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]")
      }
    >
      {children}
    </button>
  );
}
