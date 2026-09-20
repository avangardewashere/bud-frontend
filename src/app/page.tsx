import { redirect } from "next/navigation";

/**
 * Bud has no marketing page — it is invite-only and the shell starts at the
 * dashboard. The (app) layout sends anyone without a session on to /login.
 */
export default function RootPage() {
  redirect("/dashboard");
}
