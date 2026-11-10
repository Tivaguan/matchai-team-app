"use client";

import { useEffect, useState } from "react";
import { shopToday } from "@/lib/format";

/**
 * Today in the shop ("2026-11-10"), or null until the page has loaded.
 * The date is read after load on purpose, so public pages can be served
 * from a ready-made shell.
 */
export function useShopToday() {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    setToday(shopToday());
  }, []);
  return today;
}
