import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { BottomTabs, TopNav } from "@/components/shell/TopNav";
import { getSessionUser } from "@/lib/api/session";
import { THEME_COOKIE, parseThemeChoice } from "@/lib/theme";

/**
 * Everything behind the session lives in this group. The check runs here rather than
 * in a proxy so there is one network call per navigation instead of two, and so the
 * shell already has the user it needs to render the nav.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // The nav's theme toggle has to know which button to show pressed on the first
  // paint, and only the server has read the cookie by then.
  const theme = parseThemeChoice((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav user={user} theme={theme} />
      <div className="flex-1">{children}</div>
      <BottomTabs user={user} />
    </div>
  );
}
