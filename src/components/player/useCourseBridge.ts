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
  const ctx = useRef({ slug, sessionKey, onProgressChanged, src });
  useEffect(() => {
    ctx.current = { slug, sessionKey, onProgressChanged, src };
  });

  /**
   * The port belongs to the mounted document, so its lifetime is tied to `src` and
   * not to an effect invocation. Closing it in an effect cleanup silently killed the
   * bridge: a re-render with the same src (a router.refresh(), or React's
   * development double-invoke) tore the port down, and since the frame was not
   * reloaded, bridge.js never said hello again and every later call queued forever.
   */
  const portRef = useRef<{ src: string; port: MessagePort } | null>(null);

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

  /**
   * Attached once, for the life of the player. The handler reads the current course
   * and session from a ref, so it never needs re-attaching — and a hello can never
   * fall into the gap between removing and re-adding a listener.
   */
  useEffect(() => {
    const send = (message: unknown) => portRef.current?.port.postMessage(message);

    async function handle(msg: Request) {
      const reply = (result: unknown) => send({ v: 1, id: msg.id, result });
      const replyError = (code: string, message: string) =>
        send({ v: 1, id: msg.id, error: { code, message } });

      const params = (msg.params ?? {}) as { key?: string; value?: string; fraction?: number };
      const { slug: courseSlug, sessionKey: key, onProgressChanged: changed, src: current } = ctx.current;

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
            setLoadedSrc(current);
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

      /**
       * One channel per mounted document, ever. A second hello is either a document
       * the course navigated to asking for a channel of its own, or a bug — and the
       * window handle cannot tell them apart, because a WindowProxy follows the
       * frame across navigation.
       */
      if (portRef.current) return;

      const msg = event.data as { v?: number; hello?: boolean } | undefined;
      if (!msg || msg.v !== 1 || msg.hello !== true) return;

      const channel = new MessageChannel();
      channel.port1.onmessage = (e) => {
        const request = e.data as Request | undefined;
        if (!request || request.v !== 1 || typeof request.id !== "number") return;
        void handle(request);
      };
      channel.port1.start();
      portRef.current = { src: ctx.current.src, port: channel.port1 };

      /**
       * "*" is unavoidable — the frame's origin is opaque and cannot be named — but
       * this message carries only the port. Everything worth stealing travels on the
       * port afterwards, and only the document holding it can receive that.
       */
      target.postMessage({ v: 1, type: "bud.channel" }, "*", [channel.port2]);
    }

    window.addEventListener("message", onHello);
    return () => {
      window.removeEventListener("message", onHello);
      portRef.current?.port.close();
      portRef.current = null;
    };
  }, [describe]);

  /**
   * Loading the course is separate from listening, and deliberately second: the
   * listener above is already attached, so the course's first storage.get — which
   * the worksheets make while parsing — can never arrive with nobody to hear it.
   */
  useEffect(() => {
    // A different session means a different document, so the old port is dead.
    if (portRef.current && portRef.current.src !== src) {
      portRef.current.port.close();
      portRef.current = null;
    }

    const frame = frameRef.current;
    if (frame && frame.getAttribute("src") !== src) frame.setAttribute("src", src);
  }, [src]);

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
