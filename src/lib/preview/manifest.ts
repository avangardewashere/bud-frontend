import type { CourseDetail } from "@/lib/api";

/**
 * A course package's manifest, as much of it as previewing needs.
 *
 * **This is not a validator, and must never become one.** The backend owns the
 * course-spec rules and publishes them as JSON Schema; a second implementation here
 * would drift, and an author would meet the difference at upload time — which is the
 * reason the shell has no client-side checker today (Planning/Roadmap-Status.md, the
 * course-spec validator decision). Preview reads a manifest in order to *show* it. If
 * a field it needs is missing or the wrong shape, it says which field and stops; it
 * does not judge whether the package would publish. `bud-course validate` answers
 * that, and it is the only thing that should.
 */
export type CourseManifest = {
  id: string;
  title: string;
  version: string;
  summary?: string;
  level?: string | null;
  estimatedHours?: number | null;
  tags?: string[];
  outline?: string | null;
  cover?: string | null;
  theme?: { accent?: string | null } | null;
  sessions: {
    id: string;
    order: number;
    title: string;
    entry: string;
    weight?: "light" | "medium" | "heavy" | null;
    deliverable?: string | null;
  }[];
};

/** Thrown with the field named, because the author is the person reading it. */
export class PreviewManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreviewManifestError";
  }
}

const str = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new PreviewManifestError(`bud.manifest.json: "${field}" must be a non-empty string.`);
  }
  return value;
};

/**
 * Enough structure to render, no more. Anything optional that is the wrong type is
 * dropped rather than refused — a bad `tags` should not stop an author seeing their
 * worksheet, and the validator will object to it anyway.
 */
export function parseManifest(raw: unknown): CourseManifest {
  if (typeof raw !== "object" || raw === null) {
    throw new PreviewManifestError("bud.manifest.json is not a JSON object.");
  }
  const m = raw as Record<string, unknown>;

  /**
   * The course's own three fields first. Checking sessions before these told an author
   * who had forgotten `id` about `sessions[0].id` — the wrong line of the wrong object.
   */
  const id = str(m.id, "id");
  const title = str(m.title, "title");
  const version = str(m.version, "version");

  if (!Array.isArray(m.sessions) || m.sessions.length === 0) {
    throw new PreviewManifestError('bud.manifest.json: "sessions" must be a non-empty array.');
  }

  const sessions = m.sessions.map((value, index) => {
    const s = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
    const where = `sessions[${index}]`;
    return {
      id: str(s.id, `${where}.id`),
      title: str(s.title, `${where}.title`),
      entry: str(s.entry, `${where}.entry`),
      order: typeof s.order === "number" ? s.order : index + 1,
      weight:
        s.weight === "light" || s.weight === "medium" || s.weight === "heavy"
          ? (s.weight as "light" | "medium" | "heavy")
          : null,
      deliverable: typeof s.deliverable === "string" ? s.deliverable : null,
    };
  });

  const theme = typeof m.theme === "object" && m.theme !== null ? (m.theme as { accent?: unknown }) : null;

  return {
    id,
    title,
    version,
    summary: typeof m.summary === "string" ? m.summary : "",
    level: typeof m.level === "string" ? m.level : null,
    estimatedHours: typeof m.estimatedHours === "number" ? m.estimatedHours : null,
    tags: Array.isArray(m.tags) ? m.tags.filter((t): t is string => typeof t === "string") : [],
    outline: typeof m.outline === "string" ? m.outline : null,
    cover: typeof m.cover === "string" ? m.cover : null,
    theme: theme && typeof theme.accent === "string" ? { accent: theme.accent } : null,
    sessions,
  };
}

/** A path inside the package, as a URL on the courses origin. */
export function courseFileUrl(coursesOrigin: string, manifest: CourseManifest, path: string) {
  const parts = path.split("/").map(encodeURIComponent).join("/");
  return `${coursesOrigin}/${encodeURIComponent(manifest.id)}/${encodeURIComponent(
    manifest.version,
  )}/${parts}`;
}

/**
 * A manifest, as the shape every screen in the shell already renders.
 *
 * Preview's whole argument is that the author sees the real page, so nothing here
 * invents a view model — it fills in `CourseDetail`, which the catalog, the course
 * page and the player already take. Two fields have no answer outside a deployment
 * and are stated rather than faked:
 *
 * - **`status` is always `not_started`.** Preview keeps no progress across restarts,
 *   and a session that claimed to be complete would be a lie about the author's own
 *   course rather than a convenience.
 * - **`enrollment` is synthetic, and must be non-null.** The player redirects anyone
 *   without one to the course page to enrol, which in preview is a dead end. Zero of
 *   N, started now.
 */
export function courseFromManifest({
  manifest,
  outlineMarkdown,
  coursesOrigin,
  now,
}: {
  manifest: CourseManifest;
  outlineMarkdown: string | null;
  coursesOrigin: string;
  /** Passed in rather than read, so the mapping is a pure function. */
  now: string;
}): CourseDetail {
  const sessions = [...manifest.sessions]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      key: s.id,
      order: s.order,
      title: s.title,
      weight: s.weight ?? null,
      deliverable: s.deliverable ?? null,
      entryPath: s.entry,
      status: "not_started" as const,
    }));

  return {
    slug: manifest.id,
    title: manifest.title,
    summary: manifest.summary ?? "",
    level: manifest.level ?? null,
    estimatedHours: manifest.estimatedHours ?? null,
    tags: manifest.tags ?? [],
    accentColor: manifest.theme?.accent ?? null,
    coverUrl: manifest.cover ? courseFileUrl(coursesOrigin, manifest, manifest.cover) : null,
    sessionCount: sessions.length,
    version: manifest.version,
    enrollment: {
      completedSessions: 0,
      totalSessions: sessions.length,
      percent: 0,
      lastSessionKey: sessions[0]?.key ?? null,
      lastOpenedAt: now,
      startedAt: now,
      completedAt: null,
    },
    outlineMarkdown,
    sessions,
  };
}
