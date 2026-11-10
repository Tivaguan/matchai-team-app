"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Splash } from "@/components/role-gate";
import { homeFor, useSession } from "@/lib/session";

// The front door: sends each account to its own home.
export default function Home() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (isPending) return;
    router.replace(session ? homeFor(session.role) : "/login");
  }, [isPending, session, router]);

  return <Splash />;
}
