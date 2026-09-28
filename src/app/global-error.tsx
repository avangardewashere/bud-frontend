"use client";

import { ServerRecovery } from "@/components/shell/ServerRecovery";
import { readStoredChoice } from "@/lib/theme-client";
import { colorScheme, themeAttribute } from "@/lib/theme";
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
  /**
   * This page brings its own <html>, so it also has to bring the theme. The root
   * layout reads the cookie on the server; here that is not available — this renders
   * when the layout itself has failed — so the cookie is read from the document when
   * there is one. Without it, someone who chose Light on a dark device would find the
   * one screen they land on when something breaks is the one screen that ignores them.
   */
  const chosen = typeof document === "undefined" ? "system" : readStoredChoice();

  return (
    <html
      lang="en"
      data-theme={themeAttribute(chosen)}
      style={{ colorScheme: colorScheme(chosen) }}
      className="h-full antialiased"
    >
      <body className="flex min-h-full flex-col">
        <title>Bud</title>
        <ServerRecovery retry={retry} digest={error.digest} />
      </body>
    </html>
  );
}
