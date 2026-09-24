/**
 * The seed — Design.md §3, the "Seed" state: "Just a seed in soil, one tiny crack
 * showing green." Used for empty states, where the copy is "Nothing planted yet."
 *
 * Shares Bud's viewBox so the two can be swapped at the same `size` without the
 * layout shifting.
 */

import type { CSSProperties } from "react";

export type SeedProps = {
  size?: number;
  label?: string | null;
  className?: string;
  style?: CSSProperties;
};

export function Seed({ size = 72, label, className, style }: SeedProps) {
  const name = label === undefined ? "A seed, not yet sprouted" : label;
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
      // Every pose carries its name, seed included — it is how the gallery and the
      // tests tell one mood from another without reading the artwork.
      data-pose="seed"
      {...a11y}
    >
      <ellipse cx="60" cy="122" rx="40" ry="5" fill="var(--color-ink)" opacity="0.06" />

      {/* The seed sits half-buried, so it is drawn before the mound. */}
      <g transform="rotate(-10 60 96)">
        <ellipse cx="60" cy="96" rx="10" ry="13" fill="var(--color-stone-500)" />
        {/* The crack, showing the green that has not arrived yet. */}
        <path
          d="M60 85 C56 90 56 100 60 106 C64 100 64 90 60 85 Z"
          fill="var(--color-leaf-500)"
        />
      </g>

      <path
        d="M14 120 C28 100 44 106 60 106 C76 106 92 100 106 120 Z"
        fill="var(--color-stone-300)"
      />
    </svg>
  );
}
