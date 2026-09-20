"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bud } from "@/components/bud";
import { StatusDot } from "@/components/course/meta";
import { Button } from "@/components/ui/Button";
import { BudApiError, budApi, type CourseDetail, type CourseSession } from "@/lib/api";
import { SavedIndicator } from "./SavedIndicator";
import { useCourseBridge } from "./useCourseBridge";

/**
 * The course player — Design-Mockups.md 1g, and 1m on phones.
 *
 * Three zones: a 56px top bar, a 280px session rail, and the course itself in a
 * sandboxed frame on another origin. The frame is deliberately quiet — Paper, a 1px
 * border, 12px radius, no shadow — so the course reads as a page you opened rather
 * than a widget embedded in someone else's furniture (Design.md §9).
 */
export function CoursePlayer({
  course,
  session,
  src,
}: {
  course: CourseDetail;
  session: CourseSession;
  src: string;
}) {
  const router = useRouter();
  const [focus, setFocus] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [marking, setMarking] = useState(false);

  const { frameRef, save, loaded, slow, onFrameLoad } = useCourseBridge({
    slug: course.slug,
    sessionKey: session.key,
    src,
    onProgressChanged: () => router.refresh(),
  });

  /**
   * Tell the API this session was opened, which is what "resume where you left off"
   * reads back. Fire and forget: it is a convenience, and failing it must never stop
   * someone working. Runs on the session, not on every refresh.
   */
  useEffect(() => {
    budApi.openSession(course.slug, session.key).catch(() => {});
  }, [course.slug, session.key]);

  const ordered = [...course.sessions].sort((a, b) => a.order - b.order);
  const index = ordered.findIndex((s) => s.key === session.key);
  const previous = index > 0 ? ordered[index - 1] : null;
  const next = index < ordered.length - 1 ? ordered[index + 1] : null;
  const done = ordered.filter((s) => s.status === "complete").length;
  const percent = Math.round((done / ordered.length) * 100);
  const complete = session.status === "complete";

  async function toggleComplete() {
    setMarking(true);
    try {
      if (complete) await budApi.uncompleteSession(course.slug, session.key);
      else await budApi.completeSession(course.slug, session.key);
      router.refresh();
    } catch (error) {
      if (!(error instanceof BudApiError)) throw error;
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4">
        <Link
          href={`/courses/${course.slug}`}
          aria-label="Back to the course"
          className="rounded px-1 text-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          ‹
        </Link>

        <Bud size={24} label={null} className="hidden sm:block" />

        <div className="min-w-0 flex-1">
          <span className="hidden truncate font-semibold sm:inline">{course.title}</span>
          <span className="ml-2 truncate text-sm text-[var(--muted-foreground)]">
            <span className="sm:hidden font-mono">S{session.order} · </span>
            <span className="hidden sm:inline">Session {session.order} · </span>
            {session.title}
          </span>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <SavedIndicator save={save} />
          <div
            className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--muted)]"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Course progress"
          >
            <div
              className="h-full rounded-full bg-[var(--color-leaf-500)]"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        <span className="font-mono text-sm text-[var(--muted-foreground)]">{percent}%</span>

        <Button
          variant="secondary"
          onClick={() => setFocus((f) => !f)}
          className="hidden text-sm md:inline-flex"
          aria-pressed={focus}
        >
          {focus ? "Show sessions" : "Focus"}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {!focus && (
          <nav className="hidden w-[280px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--card)] md:flex">
            <p className="px-4 py-3 font-mono text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
              Sessions
            </p>
            <ol className="min-h-0 flex-1 overflow-auto px-2">
              {ordered.map((s) => (
                <li key={s.key}>
                  <RailLink slug={course.slug} session={s} current={s.key === session.key} />
                </li>
              ))}
            </ol>
            <div className="flex gap-2 border-t border-[var(--border)] p-3">
              <PrevNext slug={course.slug} previous={previous} next={next} />
            </div>
          </nav>
        )}

        <main className="flex min-h-0 flex-1 flex-col gap-3 p-4">
          <div className="relative min-h-0 flex-1">
            {!loaded && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)]">
                <Bud size={56} label={null} />
                <p className="text-sm text-[var(--muted-foreground)]">
                  {slow
                    ? "This session is taking a while. It may be waiting on something it loads from the web."
                    : "Opening the session…"}
                </p>
              </div>
            )}
            <iframe
              ref={frameRef}
              onLoad={onFrameLoad}
              title={`${course.title} — ${session.title}`}
              /* src is set by the bridge hook, once it is listening. Without
                 allow-same-origin the frame gets an opaque origin and cannot reach
                 the shell's cookies, storage or DOM. allow-modals because every
                 worksheet confirm()s before clearing; clipboard-write for its copy
                 and export buttons. */
              sandbox="allow-scripts allow-forms allow-popups allow-modals"
              allow="clipboard-write"
              className="size-full rounded-[var(--radius-card)] border border-[var(--border)] bg-white"
            />
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--muted-foreground)]">
              The course suggests completion; Bud records it.
            </p>
            <div className="flex items-center gap-3 md:hidden">
              <SavedIndicator save={save} />
            </div>
            <Button variant="secondary" onClick={toggleComplete} disabled={marking}>
              {complete ? "Mark not complete" : "Mark complete"}
            </Button>
          </div>
        </main>
      </div>

      {/* Phones get the rail as a bottom sheet — mockup 1m. */}
      <div className="border-t border-[var(--border)] bg-[var(--card)] md:hidden">
        <button
          type="button"
          onClick={() => setRailOpen((o) => !o)}
          aria-expanded={railOpen}
          className="flex w-full items-center justify-between px-4 py-3"
        >
          <span className="font-mono text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
            Sessions · {done} / {ordered.length}
          </span>
          <SavedIndicator save={save} />
        </button>

        {railOpen && (
          <>
            <ol className="max-h-64 overflow-auto px-2 pb-2">
              {ordered.map((s) => (
                <li key={s.key}>
                  <RailLink slug={course.slug} session={s} current={s.key === session.key} />
                </li>
              ))}
            </ol>
            <div className="flex gap-2 border-t border-[var(--border)] p-3">
              <PrevNext slug={course.slug} previous={previous} next={next} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RailLink({
  slug,
  session,
  current,
}: {
  slug: string;
  session: CourseSession;
  current: boolean;
}) {
  return (
    <Link
      href={`/learn/${slug}/${session.key}`}
      aria-current={current ? "page" : undefined}
      className={
        "flex items-start gap-2.5 rounded-[10px] px-2 py-2 text-sm " +
        (current ? "bg-[var(--tint)]" : "hover:bg-[var(--muted)]")
      }
    >
      <span className="mt-1.5">
        <StatusDot status={session.status} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block">{session.title}</span>
        <span className="font-mono text-xs text-[var(--muted-foreground)]">
          {String(session.order).padStart(2, "0")}
          {session.weight ? ` · ${session.weight}` : ""}
        </span>
      </span>
    </Link>
  );
}

function PrevNext({
  slug,
  previous,
  next,
}: {
  slug: string;
  previous: CourseSession | null;
  next: CourseSession | null;
}) {
  return (
    <>
      {previous ? (
        <Link
          href={`/learn/${slug}/${previous.key}`}
          className="flex-1 rounded-[10px] border border-[var(--border)] px-3 py-2 text-center text-sm font-semibold hover:bg-[var(--muted)]"
        >
          ‹ Previous
        </Link>
      ) : (
        <span className="flex-1" />
      )}
      {next && (
        <Link
          href={`/learn/${slug}/${next.key}`}
          className="flex-1 rounded-[10px] bg-[var(--primary)] px-3 py-2 text-center text-sm font-semibold text-[var(--primary-foreground)]"
        >
          Next ›
        </Link>
      )}
    </>
  );
}
