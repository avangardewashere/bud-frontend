/**
 * Bud, the mascot — Design.md §3.
 *
 * A small round plant creature: "a seedling that decided to have a face." Pear body
 * wider at the bottom so it reads as planted, lighter belly, a closed gold-tipped bud
 * on top, two deliberately asymmetric leaves, and three root-toes peeking underneath.
 * No outlines anywhere; shapes meet flat, with one soft shadow.
 *
 * The body, face and crown are separate <g> groups so the poses share geometry: a pose
 * changes the crown, the eyes or the scale, never the character.
 *
 * All six moods are here now (block 17). Which one a screen shows is not decided in
 * this file — see src/lib/bud/mood.ts, so the rules live in one place and this one
 * stays about drawing.
 */

import type { CSSProperties } from "react";
import { Seed } from "./Seed";

export type BudPose = "default" | "bloom" | "seed" | "sprout" | "thirsty" | "sleepy";

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
  /**
   * Play the bloom once, as it opens (Design.md §6: about 900ms, and a fade instead
   * under prefers-reduced-motion). Only meaningful with pose="bloom" — a bloom that is
   * simply true, like a finished course, is drawn open and still.
   */
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
};

const DEFAULT_LABELS: Record<BudPose, string> = {
  default: "Bud",
  bloom: "Bud, in bloom",
  seed: "A seed, not yet sprouted",
  sprout: "Bud, just sprouted",
  thirsty: "Bud, a little thirsty",
  sleepy: "Bud, dozing",
};

export function Bud({
  pose = "default",
  size = 72,
  detail = "auto",
  label,
  animate = false,
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

  /** A sprout is the same creature, younger: everything smaller, still sitting on its soil. */
  const scale = pose === "sprout" ? "translate(60 124) scale(0.78) translate(-60 -124)" : undefined;

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
      <g transform={scale}>
        {!simple && (
          <ellipse
            cx="60"
            cy="133"
            rx="33"
            ry="5"
            fill="var(--color-ink)"
            // Dozing softens the shadow rather than the character (Design.md §3).
            opacity={pose === "sleepy" ? 0.05 : 0.08}
          />
        )}

        {/* Root-toes first, so the body overlaps their tops and they only peek. */}
        {!simple && (
          <g fill="var(--color-leaf-600)" data-toes="">
            <ellipse cx="46" cy="126" rx="6" ry="4" />
            <ellipse cx="60" cy="128" rx="6" ry="4" />
            <ellipse cx="74" cy="126" rx="6" ry="4" />
          </g>
        )}

        <g>{pose === "bloom" ? <BloomCrown animate={animate} /> : <BudCrown pose={pose} />}</g>

        {/* Pear body: narrow at the shoulders, widest low down. */}
        <path
          d="M60 44 C44 44 34 60 32 82 C30 106 40 124 60 124 C80 124 90 106 88 82 C86 60 76 44 60 44 Z"
          fill="var(--color-leaf-400)"
        />

        {!simple && <ellipse cx="60" cy="98" rx="24" ry="20" fill="var(--color-leaf-50)" />}

        <Eyes pose={pose} simple={simple} />

        {!simple && (
          <path
            d="M54 102 Q60 107 66 102"
            fill="none"
            stroke="var(--color-leaf-900)"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        )}
      </g>
    </svg>
  );
}

/**
 * Eyes carry all the emotion — dark forest green, never black, and Bud never frowns
 * (Design.md §3). Thirsty is half-closed, dozing is closed; both keep the mouth.
 */
function Eyes({ pose, simple }: { pose: BudPose; simple: boolean }) {
  if (pose === "sleepy") {
    return (
      <g
        data-eyes="closed"
        fill="none"
        stroke="var(--color-leaf-900)"
        strokeWidth="2.6"
        strokeLinecap="round"
      >
        <path d="M41 86 Q48 91 55 86" />
        <path d="M65 86 Q72 91 79 86" />
      </g>
    );
  }

  if (pose === "thirsty") {
    return (
      <g data-eyes="half" fill="var(--color-leaf-900)">
        {/* Lower and shallower: tired, not sad. */}
        <ellipse cx="48" cy="89" rx="7.5" ry="5" />
        <ellipse cx="72" cy="89" rx="7.5" ry="5" />
      </g>
    );
  }

  return (
    <>
      <g data-eyes="open" fill="var(--color-leaf-900)">
        <ellipse cx="48" cy="86" rx="7.5" ry="9.5" />
        <ellipse cx="72" cy="86" rx="7.5" ry="9.5" />
      </g>
      {!simple && (
        <g fill="#FFFFFF" opacity="0.9">
          <circle cx="50.5" cy="82.5" r="2.2" />
          <circle cx="74.5" cy="82.5" r="2.2" />
        </g>
      )}
    </>
  );
}

/** The closed bud: tilted, gold-tipped, with one leaf higher than the other. */
function BudCrown({ pose }: { pose: BudPose }) {
  return (
    <>
      <path
        d="M60 48 L60 30"
        stroke="var(--color-leaf-600)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <CrownLeaves pose={pose} />
      <g transform="rotate(-8 60 20)">
        <ellipse cx="60" cy="20" rx="9" ry="13" fill="var(--color-leaf-500)" />
        <circle cx="60" cy="8" r="4.5" fill="var(--color-gold-400)" />
      </g>
    </>
  );
}

/** Bloom: the bud opens into a gold flower and, for a finished course, stays open. */
function BloomCrown({ animate }: { animate: boolean }) {
  return (
    <>
      <path
        d="M60 48 L60 30"
        stroke="var(--color-leaf-600)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <CrownLeaves pose="bloom" />
      {/* The class is defined in globals.css, which also handles reduced motion. */}
      <g className={animate ? "bud-bloom" : undefined} data-bloom-animate={animate ? "" : undefined}>
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

/**
 * Never symmetrical: the right leaf sits higher, per Design.md §3.
 *
 * A sprout has one leaf, because it has not grown the other yet, and a thirsty Bud's
 * droop — the only mood written as a change of posture rather than of face.
 */
function CrownLeaves({ pose }: { pose: BudPose }) {
  const droop = pose === "thirsty";
  return (
    <>
      {pose !== "sprout" && (
        <path
          d="M58 42 C48 42 40 36 38 28 C48 27 56 33 58 42 Z"
          fill="var(--color-leaf-600)"
          transform={droop ? "rotate(-22 58 42)" : undefined}
          data-leaf="left"
        />
      )}
      <path
        d="M62 38 C72 38 80 31 82 23 C72 22 64 29 62 38 Z"
        fill="var(--color-leaf-400)"
        transform={droop ? "rotate(22 62 38)" : undefined}
        data-leaf="right"
      />
    </>
  );
}
