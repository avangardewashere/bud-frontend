import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GrowthMeter } from "@/components/bud";
import { EnrollButton } from "@/components/course/EnrollButton";
import { Outline } from "@/components/course/Outline";
import { SessionList } from "@/components/course/SessionList";
import { TagList, VersionPill } from "@/components/course/meta";
import { ButtonLink } from "@/components/ui/Button";
import { BudApiError, budApi, type CourseDetail } from "@/lib/api";
import { serverAuth } from "@/lib/api/session";

type Params = { params: Promise<{ slug: string }> };

async function load(slug: string): Promise<CourseDetail> {
  try {
    return await budApi.getCourse(slug, await serverAuth());
  } catch (error) {
    if (error instanceof BudApiError && error.statusCode === 404) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  try {
    const course = await load(slug);
    return { title: `${course.title} — Bud`, description: course.summary };
  } catch {
    return { title: "Course — Bud" };
  }
}

/**
 * Course detail — mockup 1f. Outline Markdown on the left, a sticky panel on the
 * right with the meter, the plain numbers, the session list and Unenroll.
 */
export default async function CoursePage({ params }: Params) {
  const { slug } = await params;
  const course = await load(slug);
  const progress = course.enrollment;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <Link href="/catalog" className="text-sm text-[var(--tint-foreground)] hover:underline">
        ← Catalog
      </Link>

      <div className="mt-4 grid gap-10 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <TagList tags={course.tags} />
            <VersionPill version={course.version} />
          </div>

          <h1 className="mt-3 text-4xl">{course.title}</h1>
          <p className="mt-3 max-w-prose text-lg text-[var(--muted-foreground)]">
            {course.summary}
          </p>

          {course.outlineMarkdown ? (
            <div className="mt-8">
              <Outline markdown={course.outlineMarkdown} />
            </div>
          ) : (
            <p className="mt-8 text-[var(--muted-foreground)]">
              This course package ships no outline.
            </p>
          )}
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="flex items-center gap-4">
              <GrowthMeter
                completed={progress?.completedSessions ?? 0}
                total={course.sessionCount}
                size="regular"
                label={null}
              />
              <div>
                <p className="font-mono text-2xl text-[var(--tint-foreground)]">
                  {progress?.completedSessions ?? 0} / {course.sessionCount}
                </p>
                <p className="font-mono text-xs text-[var(--muted-foreground)]">
                  sessions{progress ? ` · ${progress.percent}%` : ""}
                </p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {remaining(course, progress?.percent ?? 0)}
                </p>
              </div>
            </div>

            <div className="mt-5">
              {progress ? (
                <ButtonLink
                  href={`/learn/${course.slug}/${resumeKey(course)}`}
                  className="w-full"
                >
                  {progress.lastSessionKey ? "Continue" : "Start"} · Session{" "}
                  {nextSession(course)}
                </ButtonLink>
              ) : (
                <EnrollButton slug={course.slug} enrolled={false} />
              )}
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--card)]">
            <h2 className="border-b border-[var(--border)] px-3 py-2.5 font-mono text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
              Sessions
            </h2>
            <SessionList sessions={course.sessions} />
          </div>

          {progress && (
            <div className="mt-4 flex justify-center">
              <EnrollButton slug={course.slug} enrolled />
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

/** "about 27h remaining" — omitted when the manifest gives no estimate. */
function remaining(course: CourseDetail, percent: number) {
  if (course.estimatedHours == null) return `${course.sessionCount} sessions`;
  const left = Math.round(course.estimatedHours * (1 - percent / 100));
  return percent === 0 ? `about ${left}h` : `about ${left}h remaining`;
}

/** The first session that is not finished, which is where Continue should land. */
function nextSession(course: CourseDetail) {
  return unfinished(course)?.order ?? course.sessionCount;
}

/**
 * Where Continue goes: the session they last opened if they have not finished it,
 * otherwise the first unfinished one, otherwise the last — so a finished course
 * reopens somewhere sensible rather than nowhere.
 */
function resumeKey(course: CourseDetail) {
  const last = course.enrollment?.lastSessionKey;
  const lastSession = course.sessions.find((s) => s.key === last);
  if (lastSession && lastSession.status !== "complete") return lastSession.key;
  return (unfinished(course) ?? course.sessions.at(-1))?.key ?? "";
}

function unfinished(course: CourseDetail) {
  return [...course.sessions]
    .sort((a, b) => a.order - b.order)
    .find((s) => s.status !== "complete");
}
