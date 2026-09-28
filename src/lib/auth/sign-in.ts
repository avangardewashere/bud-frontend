import { BudApiError, BudApiUnreachableError, BudApiWakingError } from "@/lib/api";
import type { AuthProviders } from "@/lib/api";

/**
 * What the sign-in screen offers, what it says when something went wrong on the way
 * back from somewhere else, and what it says when a sign-in fails here.
 *
 * All of it is rules rather than markup, so it can be stated once and checked without
 * rendering: which buttons a deployment has is a property of its configuration, a
 * redirect carrying `?error=` is a contract with the API rather than a string the
 * screen invents, and the sentences a failure turns into are the shell's own.
 */

/**
 * Where "Continue with GitHub" goes.
 *
 * Through the shell's own `/api` rewrite, because that is the only href that keeps the
 * session first-party: the API's `Set-Cookie` then lands on the app's host, which is
 * the host every later page request carries cookies from. Named here so the screen and
 * its test read the same constant — a typo in one place cannot pass by matching itself.
 */
export const GITHUB_SIGN_IN_PATH = "/api/auth/github";

export type SignInOptions = {
  /** The password form. Off only if a deployment ever turns passwords off entirely. */
  password: boolean;
  /** Links to {@link GITHUB_SIGN_IN_PATH}. */
  github: boolean;
  /** Claims the shared demo account. */
  demo: boolean;
  /** Whether to say anything about signing up, and what. */
  signup: "invite_only" | "open" | "closed" | "unknown";
  /**
   * Whether the API actually answered. False means everything above is the shell's
   * fallback rather than this deployment's configuration.
   */
  known: boolean;
};

/**
 * What the shell shows when the API cannot be asked (it is asleep, or it failed).
 *
 * The password form, because every deployment has one and losing the door to a slow
 * server would be the worst of the outcomes. Nothing else is *claimed*: `signup` is
 * `unknown` rather than `invite_only`, since "signing up is invite-only" is a fact
 * about a deployment that a failed request did not teach us, and `known: false` lets
 * the screen say it could not check rather than present a guess as an answer.
 */
export const PASSWORD_ONLY: SignInOptions = {
  password: true,
  github: false,
  demo: false,
  signup: "unknown",
  known: false,
};

export function signInOptions(providers: AuthProviders): SignInOptions {
  return {
    password: providers.password,
    github: providers.github,
    demo: providers.demo,
    signup: providers.signupMode,
    known: true,
  };
}

/**
 * The codes the API sends back to `/login?error=…` when an OAuth round trip ends
 * badly (backend `github-oauth.controller.ts`). Anything unrecognised gets the plain
 * fallback rather than being shown raw: it arrives in a URL, so it is not ours to
 * trust, and a stranger's text in Bud's voice is worse than a vague sentence.
 */
const SIGN_IN_ERRORS: Record<string, string> = {
  github_declined: "GitHub sign-in was cancelled. Nothing happened.",
  github_state_mismatch:
    "That sign-in link had gone stale. Start again from this page and it should work.",
  github_no_code: "GitHub sent us back without a code. Try once more.",
  github_failed: "GitHub sign-in didn't complete. Try once more, or use your password.",
  signup_closed: "Signing up is invite-only for now, so that GitHub account can't be used yet.",
};

const UNRECOGNISED = "That sign-in didn't complete. Try once more.";

/**
 * A code from the URL, turned into a sentence.
 *
 * Takes `unknown` on purpose. The value comes from a query string, so it is whatever a
 * stranger put in the link: `?error=a&error=b` hands the page an array, which the
 * declared `{ error?: string }` says cannot happen, and a plain `obj[code]` lookup
 * answers `toString`, `constructor` and `__proto__` with things off `Object.prototype`
 * — a function or an object where a string was promised, which React then refuses to
 * render, taking the whole sign-in page down for anyone sent the link.
 */
export function signInError(code: unknown): string | null {
  if (typeof code !== "string" || code === "") return null;
  return Object.hasOwn(SIGN_IN_ERRORS, code) ? SIGN_IN_ERRORS[code] : UNRECOGNISED;
}

/** Voice: short, warm, specific (Design.md §8). Never "Oops! Something went wrong". */
export function signInMessage(cause: unknown): string {
  if (cause instanceof BudApiWakingError) {
    return "Bud's free server is still waking up. Give it a minute, then try again.";
  }
  if (cause instanceof BudApiUnreachableError) {
    return "Couldn't reach Bud just now. Is the API running?";
  }
  if (cause instanceof BudApiError) {
    if (cause.isUnauthorized) return "That email and password don't match.";
    if (cause.statusCode === 429) return "Too many attempts. Give it a minute.";
    return cause.message;
  }
  return "Couldn't sign in. Trying again may help.";
}

/** The demo has two failures of its own, and one of them is simply "come back". */
export function demoMessage(cause: unknown): string {
  if (cause instanceof BudApiError) {
    if (cause.statusCode === 503) {
      return "The demo is busy just now — every place is taken. Try again in a moment.";
    }
    if (cause.statusCode === 404) {
      return "The demo isn't running on this deployment.";
    }
  }
  return signInMessage(cause);
}
