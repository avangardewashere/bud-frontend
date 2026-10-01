import { notFound } from "next/navigation";
import { coursesOrigin } from "@/lib/config/origins";
import { courseFileUrl } from "@/lib/preview/manifest";
import { previewDir, readPreviewCourse } from "@/lib/preview/load";
import { PreviewPlayer } from "./PreviewPlayer";

type Params = { params: Promise<{ sessionId: string }> };

export const dynamic = "force-dynamic";

/**
 * One session of the author's package, in the real player.
 *
 * The `src` is composed exactly as `/learn/[slug]/[sessionKey]` composes it — a path
 * inside the package, turned into a URL on the courses origin by the shell. The course
 * never supplies its own `src`, in preview any more than in production.
 */
export default async function PreviewSessionPage({ params }: Params) {
  const { sessionId } = await params;
  const dir = previewDir()!;

  const { manifest, course } = await readPreviewCourse(dir, new Date().toISOString());
  const session = course.sessions.find((s) => s.key === sessionId);
  if (!session) notFound();

  return (
    <PreviewPlayer
      course={course}
      session={session}
      src={courseFileUrl(coursesOrigin(), manifest, session.entryPath)}
    />
  );
}
