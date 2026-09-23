/**
 * Dates, formatted the same wherever they are rendered.
 *
 * A client component runs twice — on the server for the HTML, then in the browser to
 * hydrate it — and `toLocaleDateString()` answers differently in the two places: the
 * server has the host's timezone and locale (in production, a datacentre's), the
 * learner's browser has theirs. React calls that a hydration mismatch and throws the
 * server's markup away. So the format is pinned: one locale, UTC, one shape.
 *
 * UTC rather than the learner's zone because the alternative is worse: a date that
 * changes on hydration. These stamps say roughly when something happened, not to the
 * hour, and a day boundary read in UTC is close enough for "Handed in 24 Sep".
 */
const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "24 Sep" — or null for a missing or unparseable timestamp, so callers can omit it. */
export function formatDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : DAY.format(at);
}
