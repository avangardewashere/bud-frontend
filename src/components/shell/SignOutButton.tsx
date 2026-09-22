"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { abandonCourseStateWrites } from "@/components/player/useCourseBridge";
import { Button } from "@/components/ui/Button";
import { budApi } from "@/lib/api";

/**
 * Signing out is a browser call, not a server action: the session cookie is httpOnly,
 * and only the browser can present it and take the Set-Cookie that clears it (through
 * the shell's /api rewrite, so it lands on the app's own host). After that,
 * `refresh()` re-runs the server components so the shell's own view of the session
 * catches up.
 */
export function SignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    // Course-state writes still queued or waiting to be re-sent must not go out later
    // under whoever signs in next.
    abandonCourseStateWrites();
    try {
      await budApi.logout();
    } finally {
      setBusy(false);
      startTransition(() => {
        router.replace("/login");
        router.refresh();
      });
    }
  }

  return (
    <Button
      variant="ghost"
      onClick={signOut}
      disabled={busy || pending}
      className="text-sm"
    >
      Sign out
    </Button>
  );
}
