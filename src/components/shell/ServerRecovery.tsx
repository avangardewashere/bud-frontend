"use client";

import { useEffect, useRef, useState } from "react";
import { Bud } from "@/components/bud";
import { Button } from "@/components/ui/Button";
import { wait } from "@/lib/api/waking";

/**
 * What a page shows when its server render failed — and, on the $0 deploy, the page
 * most people will meet after a cold start.
 *
 * Server components give up on a sleeping API after a few seconds (see
 * SERVER_API_TIMEOUT_MS) and land here. In production the error that arrives carries
 * no message, only a digest, so this cannot tell "asleep" from "broken" by looking at
 * it. It asks the API instead: it polls /api/ready, and
 *   - while that does not answer, it says the server is waking up and keeps polling;
 *   - once it answers, it retries the page by itself — once;
 *   - if the page fails again with the API awake, it is a real error, and it says so,
 *     with a Try again button, rather than retrying forever.
 *
 * Deliberately not a loading.tsx: a streamed loading screen fixes the response status
 * at 200 before the layouts run, turning real 404s and sign-in redirects into
 * soft ones. Here statuses stay honest and the waiting is still explained.
 */

type Phase = "checking" | "waking" | "broken" | "gave-up";

/** How long "checking" may take before it reads as "waking" rather than a blip. */
const CHECKING_GRACE_MS = 1500;
const POLL_EVERY_MS = 3000;
/** Past this, stop polling and hand the decision to the person. */
const GIVE_UP_AFTER_MS = 3 * 60 * 1000;
/**
 * One automatic retry per this window. Module state, not component state: when a
 * retry fails the boundary mounts a fresh instance, and it must remember that the
 * last automatic retry was moments ago.
 */
const AUTO_RETRY_WINDOW_MS = 60 * 1000;
let lastAutoRetry = 0;

/**
 * Is the API ready to serve the page — in JSON, database included? Anything else (an
 * error page, a 503 while the database wakes, a hang) is "not yet".
 *
 * /ready rather than /health: the page that failed needs the database, and on the free
 * deploy the database sleeps too. Retrying the moment /health answers could spend the
 * one automatic retry on a first query still waiting for the database, and show
 * "couldn't load" for what was only a slow start. This page only exists after a failure,
 * so the database it wakes is one the retried page is about to need anyway.
 *
 * The two abort sources are merged by hand: AbortSignal.any is missing from part of
 * the browser range this app supports, and there it would throw inside the try and
 * make this answer "not yet" forever.
 */
async function apiAnswers(signal: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, 90_000);
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch("/api/ready", { cache: "no-store", signal: controller.signal });
    return response.ok && (response.headers.get("content-type") ?? "").includes("json");
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

export function ServerRecovery({ retry, digest }: { retry: () => void; digest?: string }) {
  const [phase, setPhase] = useState<Phase>("checking");
  // Next may hand over a new retry function each render; the polling loop should
  // neither restart for that nor call a stale one.
  const retryRef = useRef(retry);
  useEffect(() => {
    retryRef.current = retry;
  });

  useEffect(() => {
    const controller = new AbortController();
    const started = Date.now();
    const grace = setTimeout(
      () => setPhase((p) => (p === "checking" ? "waking" : p)),
      CHECKING_GRACE_MS,
    );

    (async () => {
      while (!controller.signal.aborted) {
        if (await apiAnswers(controller.signal)) {
          if (controller.signal.aborted) return;
          if (Date.now() - lastAutoRetry > AUTO_RETRY_WINDOW_MS) {
            lastAutoRetry = Date.now();
            retryRef.current();
          } else {
            setPhase("broken");
          }
          return;
        }
        if (controller.signal.aborted) return;
        if (Date.now() - started > GIVE_UP_AFTER_MS) {
          setPhase("gave-up");
          return;
        }
        setPhase("waking");
        await wait(POLL_EVERY_MS, controller.signal).catch(() => {});
      }
    })();

    return () => {
      clearTimeout(grace);
      controller.abort();
    };
  }, []);

  const copy = COPY[phase];
  const manual = phase === "broken" || phase === "gave-up";

  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <Bud size={96} label={null} />
      {/* One live region for both lines, so a change of phase is read as a whole. */}
      <div role="status" aria-live="polite" aria-atomic="true">
        <h1 className="mt-6 text-2xl" data-testid="recovery-phase" data-phase={phase}>
          {copy.title}
        </h1>
        <p className="mt-2 text-[var(--muted-foreground)]">{copy.body}</p>
      </div>
      {manual && (
        <Button className="mt-6" onClick={() => retry()}>
          Try again
        </Button>
      )}
      {phase === "broken" && digest && (
        <p className="mt-4 font-mono text-xs text-[var(--muted-foreground)]">ref {digest}</p>
      )}
    </main>
  );
}

/**
 * Design.md §8: short, warm, specific. Its error row puts "Couldn't save that. Trying
 * again." against "Oops! Something went wrong" — so say what failed, not that
 * something did.
 */
const COPY: Record<Phase, { title: string; body: string }> = {
  checking: {
    title: "One moment…",
    body: "Checking on Bud's server.",
  },
  waking: {
    title: "Bud's free server is waking up.",
    body: "It naps when nobody has visited for a while, and takes about a minute to get going. This page will carry on by itself.",
  },
  broken: {
    title: "Bud couldn't load this page.",
    body: "That's on Bud's side, not yours. Trying again may help.",
  },
  "gave-up": {
    title: "Bud's server still isn't answering.",
    body: "It usually wakes within a minute or two. Try again, or come back a little later.",
  },
};
