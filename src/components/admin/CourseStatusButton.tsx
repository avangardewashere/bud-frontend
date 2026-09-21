"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { BudApiError, budApi, type AdminCourse } from "@/lib/api";

/**
 * Publish and unpublish from the admin table — mockup 1h.
 *
 * Unpublishing is not destructive: enrolments and progress stay, the course simply
 * stops being listed. The label says "Unpublish" rather than anything warning-shaped
 * for that reason.
 */
export function CourseStatusButton({ course }: { course: AdminCourse }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const published = course.status === "published";
  const publishable = course.currentVersion !== null;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await budApi.setCourseStatus(course.id, published ? "draft" : "published");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof BudApiError ? cause.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant={published ? "secondary" : "primary"}
        onClick={toggle}
        disabled={busy || !publishable}
        title={publishable ? undefined : "This course has no version to publish yet"}
        className="text-sm"
      >
        {published ? "Unpublish" : "Publish"}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-[var(--danger)]">
          {error}
        </span>
      )}
    </div>
  );
}
