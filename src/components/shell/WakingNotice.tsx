"use client";

import { useSyncExternalStore } from "react";
import { Bud } from "@/components/bud";
import { isWaking, subscribeWaking } from "@/lib/api/waking";

/**
 * "Bud's free server is waking up — about a minute."
 *
 * Mounted once, in the root layout, so every screen gets it without each caller
 * wiring its own: it shows while any API call from this tab is slow or being retried
 * (src/lib/api/waking.ts) and goes away by itself the moment they settle.
 *
 * The live region is always in the document and only its contents change, so screen
 * readers announce the notice when it appears — a region inserted already filled is
 * often missed.
 */
export function WakingNotice() {
  const waking = useSyncExternalStore(subscribeWaking, isWaking, () => false);

  return (
    /**
     * Never takes a tap: it holds nothing to press, and it floats over pages. Its
     * height from the bottom is --waking-offset, which screens with their own bottom
     * controls raise (globals.css): on a phone the player's Mark complete row and
     * session sheet sit exactly where it would otherwise land.
     */
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-[var(--waking-offset,5rem)] z-50 flex justify-center md:bottom-6"
    >
      {waking && (
        <div
          data-testid="waking-notice"
          className="flex max-w-md items-center gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] px-4 py-3"
        >
          {/* Asleep, which is the literal truth about the thing this notice is about. */}
          <Bud pose="sleepy" size={32} label={null} />
          <p className="text-sm">
            <span className="font-semibold">Bud&rsquo;s free server is waking up</span>
            <span className="text-[var(--muted-foreground)]">
              {" "}
              — about a minute. That&rsquo;s normal after a quiet spell.
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
