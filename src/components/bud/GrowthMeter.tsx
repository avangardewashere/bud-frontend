/**
 * The growth meter — Design.md §7, the signature component.
 *
 * A course is a plant in a pot. The stem grows with completion, each finished session
 * adds a leaf alternating up the stem, the session in progress shows as a pale outline,
 * and finishing the course opens a gold bloom that stays.
 *
 * This draws the plant only. The plain numbers that sit beside it ("7 / 10 sessions",
 * "70%") land in a different place and size on every screen, so the screens compose them.
 */

import type { CSSProperties } from "react";
import { Bud } from "./Bud";

export type GrowthMeterSize = "compact" | "regular" | "hero";

const HEIGHTS: Record<GrowthMeterSize, number> = {
  compact: 64,
  regular: 160,
  hero: 240,
};

/** Stem geometry, in viewBox units. */
const BASE_Y = 100;
const STEM_STUB = 10;
const STEM_RUN = 72;

/**
 * Past this the leaves stop fitting up the stem. Longer courses draw a representative
 * plant instead of one leaf per session; the numbers beside it stay authoritative.
 */
const MAX_LEAVES = 12;

export type GrowthMeterProps = {
  completed: number;
  total: number;
  size?: GrowthMeterSize;
  label?: string | null;
  className?: string;
  style?: CSSProperties;
};

export function GrowthMeter({
  completed,
  total,
  size = "regular",
  label,
  className,
  style,
}: GrowthMeterProps) {
  const safeTotal = Math.max(1, Math.floor(total));
  const done = Math.min(Math.max(0, Math.floor(completed)), safeTotal);

  const slots = Math.min(safeTotal, MAX_LEAVES);
  const shown =
    safeTotal <= MAX_LEAVES ? done : Math.round((done / safeTotal) * slots);

  const complete = done === safeTotal;
  const inProgress = !complete && shown < slots;

  const slotY = (index: number) =>
    BASE_Y - (STEM_STUB + ((index + 1) / slots) * STEM_RUN);

  const grownTopY = shown > 0 ? slotY(shown - 1) : BASE_Y - STEM_STUB;
  const pendingTopY = inProgress ? slotY(shown) : grownTopY;

  const name =
    label === undefined
      ? `${done} of ${safeTotal} sessions complete`
      : label;
  const a11y =
    name === null
      ? ({ "aria-hidden": true } as const)
      : ({ role: "img", "aria-label": name } as const);

  const plant = (
    <svg
      viewBox="0 0 100 140"
      height={HEIGHTS[size]}
      width={(HEIGHTS[size] * 100) / 140}
      className={className}
      style={style}
      {...a11y}
    >
      {/* The stem the plant has not grown into yet, drawn first so leaves sit over it. */}
      {inProgress && (
        <path
          d={`M50 ${grownTopY} L50 ${pendingTopY}`}
          stroke="var(--color-leaf-100)"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
      )}

      <path
        d={`M50 ${BASE_Y} L50 ${grownTopY}`}
        stroke="var(--color-leaf-600)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />

      {Array.from({ length: shown }, (_, i) => (
        <Leaf key={i} y={slotY(i)} side={i % 2 === 0 ? "left" : "right"} state="done" />
      ))}

      {inProgress && (
        <Leaf
          y={pendingTopY}
          side={shown % 2 === 0 ? "left" : "right"}
          state="pending"
        />
      )}

      {complete && <Bloom y={slotY(slots - 1)} />}

      <Pot />
    </svg>
  );

  if (size !== "hero") return plant;

  // The completion scene: Bud sits beside the pot, its own bud open too.
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
      {plant}
      <Bud pose="bloom" size={HEIGHTS.hero * 0.62} label={null} />
    </div>
  );
}

function Pot() {
  return (
    <g
      fill="var(--color-stone-100)"
      stroke="var(--color-stone-300)"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <path d="M22 100 L78 100 L75 111 L25 111 Z" />
      <path d="M26 111 L74 111 L67 133 L33 133 Z" />
    </g>
  );
}

function Leaf({
  y,
  side,
  state,
}: {
  y: number;
  side: "left" | "right";
  state: "done" | "pending";
}) {
  const d =
    side === "left"
      ? `M50 ${y} C38 ${y - 1} 30 ${y - 7} 27 ${y - 14} C37 ${y - 13} 47 ${y - 7} 50 ${y} Z`
      : `M50 ${y} C62 ${y - 1} 70 ${y - 7} 73 ${y - 14} C63 ${y - 13} 53 ${y - 7} 50 ${y} Z`;

  return state === "done" ? (
    <path d={d} fill="var(--color-leaf-500)" data-leaf="done" />
  ) : (
    <path
      d={d}
      fill="none"
      stroke="var(--color-leaf-100)"
      strokeWidth="2"
      data-leaf="pending"
    />
  );
}

/** Gold, and it stays open once the course is finished. */
function Bloom({ y }: { y: number }) {
  return (
    <g data-bloom="">
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <ellipse
          key={deg}
          cx="50"
          cy={y - 9}
          rx="5"
          ry="8"
          fill="var(--color-gold-400)"
          transform={`rotate(${deg} 50 ${y})`}
        />
      ))}
      <circle cx="50" cy={y} r="4.5" fill="var(--color-gold-300)" />
    </g>
  );
}
