import type { Metadata } from "next";
import { Bud } from "@/components/bud";
import { ButtonLink } from "@/components/ui/Button";
import { getSessionUser } from "@/lib/api/session";

export const metadata: Metadata = { title: "Dashboard — Bud" };

/**
 * The dashboard — Design-Mockups.md 1b, with the session list from 1d.
 *
 * Only the empty state (1j) can be built today: the Continue hero and the course grid
 * need /me/dashboard and the catalog, which are blocks 3 and 4 on the backend. The
 * greeting is already real — the name comes from /me.
 */
export default async function DashboardPage() {
  // The layout has already redirected anyone without a session.
  const user = (await getSessionUser())!;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex items-center gap-5">
        <Bud size={72} label={null} />
        <div>
          <h1 className="text-4xl">Welcome back, {firstName(user.name)}.</h1>
          <p className="mt-1 text-[var(--muted-foreground)]">
            Nothing is growing yet. Bud will keep track once you start a course.
          </p>
        </div>
      </div>

      <section className="mt-12 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--card)] px-6 py-16 text-center">
        <Bud pose="seed" size={110} label={null} className="mx-auto" />
        <h2 className="mt-6 text-2xl">Nothing planted yet.</h2>
        <p className="mt-2 text-[var(--muted-foreground)]">
          Pick a course to start. Bud will keep track from there.
        </p>
        <ButtonLink href="/catalog" className="mt-6">
          Browse the catalog
        </ButtonLink>
      </section>
    </main>
  );
}

/** "Welcome back, Ari." — the greeting uses the first name only (Design.md §8). */
function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}
