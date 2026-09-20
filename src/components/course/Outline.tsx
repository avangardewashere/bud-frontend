import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * The course outline, rendered from the manifest's Markdown — mockup 1f's left column.
 *
 * Styled here rather than with a typography plugin, because the mockup is specific:
 * Nunito headings, inline code as bordered mono chips, and tables from GFM (the
 * Docker outline uses one for its session structure).
 *
 * The Markdown comes from a course package, which is author-controlled content.
 * react-markdown does not render raw HTML unless rehype-raw is added, and it is not,
 * so a course cannot inject markup into the shell this way.
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
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h2 className="mt-8 text-2xl">{children}</h2>,
          h2: ({ children }) => <h2 className="mt-8 text-xl">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-6 text-lg">{children}</h3>,
          p: ({ children }) => <p className="mt-3">{children}</p>,
          ul: ({ children }) => (
            <ul className="mt-3 list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mt-3 list-decimal space-y-1 pl-5">{children}</ol>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              className="text-[var(--tint-foreground)] underline"
              rel="noreferrer noopener"
              target="_blank"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded border border-[var(--border)] bg-[var(--muted)] px-1.5 py-0.5 font-mono text-[0.85em]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="mt-3 overflow-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--muted)] p-4 font-mono text-xs">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="mt-4 overflow-auto">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-[var(--border)] px-3 py-2 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-[var(--border)] px-3 py-2 align-top">
              {children}
            </td>
          ),
          hr: () => <hr className="my-8 border-[var(--border)]" />,
          blockquote: ({ children }) => (
            <blockquote className="mt-3 border-l-2 border-[var(--color-leaf-500)] pl-4 text-[var(--muted-foreground)]">
              {children}
            </blockquote>
          ),
        }}
      >
        {withoutLeadingTitle(markdown)}
      </Markdown>
    </div>
  );
}
