import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { previewDir } from "@/lib/preview/load";

export const metadata: Metadata = { title: "Preview — Bud" };

/**
 * `npm run preview` — an author's own course package, in the real shell.
 *
 * Outside `(app)` on purpose: that group's layout redirects anyone without a session,
 * and preview has no API, no account and no cookie. It is the one part of the shell
 * that renders a course from a folder on disk.
 *
 * The whole group 404s unless `BUD_PREVIEW_DIR` is set, which the preview script sets
 * and nothing else does. So a normal `next dev` and every deployed build carry no
 * preview surface at all — not a route guarded by a flag, but no route.
 */
export default async function PreviewLayout({ children }: { children: React.ReactNode }) {
  if (!previewDir()) notFound();
  return children;
}
