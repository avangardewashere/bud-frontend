"use client";

import { useSyncExternalStore } from "react";
import { formatDay } from "@/lib/format";

/** Nothing to subscribe to: this store only ever answers "am I in the browser?". */
const NEVER_CHANGES = () => () => {};

/**
 * A date, shown in the reader's own day rather than the server's.
 *
 * The server has no idea where the reader is — in production it is a datacentre on
 * UTC, and a note written at one in the morning in Manila was written the day before
 * as far as UTC is concerned. So the HTML carries the pinned UTC day (see
 * src/lib/format.ts, and React hydrates against exactly that), and the browser then
 * re-renders it in the timezone the reader actually lives in.
 *
 * useSyncExternalStore rather than an effect: it has a server snapshot and a client
 * one by design, which is precisely this problem, and it does not set state during a
 * commit to do it.
 */
export function LocalDay({ iso }: { iso: string | null | undefined }) {
  const hydrated = useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );

  const text = hydrated ? inReadersZone(iso) : formatDay(iso);
  if (!text) return null;
  return <time dateTime={iso ?? undefined}>{text}</time>;
}

/** "24 Sep", in whatever zone and locale the browser is set to. */
function inReadersZone(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
