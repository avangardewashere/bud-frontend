"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { BudApiError, BudApiUnreachableError, budApi } from "@/lib/api";

/**
 * Enroll and unenroll. Both run in the browser so the session cookie goes with them,
 * then refresh() re-renders the server components against the new enrollment.
 */
export function EnrollButton({
  slug,
  enrolled,
}: {
  slug: string;
  enrolled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (enrolled) await budApi.unenroll(slug);
      else await budApi.enroll(slug);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof BudApiUnreachableError
          ? "Couldn't reach Bud just now."
          : cause instanceof BudApiError
            ? cause.message
            : "That didn't work.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant={enrolled ? "ghost" : "primary"}
        onClick={toggle}
        disabled={busy}
        className={enrolled ? "mx-auto text-sm" : "w-full"}
      >
        {enrolled ? "Unenroll" : "Start this course"}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-center text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
    </>
  );
}
