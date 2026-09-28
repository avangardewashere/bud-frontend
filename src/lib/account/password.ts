import { BudApiError, BudApiUnreachableError, BudApiWakingError } from "@/lib/api";

/**
 * The two rules behind the change-password card: what to say when it worked, and what
 * to say — and *where* — when it didn't.
 *
 * Both are here rather than in the component because both are the only real logic on
 * that screen, and a rule that can be read without a browser can be checked without
 * one. The wording matters more than it looks: one of these sentences tells someone
 * whether their password is now the old one or the new one.
 */

/** The API's rule (backend `passwordSchema`), stated where the field can show it. */
export const PASSWORD_MIN_LENGTH = 12;

/** Which input a message belongs beside, when it belongs beside one at all. */
export type PasswordField = "current" | "next";

export type PasswordProblem = {
  message: string;
  field: PasswordField | null;
};

/**
 * Changing a password signs out every other session. That is the point of changing
 * one, so the screen says how many rather than leaving someone to wonder whether the
 * laptop at work is still logged in.
 */
export function revokedMessage(revokedSessions: number): string {
  if (!Number.isFinite(revokedSessions) || revokedSessions <= 0) return "Password changed.";
  if (revokedSessions === 1) return "Password changed, and one other session was signed out.";
  return `Password changed, and ${revokedSessions} other sessions were signed out.`;
}

/**
 * Design.md §8: say what happened, and what to do about it — without asserting an
 * outcome the browser cannot know.
 *
 * The careful case is a gateway error. It means something in front of the API gave up
 * waiting, which does *not* mean the API never ran the change: on the $0 deploy a cold
 * start plus argon2 can outlast the proxy's patience. Telling someone "nothing
 * changed" there is the one message that could lock them out of their own account —
 * they would keep trying the old password while the new one is the live one. So only
 * an answer *from the API* (a 401, a 400) is allowed to claim nothing happened.
 */
export function changeFailure(cause: unknown): PasswordProblem {
  if (cause instanceof BudApiWakingError) {
    return {
      message:
        "Bud's server didn't answer in time, so the change may or may not have gone " +
        "through. Try signing in with the new password first, and the old one only if " +
        "that fails.",
      field: null,
    };
  }
  if (cause instanceof BudApiUnreachableError) {
    return { message: "Couldn't reach Bud. Try again in a moment.", field: null };
  }
  if (cause instanceof BudApiError) {
    // The API's own field messages know the rules (length, and what it refuses).
    const field = cause.fieldErrors[0];
    if (field) {
      return {
        message: field.message,
        field: field.path.toLowerCase().includes("current") ? "current" : "next",
      };
    }
    if (cause.isUnauthorized) {
      return { message: "That current password isn't right. Nothing changed.", field: "current" };
    }
    if (cause.statusCode === 429) {
      return { message: "Too many tries just now. Give it a minute.", field: null };
    }
    return { message: cause.message, field: null };
  }
  return { message: "Couldn't change it just now.", field: null };
}
