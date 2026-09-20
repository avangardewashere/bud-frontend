import type { components } from "./schema";

export type ErrorResponse = components["schemas"]["ErrorResponse"];

/** One field-level failure from a validation error, as the API's envelope carries them. */
export type FieldError = NonNullable<ErrorResponse["errors"]>[number];

/**
 * Every non-2xx from the Bud API, in one type.
 *
 * The API answers failures with a consistent envelope
 * ({ statusCode, error, message, errors?, path, timestamp }), so the interesting
 * parts are kept as fields rather than flattened into a string — forms need
 * `fieldErrors` to put messages next to inputs, and callers switch on `statusCode`
 * (401 to send someone to sign in, 409 for a taken email, 429 for rate limits).
 */
export class BudApiError extends Error {
  readonly statusCode: number;
  readonly error: string;
  /**
   * The stable machine-readable reason, e.g. "not_enrolled", "unknown_session",
   * "storage_quota_exceeded". Branch on this rather than the message, which is
   * free to be reworded, or the status, which several reasons share.
   *
   * Empty only when the response never reached the API's own error handler — a
   * proxy or a framework-level 413, say — so treat "" as "cause unknown".
   */
  readonly code: string;
  readonly detail?: string;
  readonly fieldErrors: FieldError[];
  readonly path?: string;
  readonly timestamp?: string;

  constructor(statusCode: number, body: Partial<ErrorResponse> | null, fallback: string) {
    const message = normaliseMessage(body?.message) ?? fallback;
    super(message);
    this.name = "BudApiError";
    this.statusCode = body?.statusCode ?? statusCode;
    this.error = body?.error ?? fallback;
    this.code = body?.code ?? "";
    this.detail = body?.detail;
    this.fieldErrors = body?.errors ?? [];
    this.path = body?.path;
    this.timestamp = body?.timestamp;
  }

  /** 401 means "not signed in", which callers handle differently from a real failure. */
  get isUnauthorized() {
    return this.statusCode === 401;
  }

  /**
   * Retrying will not help: a limit, a missing session, not being enrolled. The
   * player uses this to decide between backing off and telling the learner.
   */
  get isPermanent() {
    return this.statusCode >= 400 && this.statusCode < 500 && this.statusCode !== 429;
  }
}

/** Some frameworks answer with a list of messages; the envelope allows either. */
function normaliseMessage(message: unknown): string | undefined {
  if (typeof message === "string" && message.length > 0) return message;
  if (Array.isArray(message) && message.length > 0) return message.join(", ");
  return undefined;
}

/**
 * The request never reached the API, or the reply was not the envelope: a wrong base
 * URL, the backend not running, or a CORS preflight the browser refused. Worth its own
 * type, because the fix is operational rather than anything the user did.
 */
export class BudApiUnreachableError extends Error {
  readonly cause?: unknown;

  constructor(url: string, cause?: unknown) {
    super(
      `Could not reach the Bud API at ${url}. Is it running, and is this page served ` +
        `from http://localhost:3100? Its CORS allows that origin only.`,
    );
    this.name = "BudApiUnreachableError";
    this.cause = cause;
  }
}
