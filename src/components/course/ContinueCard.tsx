import { GrowthMeter } from "@/components/bud";
import { ButtonLink } from "@/components/ui/Button";
import type { Dashboard } from "@/lib/api";

type Card = NonNullable<Dashboard["continueCard"]>;

/**
 * The Continue hero — mockup 1b, the first thing on the dashboard.
 *
 * `resuming` is false when they have never opened a session, so the card says Start
 * rather than Continue. The API is null here only when nothing is enrolled or
 * everything is finished, which is the empty state's job instead.
 */
export function ContinueCard({
  card,
  completedSessions,
  totalSessions,
}: {
  card: Card;
  completedSessions: number;
  totalSessions: number;
}) {
  return (
    <section className="flex flex-wrap items-center gap-5 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-5">
      <GrowthMeter
        completed={completedSessions}
        total={totalSessions}
        size="compact"
        label={null}
      />

      <div className="min-w-0 flex-1">
        <p className="font-mono text-xs uppercase tracking-wide text-[var(--tint-foreground)]">
          {card.resuming ? "Continue" : "Start"}
        </p>
        <h2 className="mt-1 truncate text-xl">{card.title}</h2>
        <p className="mt-1 truncate text-[var(--muted-foreground)]">
          Session {card.sessionOrder} · {card.sessionTitle}
        </p>
        <p className="mt-1 font-mono text-xs text-[var(--muted-foreground)]">
          {completedSessions} / {totalSessions} sessions · {card.percent}%
          {card.weight ? ` · ${card.weight}` : ""}
        </p>
      </div>

      <ButtonLink href={`/learn/${card.slug}/${card.sessionKey}`}>
        {card.resuming ? "Continue" : "Start"}
      </ButtonLink>
    </section>
  );
}
