import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { coursesOrigin } from "@/lib/config/origins";
import { PreviewManifestError, courseFromManifest, parseManifest, type CourseManifest } from "./manifest";
import type { CourseDetail } from "@/lib/api";

/**
 * Reading the course package off disk, for `npm run preview`.
 *
 * Server-only: this imports `node:fs`. Preview is the one part of the shell that
 * reads a course from the filesystem rather than from the API — which is the whole
 * point of it, since an author has a folder and no deployment.
 *
 * `BUD_PREVIEW_DIR` is both the switch and the argument. Unset, every `/preview`
 * route 404s, so a normal `next dev` and every deployed build carry no preview
 * surface at all rather than one guarded by a flag at request time.
 */
export const previewDir = () => process.env.BUD_PREVIEW_DIR?.trim() || null;

export type PreviewCourse = {
  manifest: CourseManifest;
  course: CourseDetail;
};

/**
 * Re-read on every request, deliberately.
 *
 * An author edits a worksheet, their outline, or the manifest and reloads; caching
 * the parse would show them the package as it was when the server started, which is
 * the one behaviour a preview must not have. Course packages are small and this is a
 * local dev server, so the read costs nothing worth saving.
 */
export async function readPreviewCourse(dir: string, now: string): Promise<PreviewCourse> {
  let raw: string;
  try {
    raw = await readFile(join(dir, "bud.manifest.json"), "utf8");
  } catch {
    throw new PreviewManifestError(
      `No bud.manifest.json in ${dir}. Point preview at the folder that contains it.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new PreviewManifestError(
      `bud.manifest.json is not valid JSON: ${(cause as Error).message}`,
    );
  }

  const manifest = parseManifest(parsed);

  /**
   * A missing outline is a warning in the validator, not an error, so preview renders
   * the course without one rather than refusing — the author is most likely looking
   * at a package they are part-way through writing.
   */
  const outlineMarkdown = manifest.outline
    ? await readFile(join(dir, manifest.outline), "utf8").catch(() => null)
    : null;

  return {
    manifest,
    course: courseFromManifest({
      manifest,
      outlineMarkdown,
      coursesOrigin: coursesOrigin(),
      now,
    }),
  };
}
