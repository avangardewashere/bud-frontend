import { Markdown } from "@/components/ui/Markdown";

/**
 * The course outline, rendered from the manifest's Markdown — mockup 1f's left column.
 *
 * The rendering itself is shared with a learner's notes (components/ui/Markdown.tsx),
 * which is also where the reason raw HTML is never rendered is written down: this
 * Markdown comes from a course package, and course packages are author-controlled.
 */

/**
 * Course outlines are written as standalone documents, so they open with their own
 * `# Title` — which the page has already shown above. Drop it rather than render the
 * course name twice.
 */
function withoutLeadingTitle(markdown: string) {
  return markdown.replace(/^\s*#\s+.*(\r?\n)+/, "");
}

export function Outline({ markdown }: { markdown: string }) {
  return (
    <div className="space-y-4 leading-relaxed">
      <Markdown>{withoutLeadingTitle(markdown)}</Markdown>
    </div>
  );
}
