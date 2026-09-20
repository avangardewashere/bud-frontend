/**
 * The wordmark — Design.md §2: the word `bud`, lowercase, in the rounded geometric
 * display face, emerald.
 *
 * Live text rather than outlined SVG. The face is already loaded through next/font as
 * --font-display, so this stays crisp at any size, stays selectable, and avoids
 * converting a webfont to paths. An outlined version is only needed for an OG image.
 *
 * Colour: leaf-600 reads as the brand green at display sizes, but on Paper it only
 * clears AA as *large* text. Below 24px this drops to leaf-700, which passes at body size.
 */

import type { CSSProperties } from "react";
import { BudIcon } from "./BudIcon";

/** Below this, leaf-600 stops being "large text" for contrast purposes. */
const LARGE_TEXT_PX = 24;

export type WordmarkProps = {
  /** Cap height in px, roughly. Drives both the text and the optional icon. */
  size?: number;
  /** Show the Bud mark to the left, as the nav does. */
  withIcon?: boolean;
  /**
   * The `u` sprouts a tiny gold-tipped stem (Design.md §2). Off by default: it is a
   * treat for the app header at large sizes and disappears below ~28px anyway.
   */
  sprout?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function Wordmark({
  size = 24,
  withIcon = false,
  sprout = false,
  className,
  style,
}: WordmarkProps) {
  const color = size < LARGE_TEXT_PX ? "var(--color-leaf-700)" : "var(--color-leaf-600)";

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size * 0.3,
        ...style,
      }}
    >
      {withIcon && <BudIcon size={size * 0.9} />}
      <span
        style={{
          position: "relative",
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: size,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          color,
        }}
      >
        bud
        {sprout && size >= 28 && <Sprout size={size} />}
      </span>
    </span>
  );
}

/**
 * Sits over the `u`, which in a three-letter lowercase word is close enough to the
 * centre to place proportionally rather than by measuring glyphs.
 */
function Sprout({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size * 0.42}
      height={size * 0.42}
      aria-hidden
      style={{ position: "absolute", left: "38%", top: -size * 0.34 }}
    >
      <path
        d="M12 24V10"
        stroke="var(--color-leaf-600)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M12 16c-2-5-7-7-10-6 0 4 4 8 10 6z" fill="var(--color-leaf-600)" />
      <path d="M12 12c2-5 7-7 10-6 0 4-4 8-10 6z" fill="var(--color-leaf-400)" />
      <circle cx="12" cy="7" r="4" fill="var(--color-gold-400)" />
    </svg>
  );
}
