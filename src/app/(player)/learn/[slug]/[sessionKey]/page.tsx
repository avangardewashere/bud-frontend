import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CoursePlayer } from "@/components/player/CoursePlayer";
import { BudApiError, budApi, type CourseDetail } from "@/lib/api";
import { serverAuth } from "@/lib/api/session";
import { coursesOrigin } from "@/lib/config/origins";

type Params = { params: Promise<{ slug: string; sessionKey: string }> };

const COURSES_ORIGIN = coursesOrigin();

async function load(slug: string): Promise<CourseDetail> {
  try {
    return await budApi.getCourse(slug, await serverAuth());
  } catch (error) {
    if (error instanceof BudApiError && error.statusCode === 404) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, sessionKey } = await params;
  try {
    const course = await load(slug);
    const session = course.sessions.find((s) => s.key === sessionKey);
    return { title: session ? `${session.title} — Bud` : `${course.title} — Bud` };
  } catch {
    return { title: "Bud" };
  }
}

export default async function LearnPage({ params }: Params) {
  const { slug, sessionKey } = await params;

  /**
   * The note comes with the page rather than on opening the panel: it decides whether
   * the Notes button shows its dot, and a learner who opens the panel should find
   * their note in it, not a spinner. Fetched alongside the course, not after it — two
   * waits in a row is one too many when the API is waking up. A failure here is not
   * worth losing the player over (not enrolled, or the note endpoint having a bad
   * day): the panel opens empty and saving still works.
   */
  const [course, note] = await Promise.all([
    load(slug),
    budApi
      .getNote(slug, sessionKey, await serverAuth())
      .catch(() => null),
  ]);

  const session = course.sessions.find((s) => s.key === sessionKey);
  if (!session) notFound();

  // Every state and progress route answers 403 not_enrolled, so there is nothing
  // for the player to do here. Send them to the course, where they can enrol.
  if (!course.enrollment) redirect(`/courses/${slug}`);

  /**
   * Course content lives on its own origin, addressed by course and version, and is
   * immutable per version. entryPath is a path inside the package rather than a URL,
   * so the shell composes it — the course never supplies its own src.
   */
  const src = `${COURSES_ORIGIN}/${encodeURIComponent(slug)}/${encodeURIComponent(
    course.version,
  )}/${session.entryPath.split("/").map(encodeURIComponent).join("/")}`;

  return (
    <CoursePlayer
      course={course}
      session={session}
      src={src}
      note={{ bodyMd: note?.bodyMd ?? "", updatedAt: note?.updatedAt ?? null }}
    />
  );
}
