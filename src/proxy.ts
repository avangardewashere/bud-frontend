import { NextResponse, type NextRequest } from "next/server";
import { appOrigin, coursesOrigin } from "@/lib/config/origins";
import { buildCsp, createNonce } from "@/lib/security/csp";

/**
 * Puts a fresh nonce and the Content-Security-Policy on every page request.
 *
 * Next finds the nonce by reading the CSP on the *request*, so it is set there as well
 * as on the response — that is what lets it stamp the nonce onto its own scripts and
 * styles while rendering. It only can while rendering per request, which is why the
 * root layout opts every page into dynamic rendering.
 *
 * Everything is read at the same point in the build as the rest of the app's
 * NEXT_PUBLIC_ configuration, so the policy an image serves matches the origins it
 * was built for.
 */

const APP_ORIGIN = appOrigin();
const COURSES_ORIGIN = coursesOrigin();

export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    appOrigin: APP_ORIGIN,
    coursesOrigin: COURSES_ORIGIN,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      /**
       * Pages only. Built assets, image optimisation and the favicon are not documents,
       * so a policy on them does nothing but cost a nonce. bridge.js is excluded too:
       * it is loaded by a course's document, whose policy is the courses origin's to set.
       *
       * Of /api, only what the rewrite in next.config.ts actually forwards is skipped —
       * the API's own prefixes, minus the course-shaped /{x}/{version}/ paths the
       * rewrite refuses. Everything else there is a page the shell renders itself (a
       * 404), and gets the policy like any other; a blanket "api" once also skipped
       * those, and any route merely starting with "api". Keep the prefixes in step with
       * the rewrite: this must be a literal, which Next reads at build time.
       */
      source:
        "/((?!api/(?:auth|me|courses|admin|course-spec)(?:/(?![0-9]+\\.[0-9]+\\.[0-9]+)|$)|api/(?:health|ready)$|_next/static|_next/image|favicon.ico|bridge.js|icon.svg).*)",
      // Prefetches are not rendered for display, so they need no nonce of their own.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
