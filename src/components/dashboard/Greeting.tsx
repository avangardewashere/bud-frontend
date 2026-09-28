"use client";

import { Bud } from "@/components/bud";
import { atThisHour, type Mood } from "@/lib/bud/mood";
import { useHydrated } from "@/lib/hydrated";
import { useIsDark } from "@/lib/theme-client";

/**
 * The top of the dashboard: Bud, the name, and the line under it — mockups 1b and 1k.
 *
 * A client component for one reason, which applies to all three parts at once: the
 * server does not know what time it is where the reader is, nor whether their device
 * asked for dark. It renders what the data alone justifies, and the browser corrects
 * it after hydration — the same trick dates use (src/components/ui/LocalDay.tsx).
 *
 * Bud is unlabelled: the heading beside it says who this is, and a screen reader
 * reading both hears the same thing twice.
 */
export function Greeting({ name, mood, quiet }: { name: string; mood: Mood; quiet: boolean }) {
  const hydrated = useHydrated();
  const dark = useIsDark();
  // The hour is read only once the browser is the one asking; during hydration this is
  // still the server's answer, so the markup matches the HTML it is hydrating.
  const now = hydrated ? atThisHour(mood, { hour: new Date().getHours(), dark }) : mood;

  return (
    <div className="flex items-center gap-5" data-testid="greeting">
      <Bud pose={now.pose} size={72} label={null} />
      <div>
        <h1 className="text-4xl">
          {now.evening ? "Good evening" : "Welcome back"}, {name}.
        </h1>
        {/*
          Except when the empty state is about to say the same thing in bigger type:
          two seeds and two sentences about nothing being planted is one too many.
        */}
        {!quiet && <p className="mt-1 text-[var(--muted-foreground)]">{now.greeting}</p>}
      </div>
    </div>
  );
}
