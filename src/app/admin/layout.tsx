"use client";

import { Bell, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppLock } from "@/components/admin/app-lock";
import { RoleGate } from "@/components/role-gate";
import { ADMIN_GROUPS, ALERTS_HREF, isOnPage } from "@/lib/admin-nav";
import { useSession } from "@/lib/session";

function AdminShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();

  const onAlerts = isOnPage(pathname, ALERTS_HREF);

  // RoleGate has already checked that an owner is signed in.
  if (!session) return null;

  return (
    <AppLock userId={session.userId}>
    <div className="flex min-h-dvh flex-1 flex-col bg-paper text-ink">
      {/* One bar, also on a phone: logo left, every page centered, alerts and sign out right. */}
      <header className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 bg-ink px-4 py-3 text-paper sm:gap-x-4 sm:px-8 sm:py-4 lg:grid-cols-[1fr_auto_1fr]">
        <span className="font-brand text-2xl leading-none uppercase sm:text-4xl">Matchai</span>

        <nav
          aria-label="Pages"
          className="flex items-center justify-center gap-x-4 sm:gap-x-10"
        >
          {ADMIN_GROUPS.map((group) => (
            <div key={group[0].href} className="flex items-center gap-4 sm:gap-10">
              {group.map((page) => {
                const isCurrent = isOnPage(pathname, page.href);
                return (
                  <Link
                    key={page.href}
                    href={page.href}
                    aria-current={isCurrent ? "page" : undefined}
                    className={
                      "border-b-2 pb-0.5 font-label text-base font-semibold tracking-[0.06em] uppercase sm:pb-1 sm:text-xl " +
                      (isCurrent ? "border-sage text-sage" : "border-transparent text-paper/70 hover:text-paper")
                    }
                  >
                    {page.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="flex items-center justify-end sm:gap-4">
          <span className="hidden font-label text-lg font-medium tracking-[0.1em] whitespace-nowrap text-paper/60 uppercase xl:inline">
            {session?.name}
          </span>
          <Link
            href={ALERTS_HREF}
            aria-label="Alerts"
            aria-current={onAlerts ? "page" : undefined}
            className={
              "flex size-9 items-center justify-center rounded-full sm:size-10 " +
              (onAlerts ? "text-sage" : "text-paper/70 hover:text-paper")
            }
          >
            <Bell className="size-5" fill={onAlerts ? "currentColor" : "none"} aria-hidden="true" />
          </Link>
          <Link
            href="/logout"
            aria-label="Sign out"
            className="flex size-9 items-center justify-center rounded-full text-paper/70 hover:text-paper sm:size-10"
          >
            <LogOut className="size-5" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-5 py-8 sm:px-8">{children}</main>
    </div>
    </AppLock>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <RoleGate role="owner">
      <AdminShell>{children}</AdminShell>
    </RoleGate>
  );
}
