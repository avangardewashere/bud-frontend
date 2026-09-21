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
 * ── Replies go over a MessagePort, not to the frame's window ──
 *
 * Posting replies to the frame's window handle leaked. A WindowProxy follows the
 * browsing context across navigation rather than pointing at a document, so a course
 * could call storage.get, navigate its own frame to a page it controlled, and receive
 * the reply there — handing a learner's saved work to an attacker-chosen document and
 * defeating the courses origin's connect-src 'none' by using our own reply as the
 * channel. Verified in Chromium; Planning/bridge-reply-probe.mjs reproduces it.
 *
 * Re-checking the handle before replying does NOT fix it. The comparison is not a
 * dependable signal — the probe leaks even in the run that reports the handles as
 * different. A port fixes it structurally: a MessagePort belongs to the document that
 * received it, so after a navigation the new document has nothing to receive on.
 *
 * The handshake that transfers the port carries no data, so "*" on that one message is
 * harmless. It is honoured once per mounted document: bridge.js says hello while the
 * course is still parsing, so the first hello is always the page we mounted.
 *
 * Other invariants, from the M1 spike:
 *   - The listener is attached before the frame's src is set. Otherwise the frame
 *     starts loading before hydration, its first storage.get arrives with nobody
 *     listening, and the course silently starts from a blank sheet.
 *   - The frame is sandboxed without allow-same-origin, so its origin is opaque.
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
   * Tracked by src rather than as bare booleans, so moving to another session
   * resets them without an effect writing state during render.
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
      return {
        status: "error",
        message: "Can't reach Bud. Your work is in this tab only.",
        permanent: false,
      };
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
    let port: MessagePort | null = null;

    async function handle(msg: Request) {
      const reply = (result: unknown) => port?.postMessage({ v: 1, id: msg.id, result });
      const replyError = (code: string, message: string) =>
        port?.postMessage({ v: 1, id: msg.id, error: { code, message } });

      const params = (msg.params ?? {}) as { key?: string; value?: string; fraction?: number };
      const { slug: courseSlug, sessionKey: key, onProgressChanged: changed } = ctx.current;

      try {
        switch (msg.method) {
          case "storage.get":
            reply(await budApi.getState(courseSlug, String(params.key)));
            return;
          case "storage.set":
            setSave({ status: "saving" });
            await budApi.putState(courseSlug, String(params.key), String(params.value));
            setSave({ status: "saved" });
            reply({ ok: true });
            return;
          case "storage.delete":
            setSave({ status: "saving" });
            await budApi.deleteState(courseSlug, String(params.key));
            setSave({ status: "saved" });
            reply({ ok: true });
            return;
          case "bud.complete":
            // The course suggests; the shell records. Its own state blob is untouched.
            await budApi.completeSession(courseSlug, key);
            changed?.();
            reply({ ok: true });
            return;
          case "bud.progress":
            await budApi.reportProgress(courseSlug, key, Number(params.fraction));
            changed?.();
            reply({ ok: true });
            return;
          case "bud.ready":
            setLoadedSrc(src);
            reply({ ok: true });
            return;
          case "bud.height":
            // Defined in the contract, unused here: the worksheets are full pages
            // with their own scroll, so the frame owns scrolling.
            reply({ ok: true });
            return;
          default:
            replyError("unknown_method", msg.method);
        }
      } catch (error) {
        const state = describe(error);
        setSave(state);
        replyError("bud_error", state.message);
      }
    }

    function onHello(event: MessageEvent) {
      const target = frameRef.current?.contentWindow;
      if (!target || event.source !== target) return;
      if (port) return; // one channel per mounted document

      const msg = event.data as { v?: number; hello?: boolean } | undefined;
      if (!msg || msg.v !== 1 || msg.hello !== true) return;

      const channel = new MessageChannel();
      port = channel.port1;
      port.onmessage = (e) => {
        const request = e.data as Request | undefined;
        if (!request || request.v !== 1 || typeof request.id !== "number") return;
        void handle(request);
      };
      port.start();

      /**
       * "*" is unavoidable — the frame's origin is opaque and cannot be named — but
       * this message carries only the port. Everything worth stealing travels on the
       * port afterwards, and only the document holding it can receive that.
       */
      target.postMessage({ v: 1, type: "bud.channel" }, "*", [channel.port2]);
    }

    window.addEventListener("message", onHello);

    // Only now is it safe to load the course.
    const frame = frameRef.current;
    if (frame && frame.getAttribute("src") !== src) frame.setAttribute("src", src);

    return () => {
      window.removeEventListener("message", onHello);
      port?.close();
      port = null;
    };
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
