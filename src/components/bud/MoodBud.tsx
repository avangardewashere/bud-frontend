"use client";

import { useSyncExternalStore } from "react";
import { atThisHour, type Mood } from "@/lib/bud/mood";
import { Bud, type BudProps } from "./Bud";

/** Nothing to subscribe to: this store only ever answers "am I in the browser?". */
const NEVER_CHANGES = () => () => {};

/**
 * Bud, in the mood the data says — and dozing if it is late where the reader is.
 *
 * The hour has to come from the browser: the server renders in a datacentre's
 * timezone, so a learner in Manila reading at midnight would otherwise be shown the
 * daytime face, or worse, be told it was the small hours when it was lunchtime. So the
 * HTML carries the pose the data alone justifies, and the browser swaps in the dozing
 * one after hydration, the same way dates do (src/components/ui/LocalDay.tsx).
 *
 * The greeting never changes with the hour, only the face. Design.md §3 describes the
 * sleepy tone as "quiet", not as different words, and swapping sentences under someone
 * at 22:00 would be a strange thing for a page to do.
 */
export function MoodBud({
  mood,
  ...props
}: { mood: Mood } & Omit<BudProps, "pose">) {
  const hydrated = useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );

  const pose = hydrated ? atThisHour(mood, new Date().getHours()).pose : mood.pose;
  return <Bud pose={pose} {...props} />;
}
