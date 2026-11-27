"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { homeFor, type Role, useSession } from "@/lib/session";

/** Shown while we find out who is logged in. */
export function Splash() {
  return (
    <div className="safe-screen flex min-h-dvh flex-1 items-center justify-center bg-ink text-paper">
      <span className="font-brand text-6xl leading-none uppercase">Matchai</span>
    </div>
  );
}

/**
 * Shows its content only to the given role. Everyone else is sent to the
 * login page or to their own home. This is for navigation only: what each
 * account can read or change is enforced by the database.
 */
export function RoleGate({ role, children }: { role: Role; children: React.ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  const target = isPending ? null : !session ? "/login" : session.role !== role ? homeFor(session.role) : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (isPending || target) return <Splash />;
  return children;
}
