import { cookies } from "next/headers";
import { budApi, type PublicUser, type RequestOptions } from "./client";

/**
 * Forwards the incoming request's cookies to the API, so server components can call
 * it as the signed-in user: `budApi.listCourses(await serverAuth())`.
 */
export async function serverAuth(): Promise<RequestOptions> {
  return { headers: { cookie: (await cookies()).toString() } };
}

/**
 * Server-side session lookup, for layouts and server components.
 *
 * Why the shell has the cookie at all: the browser signs in through the /api rewrite
 * on the shell's own origin, so the API's `bud_session` is set on the *app's* host,
 * and comes back with every page request. The shell reads it off the incoming request
 * and forwards it to BUD_API_ORIGIN by hand. (Before the rewrite this only worked
 * locally, where cookies ignoring ports let localhost:3102's cookie reach :3100; on
 * two different sites it never would.) Cookies ignoring ports is also why the courses
 * origin is a different *host* (127.0.0.1:3101), not just another port — see
 * tools/courses-server.mjs.
 *
 * Server-only: this imports next/headers, so it is deliberately not re-exported from
 * ./index, which client components import.
 */
export async function getSessionUser(): Promise<PublicUser | null> {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader) return null;

  // currentUser() turns 401 into null; anything else — including the API being
  // unreachable — propagates, because silently showing a signed-out shell would
  // hide a broken backend rather than report it.
  return budApi.currentUser({ headers: { cookie: cookieHeader } });
}
