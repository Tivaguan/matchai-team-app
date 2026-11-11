"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Splash } from "@/components/role-gate";
import { supabase } from "@/lib/supabase/client";

// Visiting /logout signs this device out. The iPad has no visible sign-out button on purpose:
// holding the logo on the counter for two seconds offers it.
export default function LogoutPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    // "local" signs out this device only. The default would sign the account out everywhere,
    // so signing out on a laptop would also sign out the phone or the counter iPad.
    supabase.auth.signOut({ scope: "local" }).finally(() => {
      queryClient.clear();
      router.replace("/login");
    });
  }, [router, queryClient]);

  return <Splash />;
}
