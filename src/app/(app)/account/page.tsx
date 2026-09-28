import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ChangePassword } from "@/components/account/ChangePassword";
import { ExportLink } from "@/components/account/ExportLink";
import { ThemeChoice as ThemePreference } from "@/components/account/ThemePreference";
import { SignOutButton } from "@/components/shell/SignOutButton";
import { budApi } from "@/lib/api";
import { getSessionUser } from "@/lib/api/session";
import { THEME_COOKIE, parseThemeChoice } from "@/lib/theme";

export const metadata: Metadata = { title: "Account — Bud" };

/**
 * Everything about you that Bud holds, on one page: who you are, how you want it to
 * look, and the two things you might want to do about it.
 *
 * There is not much here on purpose. Bud stores a name, an email and what you have
 * done with courses — so an account screen that filled a page would be inventing
 * settings nobody asked for.
 */
export default async function AccountPage() {
  // The layout has already redirected anyone without a session.
  const user = (await getSessionUser())!;
  const theme = parseThemeChoice((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-4xl">Account</h1>

      <section className="mt-8 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="text-sm font-semibold">You</h2>
        <dl className="mt-3 grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
          <dt className="text-[var(--muted-foreground)]">Name</dt>
          <dd>{user.name}</dd>
          <dt className="text-[var(--muted-foreground)]">Email</dt>
          <dd className="[overflow-wrap:anywhere]">{user.email}</dd>
          {user.role === "admin" && (
            <>
              <dt className="text-[var(--muted-foreground)]">Role</dt>
              <dd>Admin</dd>
            </>
          )}
        </dl>
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">
          Changing your name or email isn&rsquo;t here yet.
        </p>
      </section>

      <section className="mt-6 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="text-sm font-semibold">Appearance</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          The same setting as the one in the top bar, somewhere it can be found on purpose.
        </p>
        <div className="mt-3">
          <ThemePreference known={theme} />
        </div>
      </section>

      <section className="mt-6 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="text-sm font-semibold">Password</h2>
        <ChangePassword />
      </section>

      <section className="mt-6 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="text-sm font-semibold">Your data</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          A zip of everything Bud holds for you: your profile, what you have finished,
          your notes and what you handed in, the work the courses saved, and a README
          explaining the rest. The notes are the same Markdown the per-course export
          gives you.
        </p>
        <ExportLink href={budApi.exportUrl()} />
      </section>

      {/* Side by side where there is room; stacked on a phone, where "Sign out"
          squeezed into the right-hand column wraps to two lines. */}
      <section className="mt-6 flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--card)] p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div>
          <h2 className="text-sm font-semibold">Sign out</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            On this device. Anything already saved stays saved.
          </p>
        </div>
        <SignOutButton />
      </section>
    </main>
  );
}
