/**
 * The fallback course cover — Design.md §11, "Default course cover: SVG template with
 * title text."
 *
 * Used whenever a course manifest has no cover image. The diagonal stripes tint from
 * the manifest's `theme.accent`, which is why the Docker course reads slate-blue in the
 * mockups: #1E6FA8 is exactly what its bud.manifest.json declares.
 */

import type { CSSProperties } from "react";

/** Stone-500, for a course that declares no accent of its own. */
const NEUTRAL_ACCENT = "#78716C";

export type CourseCoverProps = {
  title: string;
  /** The manifest's theme.accent. */
  accent?: string;
  className?: string;
  style?: CSSProperties;
};

export function CourseCover({
  title,
  accent = NEUTRAL_ACCENT,
  className,
  style,
}: CourseCoverProps) {
  /**
   * Pattern ids share one document, so two covers on a catalog page would collide.
   * Derived from the title rather than useId() so this stays a server component.
   */
  const id = `cover-${hash(title + accent)}`;

  return (
    <svg
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      style={{ display: "block", width: "100%", height: "100%", ...style }}
      role="img"
      aria-label={`${title} — no cover image`}
    >
      <defs>
        <pattern
          id={id}
          width="16"
          height="16"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="16" height="16" fill={accent} opacity="0.1" />
          <rect width="8" height="16" fill={accent} opacity="0.18" />
        </pattern>
      </defs>

      <rect width="320" height="180" fill={`${accent}14`} />
      <rect width="320" height="180" fill={`url(#${id})`} />

      <text
        x="160"
        y="96"
        textAnchor="middle"
        fill={accent}
        fontFamily="var(--font-mono)"
        fontSize="13"
        opacity="0.85"
      >
        {title}
      </text>
    </svg>
  );
}

/** Small, stable, and only ever used to keep SVG ids apart. */
function hash(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}
