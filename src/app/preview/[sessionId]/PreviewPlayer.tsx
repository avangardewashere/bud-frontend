"use client";

import { useMemo } from "react";
import { CoursePlayer } from "@/components/player/CoursePlayer";
import { memoryCourseStore } from "@/components/player/courseStore";
import type { CourseDetail, CourseSession } from "@/lib/api";

/**
 * The real player, with the author's own machine standing in for the API.
 *
 * This wrapper exists for one reason: a store is an object with methods, and a server
 * component cannot send one across the boundary. So the store is built here, on the
 * client, and handed to the same `CoursePlayer` a learner gets.
 *
 * What is real: the player, `useCourseBridge`, `public/bridge.js` served from the app
 * origin, the course document on its own origin under the real `/{id}/{version}/`
 * path, and the real CSP with its `sandbox` directive. The only substitution is where
 * the worksheet's saved work goes — and that is an argument to the hook, not a branch
 * inside it.
 */
export function PreviewPlayer({
  course,
  session,
  src,
}: {
  course: CourseDetail;
  session: CourseSession;
  src: string;
}) {
  // One store for the life of the page: a new one per render would lose the
  // worksheet's state on every keystroke that re-rendered the player.
  const store = useMemo(() => memoryCourseStore(), []);

  return (
    <CoursePlayer
      course={course}
      session={session}
      src={src}
      store={store}
      // No account here, so no notes and nothing to hand in. The course page says so.
      learnerTools={false}
      note={{ bodyMd: "", updatedAt: null }}
      deliverable={null}
    />
  );
}
