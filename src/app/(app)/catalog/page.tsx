import type { Metadata } from "next";
import { Bud } from "@/components/bud";

export const metadata: Metadata = { title: "Catalog — Bud" };

/**
 * Placeholder, so the dashboard's "Browse the catalog" is not a dead link.
 *
 * Block 6 replaces this wholesale with mockup 1e once GET /courses exists.
 */
export default function CatalogPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-4xl">Catalog</h1>
      <p className="mt-2 text-[var(--muted-foreground)]">No courses published yet.</p>

      <section className="mt-10 rounded-[var(--radius-panel)] border border-dashed border-[var(--border)] px-6 py-16 text-center">
        <Bud pose="seed" size={96} label={null} className="mx-auto" />
        <p className="mt-6 text-[var(--muted-foreground)]">
          Courses appear here once the catalog endpoint lands and an admin uploads one.
        </p>
      </section>
    </main>
  );
}
