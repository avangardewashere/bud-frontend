/**
 * Is the API waking up? A tiny store the browser client feeds and WakingNotice reads.
 *
 * On the $0 deploy the API sleeps after 15 idle minutes and takes about a minute to
 * start. Vercel's rewrite holds a request while it does, so a cold start mostly looks
 * like a call that simply takes a very long time — rather than an error — and
 * occasionally like a gateway error, which the client retries. Either way the person
 * using Bud deserves to know why nothing is happening, so any call that is still
 * waiting after WAKING_NOTICE_AFTER_MS, or that is being retried, raises the notice.
 * It clears the moment nothing is slow or retrying any more.
 *
 * Browser-only state: on the server nothing records here, and the notice's server
 * snapshot is always "not waking".
 */

/** Past this, a call is no longer just slow — warm calls answer in well under a second. */
export const WAKING_NOTICE_AFTER_MS = 4000;

/** How long to wait before each retry of a call the gateway answered for. */
export const WAKING_RETRY_DELAYS_MS = [4000, 12000] as const;

/**
 * Server components give up after this and let the error boundary take over, which
 * shows the waking page and retries by itself. Waiting out a cold start instead would
 * leave a blank tab for a minute. Long enough for a sleeping database (Neon wakes in a
 * second or two), far short of a sleeping API.
 */
export const SERVER_API_TIMEOUT_MS = 5000;

let slow = 0;
let retrying = 0;
const listeners = new Set<() => void>();

/** A listener that throws must not leave a counter raised and the notice stuck on. */
function emit() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Ignored: the store's own bookkeeping has already happened.
    }
  }
}

export function isWaking() {
  return slow > 0 || retrying > 0;
}

export function subscribeWaking(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Call when a request starts; call the returned function when it settles, however it
 * settles. If it was still waiting after WAKING_NOTICE_AFTER_MS it counted as slow
 * until then.
 */
export function trackSlowCall(): () => void {
  let counted = false;
  const timer = setTimeout(() => {
    counted = true;
    slow += 1;
    emit();
  }, WAKING_NOTICE_AFTER_MS);

  return () => {
    clearTimeout(timer);
    if (counted) {
      slow -= 1;
      emit();
    }
  };
}

/** For the span between a gateway failure and the retry that follows it. */
export function trackRetry(): () => void {
  retrying += 1;
  emit();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    retrying -= 1;
    emit();
  };
}

/** Resolves after `ms`, or rejects as soon as `signal` aborts. Leaves no listener behind. */
export function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
