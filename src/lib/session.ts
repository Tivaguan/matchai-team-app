"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

export type Role = "owner" | "counter";
export type Session = { userId: string; role: Role; name: string };

export const SESSION_KEY = ["session"] as const;

export function homeFor(role: Role) {
  return role === "owner" ? "/admin" : "/counter";
}

/** Who is logged in on this device, and as what. `null` means nobody (or an account with no access). */
export function useSession() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        queryClient.invalidateQueries({ queryKey: SESSION_KEY });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return useQuery({
    queryKey: SESSION_KEY,
    staleTime: Infinity,
    queryFn: async (): Promise<Session | null> => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) return null;

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role, name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!profile) return null;

      return { userId: user.id, role: profile.role, name: profile.name };
    },
  });
}
