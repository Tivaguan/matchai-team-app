"use client";

import { useEffect } from "react";

/** Registers the service worker (notifications and the offline page). Shows nothing. */
export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
        // The app works without it; only notifications and the offline page need it.
      });
    }
  }, []);
  return null;
}
