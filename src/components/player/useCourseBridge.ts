"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BudApiError, BudApiUnreachableError, budApi } from "@/lib/api";

/**
 * The shell half of the course bridge — Overall Plan §3, contract v1.
 *
 * A course runs in a sandboxed frame on another origin and can only reach Bud by
 * postMessage. This hook answers those calls against the API, scoped to the current
 * user, course and session. The course never sends a course id: it cannot be trusted
 * to, and it does not need to, because the shell knows what it mounted.
 *
 * Everything here was learned from the M1 spike and is load-bearing:
 *
 *   - The listener is attached before the frame's src is set. Server-rendered, the
 *     frame would otherwise start loading before hydration and its first storage.get
 *     would arrive with nobody listening — the course then starts from a blank sheet
 *     and the learner silently loses their work.
 *   - Identity is `event.source`, not `event.origin`. Sandboxed without
 *     allow-same-origin the frame has an opaque origin, so origin arrives as "null"
 *     and cannot be named as a targetOrigin when replying.
 *   - Replies go to that one window handle with "*", the single documented exception
 *     to the never-"*" rule in Tech-Information §11.
 */

/** Long enough for a slow course, short enough that a hung load is not a mystery. */
const LOAD_TIMEOUT_MS = 12_000;

export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string; permanent: boolean };

/** describe() always produces this variant, so callers can read .message. */
type SaveError = Extract<SaveState, { status: "error" }>;

type Request = { v: 1; id: number; method: string; params?: Record<string, unknown> };

export type CourseBridgeOptions = {
  slug: string;
  sessionKey: string;
  /** Absolute URL of the session's entry file on the courses origin. */
  src: string;
  /** Called when the course changes progress, so the shell can re-read it. */
  onProgressChanged?: () => void;
};

export function useCourseBridge({
  slug,
  sessionKey,
  src,
  onProgressChanged,
}: CourseBridgeOptions) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [save, setSave] = useState<SaveState>({ status: "idle" });

  /**
   * Both of these are tracked *by src* rather than as bare booleans, so moving to
   * another session resets them without an effect having to write state during
   * render — `loaded` for the previous session must not count for the next one.
   */
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [slowSrc, setSlowSrc] = useState<string | null>(null);
  const loaded = loadedSrc === src;
  const slow = slowSrc === src && !loaded;

  // Kept in a ref so the listener is attached once and never re-attached mid-session.
  const ctx = useRef({ slug, sessionKey, onProgressChanged });
  useEffect(() => {
    ctx.current = { slug, sessionKey, onProgressChanged };
  });

  const describe = useCallback((error: unknown): SaveError => {
    if (error instanceof BudApiUnreachableError) {
      return { status: "error", message: "Can't reach Bud. Your work is in this tab only.", permanent: false };
    }
    if (error instanceof BudApiError) {
      if (error.code === "not_enrolled") {
        return { status: "error", message: "You're not enrolled in this course.", permanent: true };
      }
      if (error.code === "storage_quota_exceeded" || error.code === "storage_key_limit_reached") {
        return { status: "error", message: "This course has run out of saved space.", permanent: true };
      }
      if (error.code === "storage_value_too_large") {
        return { status: "error", message: "That's too much to save in one go.", permanent: true };
      }
      if (error.statusCode === 429) {
        return { status: "error", message: "Saving too fast. Pausing for a moment.", permanent: false };
      }
      return { status: "error", message: "Couldn't save that.", permanent: error.isPermanent };
    }
    return { status: "error", message: "Couldn't save that.", permanent: false };
  }, []);

  useEffect(() => {
    function reply(source: Window, id: number, result: unknown) {
      // "*" is unavoidable: an opaque origin cannot be named. Safe because this
      // goes to one verified window handle, not a broadcast.
      source.postMessage({ v: 1, id, result }, "*");
    }

    function replyError(source: Window, id: number, code: string, message: string) {
      source.postMessage({ v: 1, id, error: { code, message } }, "*");
    }

    async function onMessage(event: MessageEvent) {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;

      const msg = event.data as Request | undefined;
      if (!msg || msg.v !== 1 || typeof msg.id !== "number") return;

      const source = event.source as Window;
      const params = (msg.params ?? {}) as { key?: string; value?: string; fraction?: number };
      const { slug: courseSlug, sessionKey: key, onProgressChanged: changed } = ctx.current;

      try {
        switch (msg.method) {
          case "storage.get": {
            const result = await budApi.getState(courseSlug, String(params.key));
            reply(source, msg.id, result);
            return;
          }
          case "storage.set": {
            setSave({ status: "saving" });
            await budApi.putState(courseSlug, String(params.key), String(params.value));
            setSave({ status: "saved" });
            reply(source, msg.id, { ok: true });
            return;
          }
          case "storage.delete": {
            setSave({ status: "saving" });
            await budApi.deleteState(courseSlug, String(params.key));
            setSave({ status: "saved" });
            reply(source, msg.id, { ok: true });
            return;
          }
          case "bud.complete": {
            // The course suggests; the shell records. Its own state blob is untouched.
            await budApi.completeSession(courseSlug, key);
            changed?.();
            reply(source, msg.id, { ok: true });
            return;
          }
          case "bud.progress": {
            await budApi.reportProgress(courseSlug, key, Number(params.fraction));
            changed?.();
            reply(source, msg.id, { ok: true });
            return;
          }
          case "bud.ready": {
            setLoadedSrc(src);
            reply(source, msg.id, { ok: true });
            return;
          }
          case "bud.height": {
            // Defined in the contract, unused here: the worksheets are full pages
            // with their own scroll, so the frame owns scrolling.
            reply(source, msg.id, { ok: true });
            return;
          }
          default:
            replyError(source, msg.id, "unknown_method", msg.method);
        }
      } catch (error) {
        const state = describe(error);
        setSave(state);
        replyError(source, msg.id, "bud_error", state.message);
      }
    }

    window.addEventListener("message", onMessage);

    // Only now is it safe to load the course.
    const frame = frameRef.current;
    if (frame && frame.getAttribute("src") !== src) frame.setAttribute("src", src);

    return () => window.removeEventListener("message", onMessage);
  }, [src, describe]);

  /**
   * The worksheets load Google Fonts render-blocking. When that request hangs rather
   * than fails, the course's own script never runs and the frame sits blank forever.
   * Saying so beats an indefinite spinner.
   */
  useEffect(() => {
    const timer = setTimeout(() => setSlowSrc(src), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [src]);

  const onFrameLoad = useCallback(() => setLoadedSrc(src), [src]);

  return { frameRef, save, loaded, slow, onFrameLoad };
}
