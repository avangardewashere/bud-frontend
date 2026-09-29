import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Bud, Wordmark } from "@/components/bud";
import { budApi } from "@/lib/api";
import { getSessionUser } from "@/lib/api/session";
import { PASSWORD_ONLY, signInError, signInOptions } from "@/lib/auth/sign-in";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in — Bud" };

/**
 * `error` is typed as it really arrives, not as it is meant to: a query string can
 * carry the same key twice, and Next hands the page an array when it does.
 */
type Params = { searchParams: Promise<{ error?: string | string[] }> };

/**
 * Mockup 1a: a centred card on Paper, Bud above the wordmark, nothing else.
 *
 * What is on the card depends on the deployment: GitHub and the demo appear only where
 * they are configured, which the API answers for. Asked here rather than in the
 * browser so the buttons are in the first paint — on the $0 deploy the API may be
 * waking, and buttons that arrive a minute after the form would be worse than a page
 * that simply takes a moment.
 */
export default async function LoginPage({ searchParams }: Params) {
  /**
   * Already signed in? Then this page is just a detour.
   *
   * Unlike every other page, a failed session lookup here means "show the door", not
   * "report a broken backend". `getSessionUser` rethrows an unreachable API on
   * purpose, so that the app's own pages don't quietly render as signed out — but on
   * *this* page that rethrow would take away the form, and the waking screen it put
   * there instead would offer no way in at all. Someone who is in fact signed in sees
   * the form for one paint and their next request redirects them; someone who is not
   * always gets the door.
   */
  if (await getSessionUser().catch(() => null)) redirect("/dashboard");

  const { error } = await searchParams;

  /**
   * A sleeping or broken API must not cost someone the password form: the shell falls
   * back to the one option every deployment has. The extra buttons are the ones that
   * can wait, and this page's own wake-up call (LoginForm) is about to run anyway.
   */
  const options = await budApi.providers().then(signInOptions).catch(() => PASSWORD_ONLY);

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-[420px] rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-8">
        {/* The card's heading is a picture of the name, so the page says it in words too. */}
        <h1 className="sr-only">Sign in to Bud</h1>
        <div className="flex flex-col items-center">
          <Bud size={90} label={null} />
          <Wordmark size={34} className="mt-3" />
          <p className="mt-1 text-[var(--muted-foreground)]">Glad you showed up.</p>
        </div>

        {/* The signup mode is passed in: one of these messages depends on it. */}
        <LoginForm options={options} error={signInError(error, options.signup)} />

        {options.signup === "invite_only" && (
          <p className="mt-6 text-center text-sm text-[var(--muted-foreground)]">
            Signup is invite-only for now.
          </p>
        )}

        {/*
          The API didn't answer, so the card below the form is the shell's fallback and
          not this deployment's configuration. Someone whose only way in is GitHub would
          otherwise be looking at a page that simply doesn't offer it, with nothing to
          suggest reloading would change that.
        */}
        {!options.known && (
          <p className="mt-6 text-center text-sm text-[var(--muted-foreground)]">
            Couldn&rsquo;t check the other ways in just now — reload to try again.
          </p>
        )}
      </div>
    </main>
  );
}
