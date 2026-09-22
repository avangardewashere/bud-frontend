/**
 * The three origins the shell is built for, and the one place that checks them.
 *
 * Imported by next.config.ts, so it must stay plain TypeScript with no Next or React
 * imports — the config is loaded before either exists.
 *
 * The browser never talks to the API directly. It calls /api on the shell's own
 * origin and the shell forwards it (the rewrite in next.config.ts), because on the
 * free hosts the app and the API are different *sites* — *.vercel.app and
 * *.onrender.com are both public suffixes — and the API's SameSite=Lax session cookie
 * would never cross between them. Through the rewrite the cookie is first-party on
 * the app's host, which is also where server components read it from.
 */

const DEFAULTS = {
  NEXT_PUBLIC_APP_ORIGIN: "http://localhost:3100",
  NEXT_PUBLIC_COURSES_ORIGIN: "http://127.0.0.1:3101",
  BUD_API_ORIGIN: "http://localhost:3102",
} as const;

type OriginName = keyof typeof DEFAULTS;

/**
 * Each read is spelled out as a literal `process.env.NAME`, never `process.env[name]`:
 * Next inlines NEXT_PUBLIC_ values into client bundles only where the name appears
 * literally, so a dynamic lookup would quietly read the development default in the
 * browser.
 */
function values(): Record<OriginName, string | undefined> {
  return {
    NEXT_PUBLIC_APP_ORIGIN: process.env.NEXT_PUBLIC_APP_ORIGIN,
    NEXT_PUBLIC_COURSES_ORIGIN: process.env.NEXT_PUBLIC_COURSES_ORIGIN,
    BUD_API_ORIGIN: process.env.BUD_API_ORIGIN,
  };
}

/**
 * An unset variable falls back to its development default. So does one that is set
 * but blank — which is exactly the case a production build must refuse, and why
 * checkOrigins() exists: the first deploy shipped with all three blank, and the only
 * sign was a CSP with no origins in it.
 *
 * A parseable value comes back canonical — lowercase host, no default port, no
 * trailing slash — so the CSP and the rewrite always carry the origin a browser
 * would compare against.
 */
function read(name: OriginName) {
  const value = values()[name]?.trim();
  if (!value) return DEFAULTS[name];
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, "");
  }
}

export const appOrigin = () => read("NEXT_PUBLIC_APP_ORIGIN");
export const coursesOrigin = () => read("NEXT_PUBLIC_COURSES_ORIGIN");
/** Server-only: where the rewrite and server components reach the API. */
export const apiOrigin = () => read("BUD_API_ORIGIN");

/**
 * Throws unless every origin is set and is a bare absolute http(s) origin. Called when
 * building for production, where falling back to localhost would produce an app that
 * builds, deploys and then cannot reach anything.
 */
export function checkOrigins() {
  const problems: string[] = [];

  for (const [name, raw] of Object.entries(values()) as [OriginName, string | undefined][]) {
    const value = raw?.trim();
    if (!value) {
      problems.push(`${name} is not set.`);
      continue;
    }
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      problems.push(`${name} is not an absolute URL: "${value}".`);
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      problems.push(`${name} must be http(s): "${value}".`);
    } else if (url.pathname !== "/" || url.search || url.hash) {
      problems.push(`${name} must be an origin, with no path: "${value}" → "${url.origin}".`);
    }
  }

  if (!problems.length) {
    const app = new URL(appOrigin());
    const courses = new URL(coursesOrigin());
    const api = new URL(apiOrigin());

    /**
     * By hostname, not origin: cookies ignore ports, so courses on the app's host at
     * another port would be sent the learner's session cookie with every course file.
     */
    if (courses.hostname === app.hostname) {
      problems.push(
        `NEXT_PUBLIC_COURSES_ORIGIN must be on a different host from the app, not just ` +
          `a different port ("${courses.origin}" vs "${app.origin}") — cookies ignore ` +
          `ports, so course pages would be sent the learner's session.`,
      );
    }
    // The rewrite would forward /api back into the shell itself.
    if (api.host === app.host) {
      problems.push(`BUD_API_ORIGIN must not be the app's own origin ("${api.origin}").`);
    }
  }

  if (problems.length) {
    throw new Error(
      `Bud's origins are misconfigured for a production build:\n  - ${problems.join("\n  - ")}\n` +
        "They are read at build time, so fix them and build again (on Vercel: " +
        "Settings → Environment Variables, then redeploy).",
    );
  }
}
