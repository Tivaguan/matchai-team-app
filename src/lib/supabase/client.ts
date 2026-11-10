import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

// One client for the whole browser tab, so the login session is shared everywhere.
export const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);
