/**
 * A learner-supplied URL that is safe to put in an `href`, or null.
 *
 * Deliverables are links the learner types in — a repo, a live site — and an `href`
 * is not an inert string: `javascript:` runs script in the shell's own origin when
 * clicked, and `data:` opens a document the learner never wrote. So nothing reaches
 * an href without passing through here, and anything that does not is rendered as
 * plain text instead of a link.
 *
 * The API refuses anything but http(s) on the way in (backend `445949b`), and this is
 * the check on the way out. Two checks, because they answer different questions: the
 * API's is about what may be stored, this one about what this app is willing to
 * render — including values that predate a validator, arrive from an import, or come
 * from an endpoint written later.
 *
 * Parsing rather than matching, because the dangerous forms hide from string checks:
 * leading whitespace, embedded tabs and newlines ("java\nscript:"), and uppercase are
 * all normalised away by the URL parser before the protocol is read. A relative URL
 * has no protocol and is refused too — a deliverable lives somewhere else, never here.
 */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
}

/** "https://github.com/ari/bud" → "github.com/ari/bud", for showing a link compactly. */
export function linkLabel(url: string): string {
  const safe = safeHref(url);
  if (!safe) return url;
  const { host, pathname, search } = new URL(safe);
  return `${host}${pathname === "/" ? "" : pathname}${search}`;
}
