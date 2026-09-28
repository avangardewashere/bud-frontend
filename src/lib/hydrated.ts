"use client";

import { useSyncExternalStore } from "react";

/** Nothing to subscribe to: this store only ever answers "am I in the browser?". */
const NEVER_CHANGES = () => () => {};

/**
 * False while the server renders and while React hydrates, true immediately after.
 *
 * The app has several facts the server cannot know — the reader's timezone, their
 * device's colour preference — and they all need the same shape of answer: render what
 * the server knows, match it exactly during hydration, then correct it. Reading the
 * browser directly instead produces markup that disagrees with the HTML it is
 * hydrating, which React throws away.
 *
 * useSyncExternalStore rather than an effect, because it has a server snapshot and a
 * client one by design, and does not set state during a commit to tell them apart.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );
}
