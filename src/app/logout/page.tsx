"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Splash } from "@/components/role-gate";
import { supabase } from "@/lib/supabase/client";

// Visiting /logout signs this device out. The iPad has no sign-out button on purpose.
export default function LogoutPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth.signOut().finally(() => {
      queryClient.clear();
      router.replace("/login");
    });
  }, [router, queryClient]);

  return <Splash />;
}
