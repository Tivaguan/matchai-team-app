"use client";

import Link from "next/link";
import { RoleGate } from "@/components/role-gate";
import { useSession } from "@/lib/session";

const NAV = [{ href: "/admin/employees", label: "Employees" }] as const;

function AdminShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-paper text-ink">
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 bg-ink px-5 py-4 text-paper sm:px-8">
        <div className="flex items-center gap-8">
          <span className="font-brand text-4xl leading-none uppercase">Matchai</span>
          <nav className="flex gap-6">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="font-label text-xl font-semibold tracking-[0.06em] uppercase underline-offset-8 hover:underline"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-5 font-label text-lg font-medium tracking-[0.1em] uppercase">
          <span className="text-paper/60">{session?.name}</span>
          <Link href="/logout" className="underline-offset-8 hover:underline">
            Sign out
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-5 py-8 sm:px-8">{children}</main>
    </div>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <RoleGate role="owner">
      <AdminShell>{children}</AdminShell>
    </RoleGate>
  );
}
