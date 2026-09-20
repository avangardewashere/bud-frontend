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
  readonly fieldErrors: FieldError[];
  readonly path?: string;
  readonly timestamp?: string;

  constructor(statusCode: number, body: Partial<ErrorResponse> | null, fallback: string) {
    const message = normaliseMessage(body?.message) ?? fallback;
    super(message);
    this.name = "BudApiError";
    this.statusCode = body?.statusCode ?? statusCode;
    this.error = body?.error ?? fallback;
    this.fieldErrors = body?.errors ?? [];
    this.path = body?.path;
    this.timestamp = body?.timestamp;
  }

  /** 401 means "not signed in", which callers handle differently from a real failure. */
  get isUnauthorized() {
    return this.statusCode === 401;
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
