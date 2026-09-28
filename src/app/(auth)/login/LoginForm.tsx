"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { budApi } from "@/lib/api";
import {
  GITHUB_SIGN_IN_PATH,
  demoMessage,
  signInMessage,
  type SignInOptions,
} from "@/lib/auth/sign-in";

/**
 * The sign-in form from mockup 1a.
 *
 * The API owns the session, so this posts from the browser and lets the Set-Cookie
 * land, then refreshes so the server components pick the session up.
 */
export function LoginForm({
  options,
  error: arrived,
}: {
  options: SignInOptions;
  /** What the API said went wrong on the way back from somewhere else, if anything. */
  error: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(arrived);
  const [busy, setBusy] = useState<null | "password" | "demo">(null);
  const alert = useRef<HTMLParagraphElement>(null);

  /**
   * An error that arrived with the page is in the first paint, which is exactly why
   * nothing announces it: a live region only reports what changes *after* it is
   * mounted, so a screen reader runs past it with the rest of the card. Focusing it
   * says it, and puts the reader at the thing that needs reading — while a message
   * raised later by this form does change a mounted region, and is announced already.
   */
  useEffect(() => {
    if (arrived) alert.current?.focus();
  }, [arrived]);

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
    setBusy("password");
    setError(null);

    try {
      await budApi.login({ email, password });
      router.replace("/dashboard");
      router.refresh();
    } catch (cause) {
      setError(signInMessage(cause));
      setBusy(null);
    }
  }

  /**
   * The demo: one shared account, part-way through a course, reset when nobody has
   * used it for a while. Someone already in it gets the same account back rather than
   * a second place in a capped pool — so a 200 with no new cookie is success, not a
   * failure to sign in.
   */
  async function onDemo() {
    setBusy("demo");
    setError(null);

    try {
      await budApi.demoSignIn();
      router.replace("/dashboard");
      router.refresh();
    } catch (cause) {
      setError(demoMessage(cause));
      setBusy(null);
    }
  }

  return (
    /*
      `method="post"` for the seconds before hydration. A form with neither method nor
      action submits as a GET to its own URL, so someone who types a password and
      presses Enter while the JavaScript is still arriving — likeliest on the cold,
      slow deploy this whole app is built for — puts it in the address bar, the
      history, and any log in front of the shell. A POST lands in a request body that
      the page route refuses, which costs one press and leaks nothing.
    */
    <form onSubmit={onSubmit} method="post" className="mt-8 space-y-4">
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
        <p
          ref={alert}
          tabIndex={-1}
          role="alert"
          className="text-sm text-[var(--danger)] outline-none"
        >
          {error}
        </p>
      )}

      <Button type="submit" disabled={busy !== null} className="w-full">
        {busy === "password" ? "Signing in…" : "Continue"}
      </Button>

      {(options.github || options.demo) && (
        <div className="flex items-center gap-3 py-2 text-sm text-[var(--muted-foreground)]">
          <span className="h-px flex-1 bg-[var(--border)]" />
          or
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>
      )}

      {/*
        A link, not a fetch: OAuth is a navigation, and it goes through the shell's own
        /api rewrite so the session cookie the API sets lands on this host. A deployment
        without GitHub configured does not render it at all — a button that 404s is
        worse than no button (the API answers 404 for the route in that case too).
      */}
      {options.github && (
        <a href={GITHUB_SIGN_IN_PATH} className={buttonClasses("secondary", "w-full")}>
          <GitHubMark />
          Continue with GitHub
        </a>
      )}

      {options.demo && (
        <Button
          variant="secondary"
          onClick={onDemo}
          disabled={busy !== null}
          className="w-full"
        >
          {busy === "demo" ? "Opening the demo…" : "Look around the demo"}
        </Button>
      )}

      {options.demo && (
        <p className="text-center text-xs text-[var(--muted-foreground)]">
          A shared account, part-way through a course — other people may be in it right
          now, and can see anything you write. It is wiped when it resets.
        </p>
      )}
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

/** GitHub's mark, drawn rather than fetched: one icon is not worth a dependency. */
function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

