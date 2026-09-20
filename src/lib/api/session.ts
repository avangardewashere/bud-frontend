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
 * Why this works across two ports: the API sets `bud_session` for host `localhost`,
 * and cookies ignore ports, so the browser sends it to the shell on :3100 as well as
 * to the API on :3102. The shell can therefore read it off the incoming request and
 * forward it. That same port-blindness is exactly why the courses origin is a
 * different *host* (127.0.0.1:3101) rather than just another port — see
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
