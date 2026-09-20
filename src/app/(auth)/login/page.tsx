import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Bud, Wordmark } from "@/components/bud";
import { getSessionUser } from "@/lib/api/session";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in — Bud" };

/**
 * Mockup 1a: a centred card on Paper, Bud above the wordmark, nothing else.
 */
export default async function LoginPage() {
  // Already signed in? Then this page is just a detour.
  if (await getSessionUser()) redirect("/dashboard");

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-[420px] rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-8">
        <div className="flex flex-col items-center">
          <Bud size={90} label={null} />
          <Wordmark size={34} className="mt-3" />
          <p className="mt-1 text-[var(--muted-foreground)]">Glad you showed up.</p>
        </div>

        <LoginForm />

        <p className="mt-6 text-center text-sm text-[var(--muted-foreground)]">
          Signup is invite-only for now.
        </p>
      </div>
    </main>
  );
}
