"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { BudApiError, BudApiUnreachableError, BudApiWakingError, budApi } from "@/lib/api";

/**
 * The sign-in form from mockup 1a.
 *
 * The API owns the session, so this posts from the browser and lets the Set-Cookie
 * land, then refreshes so the server components pick the session up.
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Wake the API while they type. On the $0 deploy it may have been asleep for hours,
   * and a cold start takes about a minute — most of which can pass during the email
   * and password rather than after pressing Continue. One request per visit, never on
   * a timer. If it is slow, the waking notice explains why; its outcome is otherwise
   * ignored, since sign-in reports its own errors.
   */
  useEffect(() => {
    const controller = new AbortController();
    budApi.wake({ signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await budApi.login({ email, password });
      router.replace("/dashboard");
      router.refresh();
    } catch (cause) {
      setError(messageFor(cause));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={setEmail}
      />
      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
      />

      {error && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Signing in…" : "Continue"}
      </Button>

      <div className="flex items-center gap-3 py-2 text-sm text-[var(--muted-foreground)]">
        <span className="h-px flex-1 bg-[var(--border)]" />
        or
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>

      {/* GitHub OAuth is Phase 2; shown because the mockup does, disabled because it
          would not work. */}
      <Button
        variant="secondary"
        disabled
        title="GitHub sign-in arrives with Phase 2"
        className="w-full"
      >
        <span className="size-3 rounded-full bg-[var(--color-ink)]" aria-hidden />
        Continue with GitHub
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  type,
  value,
  autoComplete,
  onChange,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  autoComplete: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        required
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)]"
      />
    </div>
  );
}

/** Voice: short, warm, specific (Design.md §8). Never "Oops! Something went wrong". */
function messageFor(cause: unknown) {
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
