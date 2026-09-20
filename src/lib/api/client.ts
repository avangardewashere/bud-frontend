/**
 * The typed Bud API client.
 *
 * Types in `schema.d.ts` are generated from the backend's own OpenAPI document
 * (`npm run api:types`, with the API running), so the contract has one source of
 * truth and a shape change shows up here as a type error rather than at runtime.
 *
 * Two things this file exists to get right everywhere, once:
 *
 *   credentials: "include" — the session is an httpOnly `bud_session` cookie, so
 *   every call has to carry it. A fetch without it silently looks signed out.
 *
 *   errors — the API answers failures with a consistent envelope, so a non-2xx
 *   becomes a BudApiError with the status, the field errors and the rest intact,
 *   rather than each caller re-parsing the body.
 *
 * The API's CORS allows exactly http://localhost:3100, with credentials. Reaching
 * the shell on 127.0.0.1:3100 instead is a different host: the preflight fails and
 * the cookie would not match anyway.
 */

import { BudApiError, BudApiUnreachableError, type ErrorResponse } from "./errors";
import type { components, operations } from "./schema";

export type PublicUser = components["schemas"]["PublicUser"];
export type UserEnvelope = components["schemas"]["UserEnvelope"];

type JsonBody<O extends keyof operations> = operations[O] extends {
  requestBody: { content: { "application/json": infer B } };
}
  ? B
  : never;

export type LoginBody = JsonBody<"AuthController_login">;
export type RegisterBody = JsonBody<"AuthController_register">;
export type ChangePasswordBody = JsonBody<"AuthController_changePassword">;

const DEFAULT_BASE_URL = "http://localhost:3102";

export function apiBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/**
 * Callers may pass `headers` and `signal`. Method, body and credentials are set here
 * so no call site can get them wrong.
 */
export type RequestOptions = {
  headers?: HeadersInit;
  signal?: AbortSignal;
};

type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const url = `${apiBaseUrl()}${path}`;

  const headers = new Headers(options.headers);
  if (body !== undefined) headers.set("content-type", "application/json");
  headers.set("accept", "application/json");

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      // The whole point: carry the httpOnly session cookie.
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options.signal,
      cache: "no-store",
    });
  } catch (cause) {
    // fetch only rejects for network-level failures — including a refused preflight.
    throw new BudApiUnreachableError(url, cause);
  }

  if (response.status === 204) return undefined as T;

  const payload = await readJson(response);

  if (!response.ok) {
    throw new BudApiError(
      response.status,
      payload as Partial<ErrorResponse> | null,
      response.statusText || "Request failed",
    );
  }

  return payload as T;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text);
  } catch {
    // A proxy or an error page rather than the API. Keep the body for the message.
    return { message: text.slice(0, 200) };
  }
}

/**
 * Endpoints that exist today. The catalog, enrollment, dashboard, progress and
 * bridge-state calls land here as the backend builds them — spec first, then
 * `npm run api:types`, then the function.
 */
export const budApi = {
  /** Signs in and sets the session cookie. Throws BudApiError 401 on bad credentials. */
  async login(body: LoginBody, options?: RequestOptions): Promise<PublicUser> {
    const result = await request<UserEnvelope>("POST", "/auth/login", body, options);
    return result.user;
  },

  /** Invite-gated while signup is closed; 403 when the invite is missing or expired. */
  async register(body: RegisterBody, options?: RequestOptions): Promise<PublicUser> {
    const result = await request<UserEnvelope>("POST", "/auth/register", body, options);
    return result.user;
  },

  /** 204, and the cookie is cleared. */
  async logout(options?: RequestOptions): Promise<void> {
    await request<void>("POST", "/auth/logout", undefined, options);
  },

  async changePassword(body: ChangePasswordBody, options?: RequestOptions) {
    return request<components["schemas"]["ChangePasswordResult"]>(
      "POST",
      "/auth/change-password",
      body,
      options,
    );
  },

  /**
   * The signed-in user. Throws BudApiError 401 when there is no session — callers
   * that treat "signed out" as ordinary should use `currentUser` instead.
   */
  async me(options?: RequestOptions): Promise<PublicUser> {
    const result = await request<UserEnvelope>("GET", "/me", undefined, options);
    return result.user;
  },

  /** `me()` with 401 turned into null, for code that only asks "is anyone signed in?". */
  async currentUser(options?: RequestOptions): Promise<PublicUser | null> {
    try {
      return await budApi.me(options);
    } catch (error) {
      if (error instanceof BudApiError && error.isUnauthorized) return null;
      throw error;
    }
  },
};
