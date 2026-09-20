/**
 * Buttons — Design.md §6 and the mockups' three kinds.
 *
 * Primary is leaf-700 with white text, because leaf-600 on white fails AA at body
 * size (Design.md §4, rule 3). Secondary is a bordered card surface, and ghost is
 * bare emerald text for things like "Unenroll".
 *
 * Labels are verbs: "Start", "Continue", "Mark complete", "Upload course".
 */

import Link from "next/link";
import type { ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-[10px] px-4 py-2 font-semibold " +
  "transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-[var(--ring)] disabled:pointer-events-none disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--color-leaf-600)]",
  secondary:
    "border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]",
  ghost: "text-[var(--tint-foreground)] hover:bg-[var(--tint)]",
};

export function buttonClasses(variant: ButtonVariant = "primary", className = "") {
  return `${BASE} ${VARIANTS[variant]} ${className}`.trim();
}

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button type={type} className={buttonClasses(variant, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={buttonClasses(variant, className)} {...props} />;
}
