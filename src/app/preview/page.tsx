import Link from "next/link";
import { GrowthMeter } from "@/components/bud";
import { CourseCover } from "@/components/bud/CourseCover";
import { Outline } from "@/components/course/Outline";
import { SessionList } from "@/components/course/SessionList";
import { TagList, VersionPill } from "@/components/course/meta";
import { PreviewManifestError } from "@/lib/preview/manifest";
import { previewDir, readPreviewCourse } from "@/lib/preview/load";

/**
 * The course page an author is writing, rendered by the components that will render
 * it for a learner — `Outline`, `SessionList`, `TagList`, `VersionPill`,
 * `GrowthMeter`, `CourseCover`.
 *
 * That reuse is the entire reason preview lives in this repo rather than in the
 * authoring CLI. Three of the four things authors asked to see are questions about
 * how *this* page renders their Markdown: whether a table survives, what happens to a
 * second `# Heading`, whether raw HTML is shown or escaped. A preview that answered
 * them with its own renderer would be answering about itself.
 */
export const dynamic = "force-dynamic";

export default async function PreviewCoursePage() {
  const dir = previewDir()!;
  let loaded;
  try {
    loaded = await readPreviewCourse(dir, new Date().toISOString());
  } catch (error) {
    if (error instanceof PreviewManifestError) return <Unreadable message={error.message} />;
    throw error;
  }

  const { course } = loaded;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <PreviewBanner dir={dir} />

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <TagList tags={course.tags} />
            <VersionPill version={course.version} />
          </div>

          <h1 className="mt-3 text-4xl">{course.title}</h1>
          {course.summary && (
            <p className="mt-3 max-w-prose text-lg text-[var(--muted-foreground)]">
              {course.summary}
            </p>
          )}

          {course.outlineMarkdown ? (
            <div className="mt-8">
              <Outline markdown={course.outlineMarkdown} />
            </div>
          ) : (
            <p className="mt-8 text-[var(--muted-foreground)]">
              This package ships no outline — the learner&rsquo;s course page will say so too.
            </p>
          )}
        </div>

        <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto lg:pb-1">
          <div className="overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--card)]">
            {/* The cover exactly as the catalog draws it, including the fallback. */}
            <CourseCover
              title={course.title}
              accent={course.accentColor ?? undefined}
              src={course.coverUrl ?? undefined}
            />
            <div className="p-5">
              <div className="flex items-center gap-4">
                <GrowthMeter completed={0} total={course.sessionCount} size="regular" label={null} />
                <div>
                  <p className="font-mono text-2xl text-[var(--tint-foreground)]">
                    {course.sessionCount}
                  </p>
                  <p className="font-mono text-xs text-[var(--muted-foreground)]">
                    {course.sessionCount === 1 ? "session" : "sessions"}
                    {course.estimatedHours ? ` · ${course.estimatedHours}h` : ""}
                  </p>
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)]">
                <SessionList
                  sessions={course.sessions}
                  hrefFor={(session) => `/preview/${encodeURIComponent(session.key)}`}
                />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

/**
 * Said once, at the top, and never dressed up as part of the product. An author needs
 * to know which folder they are looking at — the commonest confusion when previewing
 * is previewing the wrong copy.
 */
function PreviewBanner({ dir }: { dir: string }) {
  return (
    <p className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--muted)] px-4 py-2.5 text-sm text-[var(--muted-foreground)]">
      <strong className="font-semibold text-[var(--foreground)]">Preview.</strong> Reading{" "}
      <code className="font-mono text-xs">{dir}</code> — re-read on every reload. Progress,
      notes and hand-ins are not saved anywhere.
    </p>
  );
}

/** The manifest could not be read. Say which field, and stop. */
function Unreadable({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl">This package can&rsquo;t be previewed yet</h1>
      <p role="alert" className="mt-4 text-[var(--danger)]">
        {message}
      </p>
      <p className="mt-6 text-sm text-[var(--muted-foreground)]">
        Preview only reads what it needs to render. Whether the package would publish is a
        different question, and <code className="font-mono text-xs">bud-course validate</code> is
        the only thing that answers it.
      </p>
      <Link href="/preview" className="mt-6 inline-block text-[var(--tint-foreground)] hover:underline">
        Try again
      </Link>
    </main>
  );
}
