"use client";

import { useSyncExternalStore } from "react";
import {
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  parseThemeChoice,
  type ThemeChoice,
} from "./theme";

/**
 * The theme, from the browser's side.
 *
 * The server decided the first paint (see the root layout). This is what changes it
 * afterwards, and what lets the parts of the app that care — Bud's mood dozes in the
 * dark — react without a round trip.
 *
 * A store rather than React state, because the truth already lives outside React: it
 * is an attribute on `<html>`, a cookie, and the device's own preference. Anything
 * holding a copy would be a second answer to the same question.
 */

const listeners = new Set<() => void>();
/**
 * One listener on the media query for all of them, attached while anyone is watching.
 * Per-subscriber listeners would share the same function reference, so the first
 * component to unmount would remove it for everyone still listening — and the device
 * switching to dark at sunset would then move nothing.
 */
let media: MediaQueryList | null = null;

function announce() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  openChannel();
  if (!media) {
    media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", announce);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && media) {
      media.removeEventListener("change", announce);
      media = null;
    }
  };
}

/** What the learner chose: the attribute on <html>, which the server wrote. */
function readChoice(): ThemeChoice {
  return parseThemeChoice(document.documentElement.dataset.theme);
}

/** The same answer, read from where it persists — for a tab that was not the one that changed it. */
export function readStoredChoice(): ThemeChoice {
  const match = document.cookie.match(/(?:^|;\s*)bud_theme=([^;]*)/);
  return parseThemeChoice(match ? decodeURIComponent(match[1]) : undefined);
}

/**
 * Other tabs. A cookie fires no event, so a second tab would keep painting the old
 * theme until it was reloaded — with the cookie underneath it already saying otherwise.
 * One channel, opened lazily, and every tab applies what it is told.
 */
const CHANNEL = "bud-theme";
let channel: BroadcastChannel | null = null;

function openChannel() {
  if (channel || typeof BroadcastChannel === "undefined") return;
  channel = new BroadcastChannel(CHANNEL);
  channel.addEventListener("message", () => {
    apply(readStoredChoice());
    announce();
  });
}

/** Put a choice on the document. The cookie is written by setThemeChoice alone. */
function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
  root.style.colorScheme = choice === "system" ? "light dark" : choice;
}

/** What that resolves to right now, taking the device's preference into account. */
function readIsDark(): boolean {
  const choice = readChoice();
  if (choice !== "system") return choice === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Change it: the attribute first so the colours turn over in this frame, then the
 * cookie so the next first paint agrees with what is on screen. No refresh — the
 * server's copy of the answer is only ever read for that first paint.
 */
export function setThemeChoice(choice: ThemeChoice) {
  apply(choice);

  // Secure only where it can be: on http://localhost a Secure cookie is dropped, and
  // the toggle would appear to work until the next page load forgot it.
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${THEME_COOKIE}=${choice}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax${secure}`;

  openChannel();
  channel?.postMessage(choice);
  announce();
}

/**
 * The learner's choice, including "system".
 *
 * `known` is what the server read from the cookie. Without it the server would render
 * every toggle with "Auto" highlighted and the browser would move the highlight after
 * hydration — a control that lies about its own state for a frame, on the one screen
 * element whose entire job is to say what the current setting is.
 */
export function useThemeChoice(known: ThemeChoice = "system"): ThemeChoice {
  return useSyncExternalStore(subscribe, readChoice, () => known);
}

/** Whether what is on screen is the dark one. False while rendering on the server. */
export function useIsDark(): boolean {
  return useSyncExternalStore(subscribe, readIsDark, () => false);
}
