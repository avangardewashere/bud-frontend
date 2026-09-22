"use client";

import { ServerRecovery } from "@/components/shell/ServerRecovery";
import "./globals.css";

/**
 * The root layout itself failed, so this replaces it and must bring its own document
 * and styles. The fonts are not loaded here — the system fallbacks in the font stack
 * are fine for a page whose only job is to explain and recover.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <title>Bud</title>
        <ServerRecovery retry={retry} digest={error.digest} />
      </body>
    </html>
  );
}
