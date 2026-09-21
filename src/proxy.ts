import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, createNonce, originOf } from "@/lib/security/csp";

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

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3100";
const API_ORIGIN = originOf(process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3102");
const COURSES_ORIGIN = process.env.NEXT_PUBLIC_COURSES_ORIGIN ?? "http://127.0.0.1:3101";

export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    appOrigin: APP_ORIGIN,
    apiOrigin: API_ORIGIN,
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
       */
      source: "/((?!api|_next/static|_next/image|favicon.ico|bridge.js|icon.svg).*)",
      // Prefetches are not rendered for display, so they need no nonce of their own.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
