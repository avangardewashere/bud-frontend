/**
 * What to say when a course session loads but never reaches the shell.
 *
 * `bridge.js` posts its hello unconditionally while the course document is still
 * parsing, and addresses it to the origin baked into its own `<script src>` — the one
 * the courses server was configured with. So "no hello" is a single, reliable signal
 * that covers every way this can go wrong on a real deploy:
 *
 *   1. The course pages carry `frame-ancestors <APP_ORIGIN>`. Open the app on any
 *      other hostname the host serves — a per-deployment URL, a branch alias — and the
 *      browser refuses the embed. The document never runs, so no hello.
 *   2. The bridge tag names a different origin than the page is on, so the hello is
 *      posted to a window that isn't listening. The worksheet renders and looks alive,
 *      and silently saves nothing. This is the dangerous one.
 *   3. `bridge.js` itself failed to load, which the script handles by leaving the
 *      course to work in-tab — usable, but with nothing saved.
 *
 * All three used to be silent: the shell cleared its overlay on the frame's `load`
 * event, which fires even for a frame the browser refused, and left a blank rectangle
 * with no message anywhere.
 */

/**
 * How long after the frame's load event to keep waiting for bridge.js's hello.
 *
 * The hello is posted while the course document is still parsing, so in practice it
 * arrives *before* load fires. This is only slack for message delivery being
 * asynchronous — long enough that a busy machine cannot raise a false warning, short
 * enough that someone whose work is not being saved finds out before they have done
 * any. Exported so the test that proves the warning never fires on a healthy course
 * can wait past it rather than guess.
 */
export const HELLO_GRACE_MS = 2_000;

/**
 * The learner's half first — what it means for their work — then the developer's, but
 * only when the shell can actually tell what is wrong.
 *
 * The origins are compared as strings because that is how the browser compares them:
 * `https://app.example` and `https://app.example/` are the same origin, but the two
 * values arriving here have both already been canonicalised, and a difference here is
 * exactly the difference the browser would act on.
 */
export function connectionWarning({
  pageOrigin,
  builtFor,
}: {
  /** Where the browser actually is (`location.origin`). */
  pageOrigin: string;
  /** What this build was told the app's address is (NEXT_PUBLIC_APP_ORIGIN). */
  builtFor: string;
}): string {
  const learner =
    "This session isn't connected to Bud, so nothing you do in it will be saved. " +
    "Reloading usually fixes it.";

  if (pageOrigin !== builtFor) {
    return (
      `${learner} If it doesn't: this app was built for ${builtFor}, and you have it ` +
      `open at ${pageOrigin}. Course pages only talk to the address they were ` +
      `published for.`
    );
  }

  return learner;
}
