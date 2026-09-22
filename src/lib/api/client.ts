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
 * Where requests go depends on who is asking — see apiBaseUrl().
 */

import { apiOrigin } from "@/lib/config/origins";
import { BudApiError, BudApiUnreachableError, type ErrorResponse } from "./errors";
import type { components, operations } from "./schema";

export type PublicUser = components["schemas"]["PublicUser"];
export type UserEnvelope = components["schemas"]["UserEnvelope"];
export type CourseSummary = components["schemas"]["CourseSummary"];
export type CourseDetail = components["schemas"]["CourseDetail"];
export type CourseSession = components["schemas"]["CourseSession"];
export type CourseList = components["schemas"]["CourseList"];
export type ProgressSummary = components["schemas"]["ProgressSummary"];
export type Dashboard = components["schemas"]["Dashboard"];
export type StateValue = components["schemas"]["StateValue"];
export type SessionProgress = components["schemas"]["SessionProgress"];
export type SessionProgressList = components["schemas"]["SessionProgressList"];
export type AdminCourse = components["schemas"]["AdminCourse"];
export type AdminCourseList = components["schemas"]["AdminCourseList"];
export type IngestResult = components["schemas"]["IngestResult"];
export type ValidationResult = components["schemas"]["ValidationResult"];
export type CourseStorageKeys = components["schemas"]["CourseStorageKeys"];
export type CourseStatus = AdminCourse["status"];

/** The package rules, served by the API so the panel and the validator agree. */
export type CourseSpecInfo = {
  spec: string;
  manifestFilename: string;
  schema: unknown;
  limits: {
    maxArchiveBytes: number;
    maxTotalUncompressedBytes: number;
    maxEntries: number;
  };
  allowedExtensions: string[];
  validationCodes: string[];
};

type JsonBody<O extends keyof operations> = operations[O] extends {
  requestBody: { content: { "application/json": infer B } };
}
  ? B
  : never;

export type LoginBody = JsonBody<"AuthController_login">;
export type RegisterBody = JsonBody<"AuthController_register">;
export type ChangePasswordBody = JsonBody<"AuthController_changePassword">;

const statePath = (slug: string, key: string) =>
  `/me/courses/${encodeURIComponent(slug)}/state/${encodeURIComponent(key)}`;

const sessionPath = (slug: string, sessionKey: string) =>
  `/me/courses/${encodeURIComponent(slug)}/sessions/${encodeURIComponent(sessionKey)}`;

/**
 * The browser always calls /api on the shell's own origin, which the rewrite in
 * next.config.ts forwards to the API. That keeps the session cookie first-party on
 * the app's host — the only way it works when the app and API are different sites —
 * and means no CORS preflight at all.
 *
 * Server components call the API directly: "/api" has no host under Node, a
 * server-to-server call gains nothing from the detour, and serverAuth() already
 * forwards the learner's cookie by hand.
 */
export function apiBaseUrl() {
  return typeof window === "undefined" ? apiOrigin() : "/api";
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

  return settle<T>(url, response, await readBody(response), "Request failed");
}

/**
 * Multipart, for the one endpoint that takes a file. Content-Type is left unset on
 * purpose: the browser has to add it itself so it can include the boundary.
 */
async function requestMultipart<T>(
  path: string,
  body: FormData,
  options: RequestOptions = {},
): Promise<T> {
  const url = `${apiBaseUrl()}${path}`;
  const headers = new Headers(options.headers);
  headers.set("accept", "application/json");

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      credentials: "include",
      body,
      signal: options.signal,
    });
  } catch (cause) {
    throw new BudApiUnreachableError(url, cause);
  }

  return settle<T>(url, response, await readBody(response), "Upload failed");
}

type Body = { json: true; value: unknown } | { json: false; text: string };

async function readBody(response: Response): Promise<Body> {
  const text = await response.text();
  if (text.length === 0) return { json: true, value: null };
  try {
    return { json: true, value: JSON.parse(text) };
  } catch {
    return { json: false, text: text.slice(0, 200) };
  }
}

/**
 * Every endpoint answers in JSON, so a body that is not JSON — or a 5xx with no body
 * at all — was written by something between the browser and the API: the rewrite's
 * own error page when the API is down or asleep, or a host's holding page. That is
 * "unreachable", whatever its status says. Through the rewrite this is the only way
 * an unreachable API shows up in the browser, since the fetch itself always reaches
 * the shell and succeeds.
 */
function settle<T>(url: string, response: Response, body: Body, fallback: string): T {
  if (!body.json) {
    throw new BudApiUnreachableError(url, `${response.status}: ${body.text}`);
  }
  if (!response.ok && body.value === null && response.status >= 500) {
    throw new BudApiUnreachableError(url, `${response.status} with an empty body`);
  }
  if (!response.ok) {
    throw new BudApiError(
      response.status,
      body.value as Partial<ErrorResponse> | null,
      response.statusText || fallback,
    );
  }
  return body.value as T;
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

  /** Published courses, with this user's enrollment folded in where there is one. */
  async listCourses(options?: RequestOptions): Promise<CourseList> {
    return request<CourseList>("GET", "/courses", undefined, options);
  },

  /** One course, plus its outline Markdown and its sessions with per-session status. */
  async getCourse(slug: string, options?: RequestOptions): Promise<CourseDetail> {
    return request<CourseDetail>(
      "GET",
      `/courses/${encodeURIComponent(slug)}`,
      undefined,
      options,
    );
  },

  async enroll(slug: string, options?: RequestOptions): Promise<void> {
    await request<void>(
      "POST",
      `/courses/${encodeURIComponent(slug)}/enroll`,
      undefined,
      options,
    );
  },

  async unenroll(slug: string, options?: RequestOptions): Promise<void> {
    await request<void>(
      "DELETE",
      `/courses/${encodeURIComponent(slug)}/enroll`,
      undefined,
      options,
    );
  },

  /** The Continue card, the enrolled courses and cross-course totals. */
  async dashboard(options?: RequestOptions): Promise<Dashboard> {
    return request<Dashboard>("GET", "/me/dashboard", undefined, options);
  },

  /**
   * The bridge's three state calls. `key` is opaque and course-chosen, so it is
   * always encoded — the Docker course's keys contain a colon.
   */
  async getState(slug: string, key: string, options?: RequestOptions): Promise<StateValue> {
    return request<StateValue>("GET", statePath(slug, key), undefined, options);
  },

  async putState(
    slug: string,
    key: string,
    value: string,
    options?: RequestOptions,
  ): Promise<void> {
    await request<void>("PUT", statePath(slug, key), { value }, options);
  },

  async deleteState(slug: string, key: string, options?: RequestOptions): Promise<void> {
    await request<void>("DELETE", statePath(slug, key), undefined, options);
  },

  /** Records that a session was opened; drives "resume where you left off". */
  async openSession(
    slug: string,
    sessionKey: string,
    options?: RequestOptions,
  ): Promise<SessionProgress> {
    return request<SessionProgress>("POST", `${sessionPath(slug, sessionKey)}/open`, undefined, options);
  },

  /** Fine-grained progress from a course that reports it. Never moves backwards. */
  async reportProgress(
    slug: string,
    sessionKey: string,
    fraction: number,
    options?: RequestOptions,
  ): Promise<SessionProgress> {
    return request<SessionProgress>(
      "POST",
      `${sessionPath(slug, sessionKey)}/progress`,
      { fraction },
      options,
    );
  },

  async completeSession(
    slug: string,
    sessionKey: string,
    options?: RequestOptions,
  ): Promise<SessionProgress> {
    return request<SessionProgress>(
      "POST",
      `${sessionPath(slug, sessionKey)}/complete`,
      undefined,
      options,
    );
  },

  async uncompleteSession(
    slug: string,
    sessionKey: string,
    options?: RequestOptions,
  ): Promise<SessionProgress> {
    return request<SessionProgress>(
      "DELETE",
      `${sessionPath(slug, sessionKey)}/complete`,
      undefined,
      options,
    );
  },

  /** Every course, whatever its status — admin only. */
  async adminCourses(options?: RequestOptions): Promise<AdminCourseList> {
    return request<AdminCourseList>("GET", "/admin/courses", undefined, options);
  },

  async setCourseStatus(
    id: string,
    status: CourseStatus,
    options?: RequestOptions,
  ): Promise<AdminCourse> {
    return request<AdminCourse>(
      "PATCH",
      `/admin/courses/${encodeURIComponent(id)}`,
      { status },
      options,
    );
  },

  /** Which keys a course actually writes, against the ones its manifest declares. */
  async courseStorageKeys(id: string, options?: RequestOptions): Promise<CourseStorageKeys> {
    return request<CourseStorageKeys>(
      "GET",
      `/admin/courses/${encodeURIComponent(id)}/storage-keys`,
      undefined,
      options,
    );
  },

  /** The package rules: limits, allowed extensions and the manifest JSON Schema. */
  async courseSpec(options?: RequestOptions): Promise<CourseSpecInfo> {
    return request<CourseSpecInfo>("GET", "/course-spec/schema", undefined, options);
  },

  /**
   * Upload a course package.
   *
   * A bad package is a 201 with ok:false and the checklist — the upload succeeded,
   * the package did not. Only a missing file or a duplicate version is a 400, so
   * callers read `ok` rather than assuming 2xx means published.
   */
  async uploadCourse(file: File, options?: RequestOptions): Promise<IngestResult> {
    const body = new FormData();
    body.append("file", file, file.name);
    return requestMultipart<IngestResult>("/admin/courses", body, options);
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
