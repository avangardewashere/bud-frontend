"use client";

import { setThemeChoice, useThemeChoice } from "@/lib/theme-client";
import type { ThemeChoice as Choice } from "@/lib/theme";

/**
 * The same preference as the nav's toggle, written out.
 *
 * The toggle is three icons in a row because it lives in a bar; here there is room to
 * say what each one means, which is the difference between a control you recognise and
 * one you have to try. Both write the same cookie through the same store, so changing
 * either moves the other in the same frame.
 */

const CHOICES: { value: Choice; label: string; hint: string }[] = [
  { value: "system", label: "Match this device", hint: "Follows your system setting." },
  { value: "light", label: "Light", hint: "Always light, even if this device is dark." },
  { value: "dark", label: "Dark", hint: "Always dark, even if this device is light." },
];

export function ThemeChoice({ known }: { known: Choice }) {
  const choice = useThemeChoice(known);

  return (
    <fieldset>
      <legend className="sr-only">Colour theme</legend>
      <div className="flex flex-col gap-2">
        {CHOICES.map((option) => (
          <label
            key={option.value}
            className={
              "flex cursor-pointer items-start gap-3 rounded-[var(--radius-card)] border p-3 " +
              (option.value === choice
                ? "border-[var(--tint-foreground)] bg-[var(--tint)]"
                : "border-[var(--border)] hover:bg-[var(--muted)]")
            }
          >
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={option.value === choice}
              onChange={() => setThemeChoice(option.value)}
              className="mt-1 accent-[var(--primary)]"
            />
            <span>
              <span className="block text-sm font-semibold">{option.label}</span>
              <span className="block text-sm text-[var(--muted-foreground)]">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
