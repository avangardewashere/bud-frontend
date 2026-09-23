import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Markdown, rendered the one way Bud renders it: course outlines and a learner's own
 * notes look the same, because they are the same kind of thing on the page.
 *
 * Styled here rather than with a typography plugin, because the mockup is specific:
 * Nunito headings, inline code as bordered mono chips, and tables from GFM (the
 * Docker outline uses one for its session structure).
 *
 * **Raw HTML is never rendered.** react-markdown only renders it when `rehype-raw` is
 * added, and it is not added here — so `<img src=x onerror=…>` in a course package or
 * in a note stays the text someone typed. That matters for both sources: course
 * content is author-controlled, and a note is whatever a learner pasted into it.
 *
 * Links open in a new tab, and always with `rel="noreferrer noopener"` so the opened
 * page gets no handle on this one.
 *
 * Wrapped in a box that breaks anywhere: a note or an outline can contain an
 * unbroken 200-character token (a URL, a container id), and without this it sets the
 * width of whatever holds it — pushing the notes drawer's own controls off screen.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <ReactMarkdown
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
              <table className="w-full border-collapse text-sm">
                {children}
              </table>
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
        {children}
      </ReactMarkdown>
    </div>
  );
}
