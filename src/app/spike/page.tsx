"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * M1 — the bridge spike. Throwaway page, deleted once the real player lands.
 *
 * It answers the one question the whole architecture rests on: does an existing
 * Docker worksheet work unchanged inside a sandboxed, cross-origin iframe when
 * window.storage is supplied over postMessage?
 *
 * Deliberately memory-only. No API, no database, no auth — if this page works,
 * the rest is ordinary CRUD.
 */

const COURSES_ORIGIN =
  process.env.NEXT_PUBLIC_COURSES_ORIGIN ?? "http://127.0.0.1:3101";
const ENTRY = "/docker-fundamentals/1.0.0/docker-session-1-worksheet.html";

type Request = { v: 1; id: number; method: string; params?: Record<string, unknown> };

type LogLine = { at: string; text: string; kind: "in" | "out" | "note" };

export default function SpikePage() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const storeRef = useRef(new Map<string, string>());
  const [log, setLog] = useState<LogLine[]>([]);
  const [keys, setKeys] = useState<string[]>([]);

  const push = useCallback((kind: LogLine["kind"], text: string) => {
    const at = new Date().toLocaleTimeString([], { hour12: false });
    setLog((prev) => [{ at, text, kind }, ...prev].slice(0, 60));
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const frame = frameRef.current;
      if (!frame) return;

      /**
       * The frame is sandboxed without allow-same-origin, so its document has an
       * opaque origin and event.origin arrives as the string "null". There is no
       * origin to check, so identity comes from the window handle instead: this
       * message must have been sent by the exact frame we mounted.
       */
      if (event.source !== frame.contentWindow) return;

      const msg = event.data as Request | undefined;
      if (!msg || msg.v !== 1 || typeof msg.id !== "number") return;

      const params = (msg.params ?? {}) as { key?: string; value?: string };
      const store = storeRef.current;
      let result: unknown;

      switch (msg.method) {
        case "storage.get": {
          const value = store.get(String(params.key)) ?? null;
          result = { value };
          push("in", `storage.get("${params.key}") → ${value ? `${value.length} bytes` : "null"}`);
          break;
        }
        case "storage.set": {
          store.set(String(params.key), String(params.value));
          result = { ok: true };
          push("in", `storage.set("${params.key}", ${String(params.value).length} bytes)`);
          break;
        }
        case "storage.delete": {
          store.delete(String(params.key));
          result = { ok: true };
          push("in", `storage.delete("${params.key}")`);
          break;
        }
        case "bud.ready": {
          result = { ok: true };
          push("note", "bud.ready()");
          break;
        }
        default: {
          push("note", `unknown method ${msg.method}`);
          (event.source as Window).postMessage(
            { v: 1, id: msg.id, error: { code: "unknown_method", message: msg.method } },
            "*",
          );
          return;
        }
      }

      setKeys([...store.keys()].sort());

      /**
       * "*" is unavoidable here: an opaque origin cannot be named as a
       * targetOrigin. It is safe because the reply goes to one specific window
       * handle — the frame we just verified — not to every listener. This is the
       * single documented exception to the never-"*" rule.
       */
      (event.source as Window).postMessage({ v: 1, id: msg.id, result }, "*");
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [push]);

  return (
    <main className="flex h-dvh flex-col gap-4 p-6">
      <header className="flex items-baseline gap-3">
        <h1 className="text-2xl">Bridge spike</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Docker session 1, unmodified, in a sandboxed cross-origin frame. Tick boxes and
          type notes, then reload — state should survive in memory.
        </p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_360px] gap-4">
        <iframe
          ref={frameRef}
          title="Docker session 1"
          src={`${COURSES_ORIGIN}${ENTRY}`}
          /* No allow-same-origin. That is the point: the frame gets an opaque
             origin and cannot reach this document's cookies, storage or DOM. */
          sandbox="allow-scripts allow-forms allow-popups"
          className="h-full w-full rounded-[var(--radius-card)] border border-[var(--border)] bg-white"
        />

        <aside className="flex min-h-0 flex-col gap-3">
          <section className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-3">
            <h2 className="font-mono text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
              Keys held
            </h2>
            <ul className="mt-2 space-y-1 font-mono text-xs">
              {keys.length === 0 ? (
                <li className="text-[var(--muted-foreground)]">none yet</li>
              ) : (
                keys.map((k) => (
                  <li key={k} className="text-[var(--tint-foreground)]">
                    {k}
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="flex min-h-0 flex-1 flex-col rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-3">
            <h2 className="font-mono text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
              Bridge traffic
            </h2>
            <ol className="mt-2 min-h-0 flex-1 space-y-1 overflow-auto font-mono text-xs">
              {log.length === 0 ? (
                <li className="text-[var(--muted-foreground)]">waiting for the course…</li>
              ) : (
                log.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-[var(--muted-foreground)]">{line.at}</span>
                    <span
                      className={
                        line.kind === "note"
                          ? "text-[var(--accent-foreground)]"
                          : "text-[var(--tint-foreground)]"
                      }
                    >
                      {line.text}
                    </span>
                  </li>
                ))
              )}
            </ol>
          </section>
        </aside>
      </div>
    </main>
  );
}
