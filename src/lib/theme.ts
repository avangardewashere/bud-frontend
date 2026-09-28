/**
 * The theme a learner has chosen — Design.md §4's dark mode, mockup 1k.
 *
 * Three choices, not two: "system" is the default and means "whatever this device
 * says", which is the one most people never have to think about. The other two are a
 * deliberate override of it.
 *
 * It lives in a cookie rather than localStorage for one reason: the server renders the
 * first paint. A theme read in the browser arrives after the HTML does, which is the
 * white flash every dark-mode implementation is remembered for — and the usual fix, a
 * blocking inline script, is exactly what this app's nonce CSP refuses. The cookie is
 * read by the root layout, so the very first byte of HTML already carries the answer.
 *
 * Not httpOnly, deliberately: the toggle sets it in the browser, and there is nothing
 * in it worth protecting — it is a preference about colour.
 */

export const THEME_COOKIE = "bud_theme";

/** A year: long enough that a choice feels permanent, short enough to expire eventually. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type ThemeChoice = "system" | "light" | "dark";

const CHOICES: ThemeChoice[] = ["system", "light", "dark"];

/** Anything unrecognised — an old value, a hand-edited cookie — means "system". */
export function parseThemeChoice(value: string | undefined | null): ThemeChoice {
  return CHOICES.includes(value as ThemeChoice) ? (value as ThemeChoice) : "system";
}

/**
 * What the `<html>` element carries. "system" carries nothing at all, so the CSS media
 * query decides; the two overrides name themselves, and the CSS lets an explicit
 * choice beat the device.
 */
export function themeAttribute(choice: ThemeChoice): "light" | "dark" | undefined {
  return choice === "system" ? undefined : choice;
}

/** What `color-scheme` should say, so scrollbars and form controls follow along. */
export function colorScheme(choice: ThemeChoice): "light" | "dark" | "light dark" {
  return choice === "system" ? "light dark" : choice;
}
