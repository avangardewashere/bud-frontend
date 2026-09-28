"use client";

import { useState } from "react";
import { buttonClasses } from "@/components/ui/Button";

/**
 * "Download everything" — a link, with the two things a link alone doesn't give.
 *
 * It stays a link rather than becoming a fetch because the archive is built in one go:
 * on a sleeping server the first request waits for the cold start *and* the build, and
 * a fetch there would be something to time out and retry rather than simply a download
 * the browser is already showing progress for. The API names the file, and the request
 * is same-origin through the /api rewrite, so the session cookie goes with it.
 *
 * What the link needed:
 *
 * 1. **A new tab.** Anything that isn't a 200 — an expired session, a rate limit, the
 *    server having a bad minute — is a response the browser will *render*, and a
 *    same-tab navigation would replace the account screen with the API's raw JSON.
 *    In a throwaway tab the error is visible and the page behind it survives.
 * 2. **Something to say it started.** A download that takes a minute to begin looks
 *    like a button that did nothing, and the second and third press each build the
 *    whole archive again — straight into the API's rate limit.
 */
export function ExportLink({ href }: { href: string }) {
  const [pressed, setPressed] = useState(false);

  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noopener"
        onClick={() => setPressed(true)}
        className={buttonClasses("secondary", "mt-3")}
      >
        Download everything
      </a>
      {pressed && (
        <p role="status" className="mt-2 text-xs text-[var(--muted-foreground)]">
          Building your archive. On a sleeping server this takes about a minute — it
          downloads on its own when it&rsquo;s ready, so there&rsquo;s no need to press
          again.
        </p>
      )}
    </>
  );
}
