"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BudApiError, BudApiUnreachableError, BudApiWakingError, budApi } from "@/lib/api";
import { courseWrites, noteKey } from "./stateWrites";
import type { SaveState } from "./useCourseBridge";

/**
 * A learner's note for one session: what they type, and getting it saved.
 *
 * Autosaves rather than asking anyone to press a button — the worksheets already work
 * that way, and a note nobody remembered to save is worse than no note. Writes go
 * through the same queue as course state (stateWrites.ts), so a note, like a
 * worksheet, cannot be rolled back by a retry of an older write, and a save the API
 * slept through is sent again rather than lost.
 *
 * Clearing the text deletes the note: the API stores no empty notes, and a screen
 * that showed "Saved" over an empty box while the server still held yesterday's note
 * would be lying.
 *
 * Which means this hook has to be careful about one thing above all: **what the
 * server holds is not "what my last save returned"**. A write that is in flight, or
 * that failed and is waiting to be re-sent, has already promised the server a value.
 * Treating those as "not saved yet" made clearing the box do nothing at all, and the
 * queue then wrote the deleted note back a minute later under a "Saved" label.
 */

const AUTOSAVE_AFTER_MS = 800;

/**
 * What this tab last knew each note to be, and when it learned it.
 *
 * A page hands the panel the note as it was when that page was rendered — and the
 * browser's Back button replays a page from its cache, so "rendered" can be well
 * behind. Seeding the editor from that shows an empty box for a note that exists, and
 * the next keystroke saves the empty box over it. This is the tab's own memory, which
 * outlives any single mount, and it wins whenever it is the more recent of the two.
 */
const lastKnown = new Map<string, { value: string; at: number }>();

function remember(lane: string, value: string, at: number) {
  const known = lastKnown.get(lane);
  if (!known || known.at <= at) lastKnown.set(lane, { value, at });
}

export type InitialNote = { bodyMd: string; updatedAt: string | null };

export function useSessionNote({
  slug,
  sessionKey,
  initial,
}: {
  slug: string;
  sessionKey: string;
  /** The note as the page read it, with when the server last changed it. */
  initial: InitialNote;
}) {
  const lane = noteKey(slug, sessionKey);

  /**
   * What the editor opens with. Three sources, newest first:
   *
   *   1. a write this tab has made that the server has not taken yet — queued, in
   *      flight, or failed and waiting to be re-sent. Nothing is newer than that;
   *   2. this tab's own memory, when it is newer than the page's copy — which is how
   *      a page replayed from the browser's back/forward cache is caught;
   *   3. the note the page was rendered with.
   *
   * State per mount, and the player remounts when the session changes, so a new
   * session brings a new editor. A newer note for the *same* session (after a
   * refresh) deliberately does not land here: it would take the editor out from under
   * whoever is typing in it.
   */
  const [value, setValue] = useState(() => {
    const queued = courseWrites.latest(lane);
    if (queued) return queued.kind === "set" ? queued.value : "";
    const known = lastKnown.get(lane);
    const pageAt = Date.parse(initial.updatedAt ?? "") || 0;
    return known && known.at > pageAt ? known.value : initial.bodyMd;
  });
  const [save, setSave] = useState<SaveState>({ status: "idle" });

  /**
   * What this tab has asked the server to hold. Set when a write is queued rather
   * than when it resolves, because the queue keeps a failed write and sends it again
   * — so from the moment it is queued, that value is what the server holds or is
   * about to. Taken back only for a failure the queue will not re-send.
   */
  const savedValue = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // What the page brought is worth remembering too, if it is the newest thing around.
  useEffect(() => {
    remember(lane, initial.bodyMd, Date.parse(initial.updatedAt ?? "") || 0);
  }, [lane, initial.bodyMd, initial.updatedAt]);

  const write = useCallback(
    async (next: string) => {
      const previous = savedValue.current;
      savedValue.current = next;
      remember(noteKey(slug, sessionKey), next, Date.now());
      setSave({ status: "saving" });
      try {
        await courseWrites.write(
          noteKey(slug, sessionKey),
          // A cleared note is a delete, so the queue's idea of "latest" matches the
          // server's: nothing, rather than an empty string.
          next.trim() === "" ? { kind: "delete" } : { kind: "set", value: next },
          async (signal) => {
            await budApi.saveNote(slug, sessionKey, next, { signal });
          },
        );
        setSave({ status: "saved" });
      } catch (error) {
        // An unreachable API means the queue still carries this value and will try
        // again; anything else (a 4xx, a sign-out) means the server kept the old one.
        if (!(error instanceof BudApiUnreachableError)) savedValue.current = previous;
        setSave(describeNoteError(error));
      }
    },
    [slug, sessionKey],
  );

  const change = useCallback(
    (next: string) => {
      setValue(next);
      if (timer.current) clearTimeout(timer.current);
      if (next === savedValue.current) {
        // Typed back to what the server has, or is about to have: nothing to do.
        setSave((s) => (s.status === "saving" ? { status: "saved" } : s));
        return;
      }
      setSave({ status: "saving" });
      timer.current = setTimeout(() => void write(next), AUTOSAVE_AFTER_MS);
    },
    [write],
  );

  /** Save now rather than in 800ms — when the panel closes, or the tab is hidden. */
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (value !== savedValue.current) void write(value);
  }, [value, write]);

  // Switching tabs or closing the laptop should not cost anyone the last thing they
  // typed. (The player also warns on unload while anything is unsaved.)
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [flush]);

  /**
   * Typed but not yet sent: for that stretch the note exists only here, and the
   * queue — which the player's leave-page warning asks — does not know about it yet.
   */
  useEffect(() => {
    if (value === savedValue.current) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [value]);

  // A re-send of this note landed (or failed for good) — stateWrites.ts retries on
  // its own schedule, long after the save that started it gave up.
  useEffect(() => {
    return courseWrites.subscribe(({ key, ok }) => {
      if (key !== noteKey(slug, sessionKey)) return;
      setSave(
        ok
          ? { status: "saved" }
          : {
              status: "error",
              message: "Still can't reach Bud. Your note is in this tab — keep it open.",
              permanent: false,
            },
      );
    });
  }, [slug, sessionKey]);

  return { value, change, flush, save, hasNote: value.trim() !== "" };
}

/** Design.md §8: say what happened, and whether their work is safe. */
function describeNoteError(error: unknown): SaveState {
  if (error instanceof BudApiWakingError) {
    return {
      status: "error",
      message: "Bud's server is waking up. Your note is safe here and will save when it's back.",
      permanent: false,
    };
  }
  if (error instanceof BudApiUnreachableError) {
    return {
      status: "error",
      message: "Can't reach Bud. Your note is in this tab and will save when Bud is back.",
      permanent: false,
    };
  }
  if (error instanceof BudApiError) {
    if (error.code === "not_enrolled") {
      return { status: "error", message: "You're not enrolled in this course.", permanent: true };
    }
    if (error.statusCode === 413 || error.code === "payload_too_large") {
      return { status: "error", message: "That note is too long to save.", permanent: true };
    }
    if (error.statusCode === 429) {
      return { status: "error", message: "Too many saves just now. Try again in a moment.", permanent: false };
    }
    return { status: "error", message: "Couldn't save that note.", permanent: error.isPermanent };
  }
  return { status: "error", message: "Couldn't save that note.", permanent: false };
}
