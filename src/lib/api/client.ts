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
import {
  BudApiError,
  BudApiUnreachableError,
  BudApiWakingError,
  type ErrorResponse,
} from "./errors";
import {
  SERVER_API_TIMEOUT_MS,
  WAKING_RETRY_DELAYS_MS,
  trackRetry,
  trackSlowCall,
  wait,
} from "./waking";
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
export type AuthProviders = components["schemas"]["AuthProviders"];
/** A session's note. `null` when there is none — the API omits empty notes rather than storing them. */
export type Note = components["schemas"]["Note"];
export type NoteList = components["schemas"]["NoteList"];
export type Deliverable = components["schemas"]["Deliverable"];
export type DeliverableList = components["schemas"]["DeliverableList"];

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
export type SaveNoteBody = JsonBody<"NotesController_save">;
export type SaveDeliverableBody = JsonBody<"NotesController_saveDeliverable">;
export type RegisterBody = JsonBody<"AuthController_register">;
export type ChangePasswordBody = JsonBody<"AuthController_changePassword">;

const statePath = (slug: string, key: string) =>
  `/me/courses/${encodeURIComponent(slug)}/state/${encodeURIComponent(key)}`;

const sessionPath = (slug: string, sessionKey: string) =>
  `/me/courses/${encodeURIComponent(slug)}/sessions/${encodeURIComponent(sessionKey)}`;

const coursePath = (slug: string) => `/me/courses/${encodeURIComponent(slug)}`;

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
  return typeof window === "undefined" ? apiOrigin() : BROWSER_API_BASE;
}

/**
 * What a URL *in the page* must be, wherever it was rendered: a link the browser
 * follows goes through the rewrite like everything else the browser does, so the
 * session cookie goes with it. Server-rendered links cannot use apiBaseUrl() — on
 * the server that is the API's own address, which in production is a different site.
 */
const BROWSER_API_BASE = "/api";

/**
 * Callers may pass `headers` and `signal`. Method, body and credentials are set here
 * so no call site can get them wrong.
 */
export type RequestOptions = {
  headers?: HeadersInit;
  signal?: AbortSignal;
  /**
   * false for a call that must not be sent twice. A gateway error means no answer
   * came back — not that the API never saw the request — so a retry can be a real
   * duplicate. Set by the client's own methods, not by callers.
   */
  retry?: false;
};

type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

/**
 * One API call, and what happens when the API is asleep.
 *
 * In the browser: a call still waiting after a few seconds raises the waking notice
 * (src/lib/api/waking.ts), and a call a gateway answered for is retried twice before
 * giving up. A gateway error means no answer came back, not that the API never saw
 * the request — Vercel can give up on a request Render then delivers — so only calls
 * that are safe to repeat are retried. Nearly all are: state writes replace a whole
 * value (and stateWrites.ts keeps them in order), deletes and uncompletes set an
 * absolute state, enrol and complete are upserts, progress never moves backwards, and
 * a second sign-in is just another session. Registration and changing a password are
 * not — a duplicate spends the invite or rejects the old password — and opt out with
 * `retry: false`. The course upload is not a JSON call and is never retried.
 *
 * On the server: no retries, and a short timeout. A server component that waits out a
 * cold start leaves the learner staring at a blank tab for a minute; one that gives
 * up hands over to the error boundary, which shows the waking page and retries by
 * itself once the API answers.
 */
async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  if (typeof window === "undefined") {
    return attempt<T>(method, path, body, options, SERVER_API_TIMEOUT_MS);
  }

  const settled = trackSlowCall();
  let retrying: (() => void) | undefined;
  try {
    for (let retry = 0; ; retry++) {
      try {
        return await attempt<T>(method, path, body, options);
      } catch (error) {
        const delay = options.retry === false ? undefined : WAKING_RETRY_DELAYS_MS[retry];
        if (!(error instanceof BudApiWakingError) || delay === undefined) throw error;
        retrying ??= trackRetry();
        await wait(delay, options.signal);
      }
    }
  } finally {
    retrying?.();
    settled();
  }
}

async function attempt<T>(
  method: Method,
  path: string,
  body: unknown,
  options: RequestOptions,
  timeoutMs?: number,
): Promise<T> {
  const url = `${apiBaseUrl()}${path}`;

  const headers = new Headers(options.headers);
  if (body !== undefined) headers.set("content-type", "application/json");
  headers.set("accept", "application/json");

  const timeout = timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs);
  const signals = [timeout, options.signal].filter((s): s is AbortSignal => s !== undefined);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      // The whole point: carry the httpOnly session cookie.
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
      cache: "no-store",
    });
  } catch (cause) {
    // Our own deadline, not the caller's abort: too slow to wait for from here.
    if (timeout?.aborted && !options.signal?.aborted) throw new BudApiWakingError(url, cause);
    // Otherwise fetch only rejects for network-level failures.
    throw new BudApiUnreachableError(url, cause);
  }

  if (response.status === 204) return undefined as T;

  let answer: Body;
  try {
    answer = await readBody(response);
  } catch (cause) {
    // The deadline can also land while the body is still arriving.
    if (timeout?.aborted && !options.signal?.aborted) throw new BudApiWakingError(url, cause);
    throw new BudApiUnreachableError(url, cause);
  }
  return settle<T>(url, response, answer, "Request failed");
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
 * own error page when the API is down or asleep, a gateway timing out on a cold
 * start, or a host's holding page. That is the API not answering, whatever the
 * status says, so it is a BudApiWakingError: the case the client retries. Through the
 * rewrite this is the only way a sleeping API shows up in the browser, since the
 * fetch itself always reaches the shell and succeeds.
 */
function settle<T>(url: string, response: Response, body: Body, fallback: string): T {
  if (!body.json) {
    throw new BudApiWakingError(url, `${response.status}: ${body.text}`);
  }
  if (!response.ok && body.value === null && response.status >= 500) {
    throw new BudApiWakingError(url, `${response.status} with an empty body`);
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
    // Never retried: a duplicate finds its invite already spent.
    const result = await request<UserEnvelope>("POST", "/auth/register", body, {
      ...options,
      retry: false,
    });
    return result.user;
  },

  /** 204, and the cookie is cleared. */
  async logout(options?: RequestOptions): Promise<void> {
    await request<void>("POST", "/auth/logout", undefined, options);
  },

  async changePassword(body: ChangePasswordBody, options?: RequestOptions) {
    // Never retried: a duplicate would be rejected for carrying the old password.
    return request<components["schemas"]["ChangePasswordResult"]>(
      "POST",
      "/auth/change-password",
      body,
      { ...options, retry: false },
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

  /**
   * Which sign-in options this deployment offers, so the shell renders the GitHub
   * button and a sign-up link only when they lead somewhere.
   */
  async providers(options?: RequestOptions): Promise<AuthProviders> {
    return request<AuthProviders>("GET", "/auth/providers", undefined, options);
  },

  // ── notes ───────────────────────────────────────────────────────────────────
  // What the course asked the learner to write. Every Docker session asks for a
  // notes.md entry, and these are where it lives (Overall Plan §5.7).

  /** Every note for a course, in session order. Sessions with no note are omitted. */
  async listNotes(slug: string, options?: RequestOptions): Promise<NoteList> {
    return request<NoteList>("GET", `${coursePath(slug)}/notes`, undefined, options);
  },

  /** One session's note, or null when it has none. */
  async getNote(slug: string, sessionKey: string, options?: RequestOptions): Promise<Note> {
    return request<Note>("GET", `${sessionPath(slug, sessionKey)}/notes`, undefined, options);
  },

  /**
   * Write a session's note. Whole value, like the bridge — and an empty body deletes
   * it, which is the API's own rule rather than a shortcut taken here.
   */
  async saveNote(
    slug: string,
    sessionKey: string,
    bodyMd: string,
    options?: RequestOptions,
  ): Promise<Note> {
    return request<Note>("PUT", `${sessionPath(slug, sessionKey)}/notes`, { bodyMd }, options);
  },

  async deleteNote(slug: string, sessionKey: string, options?: RequestOptions): Promise<void> {
    await request<void>("DELETE", `${sessionPath(slug, sessionKey)}/notes`, undefined, options);
  },

  /**
   * Where the browser downloads every note as one markdown file.
   *
   * A plain link, not a fetch: it is same-origin through the rewrite, so the session
   * cookie goes with it, and the API's Content-Disposition names the file. Building
   * the document here would be a second implementation of the API's ordering and
   * headings, and the two would drift.
   */
  notesExportUrl(slug: string): string {
    return `${BROWSER_API_BASE}${coursePath(slug)}/notes/export`;
  },

  // ── deliverables ────────────────────────────────────────────────────────────
  // A link to what the learner produced. No grading: "submitted" is their own claim.

  async listDeliverables(slug: string, options?: RequestOptions): Promise<DeliverableList> {
    return request<DeliverableList>("GET", `${coursePath(slug)}/deliverables`, undefined, options);
  },

  /**
   * Submit or update one. `submitted: false` retracts it without losing the link.
   *
   * Retried like everything else, with one caveat worth naming: the row itself is an
   * upsert, but the API also appends a `deliverable.submitted` event to its activity
   * log, so a retry the API did in fact receive leaves two. That log is counted by day
   * for the activity calendar, so a duplicate nudges one day's count and nothing else
   * — which is a better trade than telling someone their hand-in failed when the API
   * was merely waking up.
   */
  async saveDeliverable(
    slug: string,
    sessionKey: string,
    body: SaveDeliverableBody,
    options?: RequestOptions,
  ): Promise<Deliverable> {
    return request<Deliverable>(
      "PUT",
      `${sessionPath(slug, sessionKey)}/deliverable`,
      body,
      options,
    );
  },

  async deleteDeliverable(
    slug: string,
    sessionKey: string,
    options?: RequestOptions,
  ): Promise<void> {
    await request<void>("DELETE", `${sessionPath(slug, sessionKey)}/deliverable`, undefined, options);
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

  /**
   * Nudges a sleeping API awake and resolves once it answers. /health is the API's
   * liveness check and never touches the database, so this costs the free database
   * nothing. One call per human visit, never on a timer: keeping a free instance
   * awake on purpose is against Render's rules and would burn Neon's compute hours.
   */
  async wake(options?: RequestOptions): Promise<void> {
    await request<unknown>("GET", "/health", undefined, options);
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
