"use client";

import { useState } from "react";
import {
  BudApiError,
  BudApiUnreachableError,
  budApi,
  apiBaseUrl,
  type PublicUser,
} from "@/lib/api";

/**
 * Block 2 harness — proves the typed client really talks to the API and that the
 * httpOnly session cookie survives a round trip. Throwaway: block 5 builds the
 * designed login screen (mockup 1a) and this goes with it.
 *
 * Deliberately not pretty. It exists so a human, and e2e/auth.spec.ts, can watch a
 * real sign-in happen against the real backend.
 */
export default function DevAuthPage() {
  const [email, setEmail] = useState("admin@bud.local");
  const [password, setPassword] = useState("bud-dev-admin-pw");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setStatus("");
    try {
      setStatus(await action());
    } catch (error) {
      if (error instanceof BudApiUnreachableError) {
        setStatus(error.message);
      } else if (error instanceof BudApiError) {
        const fields = error.fieldErrors.map((f) => `${f.path}: ${f.message}`).join("; ");
        setStatus(`${error.statusCode} ${error.error} — ${error.message}${fields ? ` (${fields})` : ""}`);
      } else {
        setStatus(String(error));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <h1 className="text-3xl">Auth harness</h1>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        The typed client against <code className="font-mono">{apiBaseUrl()}</code>. Block 5
        replaces this with the real login screen.
      </p>

      <div className="mt-8 space-y-3">
        <label className="block">
          <span className="text-sm font-semibold">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] px-3 py-2"
          />
        </label>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const signedIn = await budApi.login({ email, password });
              setUser(signedIn);
              return `Signed in as ${signedIn.email}`;
            })
          }
          className="rounded-[10px] bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)] disabled:opacity-50"
        >
          Sign in
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const who = await budApi.currentUser();
              setUser(who);
              return who ? `/me says ${who.email} (${who.role})` : "/me says nobody is signed in";
            })
          }
          className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-4 py-2 font-semibold disabled:opacity-50"
        >
          Who am I
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await budApi.logout();
              setUser(null);
              return "Signed out";
            })
          }
          className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-4 py-2 font-semibold disabled:opacity-50"
        >
          Sign out
        </button>
      </div>

      <p data-testid="status" className="mt-6 font-mono text-sm text-[var(--tint-foreground)]">
        {status}
      </p>

      <pre
        data-testid="user"
        className="mt-4 overflow-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-4 font-mono text-xs"
      >
        {user ? JSON.stringify(user, null, 2) : "no user"}
      </pre>
    </main>
  );
}
