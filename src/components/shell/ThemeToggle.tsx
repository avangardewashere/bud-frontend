"use client";

import { setThemeChoice, useThemeChoice } from "@/lib/theme-client";
import type { ThemeChoice } from "@/lib/theme";

/**
 * Light, dark, or whatever the device says — mockup 1k, and Design.md §4's dark mode.
 *
 * Three buttons rather than one that cycles: a cycling control cannot say what it will
 * do next, and "system" is a real answer people choose on purpose rather than a state
 * to be passed through on the way back to light.
 *
 * The icons are drawn here rather than pulled from a set: three shapes at 16px is less
 * code than a dependency, and they can use the same tokens as everything else.
 */

const CHOICES: { value: ThemeChoice; label: string; title: string }[] = [
  { value: "light", label: "Light", title: "Always light" },
  { value: "dark", label: "Dark", title: "Always dark" },
  { value: "system", label: "Auto", title: "Follow this device" },
];

export function ThemeToggle({ known }: { known: ThemeChoice }) {
  // `known` is the cookie the server read, so the first paint marks the right button.
  const choice = useThemeChoice(known);

  return (
    <div
      role="group"
      aria-label="Colour theme"
      data-testid="theme-toggle"
      /*
        A surface as well as a border: in the dark the border alone is 1.45:1 against
        the bar behind it, and this is the one control here defined by nothing else.
      */
      className="flex items-center rounded-full border border-[var(--border)] bg-[var(--muted)] p-0.5"
    >
      {CHOICES.map((option) => {
        const chosen = option.value === choice;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setThemeChoice(option.value)}
            // aria-pressed, not aria-current: these are settings, not places.
            aria-pressed={chosen}
            aria-label={option.label}
            title={option.title}
            data-choice={option.value}
            className={
              "flex size-7 items-center justify-center rounded-full transition-colors duration-200 " +
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)] " +
              (chosen
                ? "bg-[var(--tint)] text-[var(--tint-foreground)]"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]")
            }
          >
            <Icon choice={option.value} />
          </button>
        );
      })}
    </div>
  );
}

/** A sun, a moon, and a half-and-half circle for "whatever the device says". */
function Icon({ choice }: { choice: ThemeChoice }) {
  if (choice === "light") {
    return (
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden fill="currentColor">
        <circle cx="8" cy="8" r="3.2" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <rect
            key={deg}
            x="7.4"
            y="0.6"
            width="1.2"
            height="2.6"
            rx="0.6"
            transform={`rotate(${deg} 8 8)`}
          />
        ))}
      </svg>
    );
  }

  if (choice === "dark") {
    return (
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden fill="currentColor">
        {/* A crescent, cut rather than drawn, so it keeps the same weight as the sun. */}
        <path d="M13 9.6A5.6 5.6 0 0 1 6.4 3a5.6 5.6 0 1 0 6.6 6.6Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
      <circle cx="8" cy="8" r="5.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 2.6a5.4 5.4 0 0 1 0 10.8Z" fill="currentColor" />
    </svg>
  );
}
