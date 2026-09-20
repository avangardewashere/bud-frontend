import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/api/session";

/**
 * The player is session-gated like the rest of the app, but renders without the
 * shell's nav: it has its own top bar and owns the full viewport (mockup 1g).
 */
export default async function PlayerLayout({ children }: { children: ReactNode }) {
  if (!(await getSessionUser())) redirect("/login");
  return <>{children}</>;
}
