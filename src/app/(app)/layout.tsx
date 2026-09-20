import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { BottomTabs, TopNav } from "@/components/shell/TopNav";
import { getSessionUser } from "@/lib/api/session";

/**
 * Everything behind the session lives in this group. The check runs here rather than
 * in a proxy so there is one network call per navigation instead of two, and so the
 * shell already has the user it needs to render the nav.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav user={user} />
      <div className="flex-1">{children}</div>
      <BottomTabs user={user} />
    </div>
  );
}
