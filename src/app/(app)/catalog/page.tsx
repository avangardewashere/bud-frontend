import type { Metadata } from "next";
import { Bud } from "@/components/bud";
import { CourseCard } from "@/components/course/CourseCard";
import { budApi } from "@/lib/api";
import { serverAuth } from "@/lib/api/session";

export const metadata: Metadata = { title: "Catalog — Bud" };

/**
 * The catalog — mockup 1e.
 *
 * The filter pills in the mockup are left out for now: with one published course
 * they would be decoration, and doing them properly means deciding whether filtering
 * is a query parameter the API handles or client-side. That decision belongs with
 * the second course.
 */
export default async function CatalogPage() {
  const { courses } = await budApi.listCourses(await serverAuth());

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-4xl">Catalog</h1>
      <p className="mt-2 text-[var(--muted-foreground)]">
        {courses.length === 1 ? "1 course published" : `${courses.length} courses published`}
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {courses.map((course) => (
          <CourseCard key={course.slug} course={course} />
        ))}

        {/* The mockup's dashed slot: "Only one course so far." */}
        <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--border)] p-10 text-center">
          <Bud pose="seed" size={84} label={null} />
          <p className="mt-4 text-sm text-[var(--muted-foreground)]">
            {courses.length === 0
              ? "No courses published yet."
              : "That's everything so far. Admins can upload a course."}
          </p>
        </div>
      </div>
    </main>
  );
}
