import type { Metadata } from "next";
import { Bud, BudIcon, CourseCover, GrowthMeter, Wordmark } from "@/components/bud";

/**
 * The brand gallery — every piece of artwork at every size it is used at, so the set
 * can be reviewed together rather than one screen at a time. Kept in the repo as a
 * living styleguide and used as the target for the screenshot test.
 */
export const metadata: Metadata = {
  title: "Bud — brand",
  robots: { index: false, follow: false },
};

export default function BrandPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-4xl">Brand</h1>
      <p className="mt-2 max-w-prose text-[var(--muted-foreground)]">
        Every component at the sizes the screens actually use. Design.md §2, §3, §7 and §11.
      </p>

      <Section
        title="Wordmark"
        note="leaf-600 at display sizes; leaf-700 below 24px, where it counts as body text for contrast."
      >
        <Swatch label="32, with icon">
          <Wordmark size={32} withIcon />
        </Swatch>
        <Swatch label="32, sprouting u">
          <Wordmark size={32} sprout />
        </Swatch>
        <Swatch label="24 — nav">
          <Wordmark size={24} withIcon />
        </Swatch>
        <Swatch label="18 — small">
          <Wordmark size={18} />
        </Swatch>
      </Section>

      <Section title="Mark" note="The 16px test: a green blob with a gold dot is correct.">
        <Swatch label="48">
          <BudIcon size={48} />
        </Swatch>
        <Swatch label="32">
          <BudIcon size={32} />
        </Swatch>
        <Swatch label="20 — nav">
          <BudIcon size={20} />
        </Swatch>
        <Swatch label="16 — favicon">
          <BudIcon size={16} />
        </Swatch>
      </Section>

      <Section
        title="Bud"
        note="Below 32px the belly, mouth and root-toes drop away — compare 32 with 24."
      >
        <Swatch label="150 — dashboard 1d">
          <Bud size={150} />
        </Swatch>
        <Swatch label="90 — login">
          <Bud size={90} />
        </Swatch>
        <Swatch label="72 — dashboard">
          <Bud size={72} />
        </Swatch>
        <Swatch label="32 — full">
          <Bud size={32} />
        </Swatch>
        <Swatch label="24 — player bar">
          <Bud size={24} />
        </Swatch>
        <Swatch label="20 — smallest">
          <Bud size={20} />
        </Swatch>
      </Section>

      <Section title="Poses" note="Bloom on course completion; seed for empty states.">
        <Swatch label="default">
          <Bud size={110} />
        </Swatch>
        <Swatch label="bloom">
          <Bud pose="bloom" size={110} />
        </Swatch>
        <Swatch label="seed">
          <Bud pose="seed" size={110} />
        </Swatch>
      </Section>

      <Section
        title="Growth meter — regular"
        note="A leaf per completed session, alternating. The session in progress is a pale outline."
      >
        {[0, 1, 3, 7, 10].map((done) => (
          <Swatch key={done} label={`${done} / 10`}>
            <GrowthMeter completed={done} total={10} />
          </Swatch>
        ))}
      </Section>

      <Section
        title="Growth meter — compact"
        note="Dashboard cards, catalog cards and the player rail."
      >
        {[0, 3, 6, 10].map((done) => (
          <Swatch key={done} label={`${done} / 10`}>
            <GrowthMeter completed={done} total={10} size="compact" />
          </Swatch>
        ))}
      </Section>

      <Section
        title="Growth meter — other course lengths"
        note="Leaf positions follow the session count. Past 12 sessions the plant becomes representative and the numbers stay authoritative."
      >
        <Swatch label="2 / 6">
          <GrowthMeter completed={2} total={6} />
        </Swatch>
        <Swatch label="6 / 6">
          <GrowthMeter completed={6} total={6} />
        </Swatch>
        <Swatch label="9 / 30">
          <GrowthMeter completed={9} total={30} />
        </Swatch>
      </Section>

      <Section title="Growth meter — hero" note="The course completion scene.">
        <Swatch label="10 / 10">
          <GrowthMeter completed={10} total={10} size="hero" />
        </Swatch>
      </Section>

      <Section
        title="Course cover"
        note="The fallback when a manifest has no cover. Tinted from the manifest's theme.accent."
      >
        <Swatch label="Docker — #1E6FA8">
          <div className="h-[140px] w-[248px] overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)]">
            <CourseCover title="Docker: 10-Session Course" accent="#1E6FA8" />
          </div>
        </Swatch>
        <Swatch label="no accent">
          <div className="h-[140px] w-[248px] overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)]">
            <CourseCover title="Postgres for App Developers" />
          </div>
        </Swatch>
      </Section>
    </main>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <h2 className="text-2xl">{title}</h2>
      {note && (
        <p className="mt-1 max-w-prose text-sm text-[var(--muted-foreground)]">{note}</p>
      )}
      <div className="mt-6 flex flex-wrap items-end gap-8">{children}</div>
    </section>
  );
}

function Swatch({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="flex flex-col items-center gap-3">
      <div className="flex min-h-[64px] items-end justify-center">{children}</div>
      <figcaption className="font-mono text-xs text-[var(--muted-foreground)]">
        {label}
      </figcaption>
    </figure>
  );
}
