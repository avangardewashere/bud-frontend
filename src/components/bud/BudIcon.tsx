/**
 * The Bud mark — Design.md §2. A single closed bud on a short stem with two leaves,
 * gold highlight on the tip. This is the logo, not the character: it is what sits in
 * the nav beside the wordmark and what ships as the favicon.
 *
 * Kept in step with `src/app/icon.svg`, which is the same artwork as a static file so
 * Next can serve it as the favicon. If one changes, change both.
 *
 * The test is to shrink it to 16px: a green blob with a yellow dot is the correct result.
 */

import type { CSSProperties } from "react";

export type BudIconProps = {
  size?: number;
  label?: string | null;
  className?: string;
  style?: CSSProperties;
};

export function BudIcon({ size = 20, label = null, className, style }: BudIconProps) {
  const a11y =
    label === null
      ? ({ "aria-hidden": true } as const)
      : ({ role: "img", "aria-label": label } as const);

  return (
    <svg
      viewBox="0 0 64 64"
      height={size}
      width={size}
      className={className}
      style={style}
      {...a11y}
    >
      <path
        d="M32 58V34"
        stroke="var(--color-leaf-700)"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Asymmetric on purpose: the right leaf sits higher. */}
      <path d="M32 44c-3-9-11-12-17-11 0 7 6 13 17 11z" fill="var(--color-leaf-600)" />
      <path d="M32 38c3-10 12-13 18-12 0 8-7 14-18 12z" fill="var(--color-leaf-400)" />
      <path
        d="M32 34c-7 0-11-6-11-13 0-8 5-15 11-15s11 7 11 15c0 7-4 13-11 13z"
        fill="var(--color-leaf-600)"
      />
      <circle cx="32" cy="8" r="5" fill="var(--color-gold-400)" />
    </svg>
  );
}
