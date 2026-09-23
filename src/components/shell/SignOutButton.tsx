"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { abandonCourseWrites, courseWrites } from "@/components/player/stateWrites";
import { forgetTabMemory } from "@/components/player/tabMemory";
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
    /**
     * Work this tab holds and the API has not taken — a note written while the server
     * was asleep, waiting to be sent again — is dropped by signing out, because it
     * must not go out later under whoever signs in next. The player promises that
     * work will save when Bud is back, so this is the one moment that promise is
     * broken, and it should be broken out loud rather than quietly.
     */
    if (courseWrites.hasUnsaved()) {
      const goOn = window.confirm(
        "Something you wrote hasn't reached Bud yet — it will be lost if you sign out now. Sign out anyway?",
      );
      if (!goOn) return;
    }

    setBusy(true);
    abandonCourseWrites();
    // And what the panels remember on their own — a note, a link typed but not handed
    // in — goes with it. It belongs to whoever is signing out, not to the next person
    // to use this browser.
    forgetTabMemory();
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
