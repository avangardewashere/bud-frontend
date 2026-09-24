import Link from "next/link";
import { CourseCover, GrowthMeter } from "@/components/bud";
import { ButtonLink } from "@/components/ui/Button";
import type { CourseSummary } from "@/lib/api";
import { LevelPill, TagList } from "./meta";

/**
 * The catalog card — mockup 1e.
 *
 * Cover with the level pill overlaid, title, two-line summary, mono tags, a hairline,
 * then the compact meter with the plain numbers and a Start or Continue button.
 */
export function CourseCard({ course }: { course: CourseSummary }) {
  const progress = course.enrollment;
  const href = `/courses/${course.slug}`;

  return (
    <article className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)]">
      <Link href={href} className="relative block aspect-[16/9]" tabIndex={-1} aria-hidden>
        <CourseCover
          title={course.title}
          accent={course.accentColor ?? undefined}
          src={course.coverUrl}
        />
        {course.level && (
          <span className="absolute left-3 top-3">
            <LevelPill level={course.level} />
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-lg">
          <Link href={href} className="hover:underline">
            {course.title}
          </Link>
        </h3>
        <p className="mt-1 line-clamp-2 text-sm text-[var(--muted-foreground)]">
          {course.summary}
        </p>

        <TagList tags={course.tags} className="mt-3" />

        <div className="mt-4 flex items-end justify-between gap-4 border-t border-[var(--border)] pt-4">
          <div className="flex items-center gap-3">
            <GrowthMeter
              completed={progress?.completedSessions ?? 0}
              total={course.sessionCount}
              size="compact"
              label={null}
            />
            <div className="font-mono text-xs text-[var(--muted-foreground)]">
              {progress && (
                <div className="text-[var(--tint-foreground)]">
                  {progress.completedSessions} / {progress.totalSessions} · {progress.percent}%
                </div>
              )}
              <div>
                {course.sessionCount} sessions
                {course.estimatedHours != null && ` · ${course.estimatedHours}h`}
              </div>
            </div>
          </div>

          <ButtonLink href={href}>{progress ? "Continue" : "Start"}</ButtonLink>
        </div>
      </div>
    </article>
  );
}
