import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { PROXY_BODY_LIMIT_BYTES } from "./src/lib/config/limits";
import { apiOrigin, checkOrigins } from "./src/lib/config/origins";

/**
 * The Content-Security-Policy is NOT set here. It needs a fresh nonce per request, so
 * it lives in src/proxy.ts, built by src/lib/security/csp.ts.
 *
 * Setting one here as well would not be a harmless duplicate: a browser given two
 * CSP headers enforces both, so a request would have to satisfy the intersection of
 * a static policy and a nonced one. Only headers that do not vary per request belong
 * in this file.
 */
export default function config(phase: string): NextConfig {
  /**
   * A production build with a blank or malformed origin builds, deploys, and then
   * cannot reach anything. Fail here instead, where the message can say why.
   *
   * `next typegen` (the first half of `npm run typecheck`) loads this file in the
   * same production-build phase, but builds nothing and uses no origin — so it is
   * spared, or type checking would fail on a fresh clone or in CI with no env set.
   */
  if (phase === PHASE_PRODUCTION_BUILD && !process.argv.includes("typegen")) checkOrigins();

  return {
    // Pin the workspace root. Without this, Turbopack walks up and finds a stray
    // package-lock.json in the home directory and infers the wrong root.
    turbopack: { root: __dirname },

    // Tech-Information.md §10 rule 8: both apps ship as containers, even while the
    // web app could run on Vercel. Keeps the exit door open.
    output: "standalone",

    experimental: {
      /**
       * Next's router copies every request body before routing it and cuts the copy
       * off here, 10MB by default — and the /api rewrite forwards the copy. A course
       * upload past 10MB then reached the API truncated, hung until the proxy timed
       * out, and was reported as "unreachable". Sized from the archive ceiling; see
       * src/lib/config/limits.ts.
       */
      proxyClientMaxBodySize: PROXY_BODY_LIMIT_BYTES,
    },

    /**
     * The browser reaches the API only through here, so the session cookie is
     * first-party on the app's own host (see src/lib/config/origins.ts for why that
     * matters). Server components skip this and call BUD_API_ORIGIN directly.
     *
     * beforeFiles, so nothing under app/ or public/ can ever shadow it: a plain
     * rewrite runs after the filesystem. The destination is compiled into the build,
     * which is why BUD_API_ORIGIN is a build-time value like the NEXT_PUBLIC_ ones.
     *
     * Only the API's own prefixes are forwarded — never "/api/:path*". On the free
     * deploy the API's host also serves course content, so a catch-all rewrite put
     * author-controlled HTML on the SHELL's origin, top-level and outside the player's
     * sandbox: https://<app>/api/<slug>/1.0.0/page.html, with the learner's session a
     * same-origin fetch away. The backend now sandboxes every course response via CSP
     * (found in its review), which closes that; this makes sure the shell never
     * proxies course content in the first place.
     */
    async rewrites() {
      const api = apiOrigin();
      return {
        beforeFiles: [
          /**
           * Course content has one shape, /{slug}/{version}/{file}, and no API route
           * has a version as its second segment (the backend's e2e holds every route
           * to that). Those paths are sent somewhere that does not exist, before the
           * prefix rules can see them — so a course whose slug happens to be "admin"
           * or "me" is refused too. beforeFiles rules chain, so the rules below match
           * against the rewritten path and ignore it.
           *
           * Dot segments, doubled slashes and backslashes are normalised (or
           * redirected) before this runs, so they cannot route around it. Percent-
           * encoded versions (1%2E0%2E0) do pass — and reach an API that does not
           * decode them into a course path, behind a course server that sandboxes
           * every document it sends regardless. Both probed; see the block 11 notes
           * in Planning/Roadmap-Status.md.
           */
          {
            source: "/api/:slug/:version(\\d+\\.\\d+\\.\\d+[^/]*)/:file*",
            destination: "/__course-content-is-not-proxied",
          },
          /**
           * Every top-level prefix the API serves. A new one needs adding here — the
           * shell answers a 404 for anything else under /api, which is also what
           * e2e/security.spec.ts checks.
           */
          {
            source: "/api/:prefix(auth|me|courses|admin|course-spec)/:path*",
            destination: `${api}/:prefix/:path*`,
          },
          { source: "/api/:probe(health|ready)", destination: `${api}/:probe` },
        ],
        afterFiles: [],
        fallback: [],
      };
    },

    async headers() {
      return [
        {
          source: "/:path*",
          headers: [
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          ],
        },
      ];
    },
  };
}
