"use client";

import { ServerRecovery } from "@/components/shell/ServerRecovery";

/**
 * Catches a failed render anywhere below the root layout — including the (app) and
 * (player) layouts, which ask the API who is signed in before anything else renders,
 * and so are where a sleeping API is usually first noticed.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <ServerRecovery retry={retry} digest={error.digest} />;
}
