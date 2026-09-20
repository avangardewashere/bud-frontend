"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BudIcon, Wordmark } from "@/components/bud";
import type { PublicUser } from "@/lib/api";
import { SignOutButton } from "./SignOutButton";

/**
 * The shell's top bar — Design-Mockups.md, "Global shell".
 *
 * White, 1px bottom border, the mark and wordmark on the left, nav as pills, and the
 * user's initials on the right. Admin only appears for admins: mockup 1j is a learner
 * and shows just Dashboard and Catalog.
 *
 * On phones the nav moves to a bottom tab bar (mockup 1l), so it is hidden here and
 * rendered by BottomTabs instead.
 */

export type NavItem = { href: string; label: string };

export function navItems(user: PublicUser): NavItem[] {
  const items: NavItem[] = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/catalog", label: "Catalog" },
  ];
  if (user.role === "admin") items.push({ href: "/admin/courses", label: "Admin" });
  return items;
}

export function TopNav({ user }: { user: PublicUser }) {
  const pathname = usePathname();
  const items = navItems(user);

  return (
    <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--card)]">
      <nav className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-6">
        <Link href="/dashboard" className="flex items-center" aria-label="Bud, home">
          <Wordmark size={22} withIcon />
        </Link>

        <ul className="hidden flex-1 items-center gap-1 md:flex">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                className={
                  isActive(pathname, item.href)
                    ? "rounded-full bg-[var(--tint)] px-3 py-1.5 text-sm font-semibold text-[var(--tint-foreground)]"
                    : "rounded-full px-3 py-1.5 text-sm font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-3 md:ml-0">
          <SignOutButton />
          <Avatar user={user} />
        </div>
      </nav>
    </header>
  );
}

/** The bottom tab bar phones get instead of the nav pills. */
export function BottomTabs({ user }: { user: PublicUser }) {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-10 border-t border-[var(--border)] bg-[var(--card)] md:hidden">
      <ul className="flex">
        {navItems(user).map((item) => (
          <li key={item.href} className="flex-1">
            <Link
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={
                "flex flex-col items-center gap-1 py-3 text-sm font-semibold " +
                (isActive(pathname, item.href)
                  ? "text-[var(--tint-foreground)]"
                  : "text-[var(--muted-foreground)]")
              }
            >
              {item.href === "/dashboard" && <BudIcon size={16} />}
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Avatar({ user }: { user: PublicUser }) {
  return (
    <span
      title={user.email}
      className="flex size-8 items-center justify-center rounded-full bg-[var(--primary)] font-mono text-xs font-medium text-[var(--primary-foreground)]"
    >
      {initials(user.name)}
    </span>
  );
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0];
  return letters.toUpperCase();
}

/** `/courses/docker` should light up Catalog, so match the section, not the exact path. */
function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
