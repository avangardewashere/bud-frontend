/**
 * Bud, the mascot — Design.md §3.
 *
 * A small round plant creature: "a seedling that decided to have a face." Pear body
 * wider at the bottom so it reads as planted, lighter belly, a closed gold-tipped bud
 * on top, two deliberately asymmetric leaves, and three root-toes peeking underneath.
 * No outlines anywhere; shapes meet flat, with one soft shadow.
 *
 * The body, face and crown are separate <g> groups so the poses share geometry and a
 * later phase can animate a swap rather than cross-fade whole illustrations.
 *
 * Poses here are the three v0 screens need. Sprout, thirsty and sleepy are Phase 2.
 */

import type { CSSProperties } from "react";
import { Seed } from "./Seed";

export type BudPose = "default" | "bloom" | "seed";

/**
 * Below this, the belly, mouth and root-toes stop being shapes and become mud. The
 * player top bar (24px) and the nav (~20px) both land here, so those get a reduced
 * silhouette instead — the same discipline as the 16px icon test in Design.md §2.
 */
const SIMPLIFY_BELOW = 32;

export type BudProps = {
  pose?: BudPose;
  /** Rendered height in px. Width follows the viewBox. */
  size?: number;
  /** "auto" picks full or simple from `size`. */
  detail?: "auto" | "full" | "simple";
  /** Accessible name. Pass null when Bud sits beside text that already says it. */
  label?: string | null;
  className?: string;
  style?: CSSProperties;
};

const DEFAULT_LABELS: Record<BudPose, string> = {
  default: "Bud",
  bloom: "Bud, in bloom",
  seed: "A seed, not yet sprouted",
};

export function Bud({
  pose = "default",
  size = 72,
  detail = "auto",
  label,
  className,
  style,
}: BudProps) {
  if (pose === "seed") {
    return <Seed size={size} label={label} className={className} style={style} />;
  }

  const simple = detail === "simple" || (detail === "auto" && size < SIMPLIFY_BELOW);
  const name = label === undefined ? DEFAULT_LABELS[pose] : label;
  const a11y =
    name === null
      ? ({ "aria-hidden": true } as const)
      : ({ role: "img", "aria-label": name } as const);

  return (
    <svg
      viewBox="0 0 120 140"
      height={size}
      width={(size * 120) / 140}
      className={className}
      style={style}
      data-pose={pose}
      data-detail={simple ? "simple" : "full"}
      {...a11y}
    >
      {!simple && (
        <ellipse cx="60" cy="133" rx="33" ry="5" fill="var(--color-ink)" opacity="0.08" />
      )}

      {/* Root-toes first, so the body overlaps their tops and they only peek. */}
      {!simple && (
        <g fill="var(--color-leaf-600)" data-toes="">
          <ellipse cx="46" cy="126" rx="6" ry="4" />
          <ellipse cx="60" cy="128" rx="6" ry="4" />
          <ellipse cx="74" cy="126" rx="6" ry="4" />
        </g>
      )}

      <g>
        {pose === "bloom" ? <BloomCrown /> : <BudCrown />}
      </g>

      {/* Pear body: narrow at the shoulders, widest low down. */}
      <path
        d="M60 44 C44 44 34 60 32 82 C30 106 40 124 60 124 C80 124 90 106 88 82 C86 60 76 44 60 44 Z"
        fill="var(--color-leaf-400)"
      />

      {!simple && <ellipse cx="60" cy="98" rx="24" ry="20" fill="var(--color-leaf-50)" />}

      {/* Eyes carry all the emotion — dark forest green, never black. */}
      <g fill="var(--color-leaf-900)">
        <ellipse cx="48" cy="86" rx="7.5" ry="9.5" />
        <ellipse cx="72" cy="86" rx="7.5" ry="9.5" />
      </g>

      {!simple && (
        <>
          <g fill="#FFFFFF" opacity="0.9">
            <circle cx="50.5" cy="82.5" r="2.2" />
            <circle cx="74.5" cy="82.5" r="2.2" />
          </g>
          <path
            d="M54 102 Q60 107 66 102"
            fill="none"
            stroke="var(--color-leaf-900)"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

/** The closed bud: tilted, gold-tipped, with one leaf higher than the other. */
function BudCrown() {
  return (
    <>
      <path
        d="M60 48 L60 30"
        stroke="var(--color-leaf-600)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <CrownLeaves />
      <g transform="rotate(-8 60 20)">
        <ellipse cx="60" cy="20" rx="9" ry="13" fill="var(--color-leaf-500)" />
        <circle cx="60" cy="8" r="4.5" fill="var(--color-gold-400)" />
      </g>
    </>
  );
}

/** Bloom: the bud opens into a gold flower and, for a finished course, stays open. */
function BloomCrown() {
  return (
    <>
      <path
        d="M60 48 L60 30"
        stroke="var(--color-leaf-600)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <CrownLeaves />
      <g>
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <ellipse
            key={deg}
            cx="60"
            cy="12"
            rx="5.5"
            ry="9"
            fill="var(--color-gold-400)"
            transform={`rotate(${deg} 60 21)`}
          />
        ))}
        <circle cx="60" cy="21" r="5" fill="var(--color-gold-300)" />
      </g>
    </>
  );
}

/** Never symmetrical: the right leaf sits higher, per Design.md §3. */
function CrownLeaves() {
  return (
    <>
      <path
        d="M58 42 C48 42 40 36 38 28 C48 27 56 33 58 42 Z"
        fill="var(--color-leaf-600)"
      />
      <path
        d="M62 38 C72 38 80 31 82 23 C72 22 64 29 62 38 Z"
        fill="var(--color-leaf-400)"
      />
    </>
  );
}
