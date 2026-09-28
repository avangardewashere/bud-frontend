"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { budApi } from "@/lib/api";
import {
  PASSWORD_MIN_LENGTH,
  changeFailure,
  revokedMessage,
  type PasswordField,
  type PasswordProblem,
} from "@/lib/account/password";

/**
 * Changing a password — the one account action the API has had since block 3 and the
 * shell has never offered.
 *
 * The wording of both outcomes lives in lib/account/password.ts, where it can be read
 * without a browser. What is left here is the shape of the form, and the two things a
 * form like this usually gets wrong: saying the rule before the rule is broken, and
 * putting each message beside the field it is about.
 */
export function ChangePassword() {
  const ids = useId();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<PasswordProblem | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const submit = useRef<HTMLButtonElement>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    setDone(null);

    try {
      const result = await budApi.changePassword({
        currentPassword: current,
        newPassword: next,
      });
      setCurrent("");
      setNext("");
      setDone(revokedMessage(result.revokedSessions));
    } catch (cause) {
      setProblem(changeFailure(cause));
    } finally {
      setBusy(false);
    }
  }

  /**
   * The browser blurs a button the moment it is disabled, so pressing this one drops
   * focus to <body> — and the next Tab starts again at the top of the document, nine
   * stops of navigation away from the thing that just happened. Put it back, and only
   * when nothing else has claimed it. (Same six lines as the player's hand-in panel.)
   */
  useEffect(() => {
    if (!busy && document.activeElement === document.body) submit.current?.focus();
  }, [busy]);

  const problemId = `${ids}-problem`;
  const hintId = `${ids}-hint`;
  const consequenceId = `${ids}-consequence`;
  const beside = (field: PasswordField) =>
    problem?.field === field ? { message: problem.message, id: problemId } : null;

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3" data-testid="change-password">
      <Field
        id={`${ids}-current`}
        label="Current password"
        autoComplete="current-password"
        value={current}
        onChange={setCurrent}
        error={beside("current")}
      />
      <Field
        id={`${ids}-next`}
        label="New password"
        autoComplete="new-password"
        value={next}
        onChange={setNext}
        error={beside("next")}
        // The rule, before it is broken rather than after — a password manager has
        // already generated something by the time the API would object.
        hint={{ id: hintId, text: `At least ${PASSWORD_MIN_LENGTH} characters.` }}
      />

      {/* A message with no field of its own — a rate limit, a gateway giving up. */}
      {problem && problem.field === null && (
        <p id={problemId} role="alert" className="text-sm text-[var(--danger)]">
          {problem.message}
        </p>
      )}
      {done && (
        <p role="status" className="text-sm text-[var(--tint-foreground)]">
          {done}
        </p>
      )}

      {/*
        Above the button, and named by it: this is the consequence of pressing it, and
        a sentence underneath is read after the decision it was meant to inform.
      */}
      <p id={consequenceId} className="text-xs text-[var(--muted-foreground)]">
        Every other session signs out; this one stays.
      </p>
      {/*
        Disabled only while it is working. A button greyed out until two fields are
        filled reads as broken on arrival — and the fields are `required`, so the
        browser already says which one is empty, in the place it is empty.
      */}
      <Button ref={submit} type="submit" disabled={busy} aria-describedby={consequenceId}>
        {busy ? "Changing…" : "Change password"}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  autoComplete,
  onChange,
  error,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  autoComplete: string;
  onChange: (value: string) => void;
  /** A message about *this* field, with the id the input points at. */
  error: { message: string; id: string } | null;
  hint?: { id: string; text: string };
}) {
  const describedBy = [error?.id, hint?.id].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        type="password"
        required
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="mt-1 w-full rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)]"
      />
      {error && (
        <p id={error.id} role="alert" className="mt-1 text-sm text-[var(--danger)]">
          {error.message}
        </p>
      )}
      {hint && (
        <p id={hint.id} className="mt-1 text-xs text-[var(--muted-foreground)]">
          {hint.text}
        </p>
      )}
    </div>
  );
}
