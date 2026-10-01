import { budApi } from "@/lib/api";

/**
 * The five things the bridge host does that need somewhere to put a learner's work.
 *
 * Deliberately typed *from* `budApi` rather than described independently: the whole
 * value of this extraction is that it cannot change behaviour, and `Pick` of the real
 * client makes that a type-level fact instead of a claim. A signature that drifts
 * stops compiling here rather than diverging quietly.
 *
 * Why it exists at all: `npm run preview` mounts the real `CoursePlayer`, the real
 * `useCourseBridge` and the real `public/bridge.js` against a course folder on disk,
 * with no API, no account and no cookie. The alternative was a second bridge host —
 * which is the drift this project refused, and which would have put a reimplementation
 * of the message loop next to the one holding the learner boundary.
 *
 * **The rule this must keep.** `handle()` and `onHello` call `store.*` and never ask
 * which store they have. There is no `if (preview)` anywhere inside the bridge, and
 * there must never be: a preview-shaped branch inside the one host that holds a
 * learner's saved work is worse than having no preview at all.
 */
export type CourseStore = Pick<
  typeof budApi,
    | "getState"
  | "putState"
  | "deleteState"
  | "completeSession"
  | "uncompleteSession"
  | "reportProgress"
  | "openSession"
>;

/** What the player uses. The default, and the only one a learner ever meets. */
export const apiCourseStore: CourseStore = budApi;

/**
 * Preview's store: the author's own machine, for as long as the tab is open.
 *
 * Nothing is persisted, and that is the honest behaviour rather than a shortcut —
 * an author previewing wants to see their worksheet save and reload within the
 * session, not accumulate state in a folder they will later ship. The preview page
 * says so in as many words.
 *
 * It must behave like the API in the ways the bridge depends on: a key that was never
 * written reads as `{ value: null }` rather than throwing, because the host treats a
 * failed *read* as "the course started blank, refuse to let it overwrite" — and a
 * brand-new worksheet in preview would otherwise be unable to save anything at all.
 */
export function memoryCourseStore(): CourseStore {
  const state = new Map<string, string>();
  const at = (slug: string, key: string) => `${slug}\u0000${key}`;

  return {
    async getState(slug, key) {
      return { value: state.get(at(slug, key)) ?? null };
    },
    async putState(slug, key, value) {
      state.set(at(slug, key), value);
    },
    async deleteState(slug, key) {
      state.delete(at(slug, key));
    },
    async completeSession(slug, sessionKey) {
      // The course suggests, and in preview nothing records it. Shaped like the API's
      // answer so the worksheet's own "marked complete" path runs exactly as it will.
      return {
        sessionKey,
        status: "complete" as const,
        fraction: 1,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      } as Awaited<ReturnType<typeof budApi.completeSession>>;
    },
    /** Mark complete is a button in the player, and it must work in preview too. */
    async uncompleteSession(slug, sessionKey) {
      return {
        sessionKey,
        status: "not_started" as const,
        fraction: 0,
        startedAt: new Date().toISOString(),
        completedAt: null,
      } as Awaited<ReturnType<typeof budApi.uncompleteSession>>;
    },
    /**
     * "Resume where you left off" is a property of an account, and preview has none.
     * A no-op rather than an omission: the player records an open on mount, and
     * leaving it to hit a real API produced a 401 in the author's console on every
     * session they looked at.
     */
    async openSession(slug, sessionKey) {
      return {
        sessionKey,
        status: "in_progress" as const,
        fraction: 0,
        startedAt: new Date().toISOString(),
        completedAt: null,
      } as Awaited<ReturnType<typeof budApi.openSession>>;
    },
    async reportProgress(slug, sessionKey, fraction) {
      return {
        sessionKey,
        status: "in_progress" as const,
        fraction,
        startedAt: new Date().toISOString(),
        completedAt: null,
      } as Awaited<ReturnType<typeof budApi.reportProgress>>;
    },
  };
}
