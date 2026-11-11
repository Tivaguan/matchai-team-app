"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { askToUnlock, isUnlocked, noteHidden, savedLock } from "@/lib/app-lock";

// Shows the owner pages only after Face ID (or fingerprint) on a phone where
// the lock was turned on. See lib/app-lock.ts for what it does and does not protect.

export function AppLock({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "locked" | "open">("checking");
  const [failed, setFailed] = useState(false);

  const unlock = useCallback(async () => {
    const lock = savedLock(userId);
    if (!lock) return setState("open");
    setFailed(false);
    try {
      await askToUnlock(lock);
      setState("open");
    } catch {
      setFailed(true);
    }
  }, [userId]);

  useEffect(() => {
    const check = () => setState(!savedLock(userId) || isUnlocked() ? "open" : "locked");
    check();
    // Lock again when the app comes back after a while in the background.
    const onVisibility = () => {
      noteHidden(document.hidden);
      if (!document.hidden) check();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [userId]);

  if (state === "open") return children;

  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-8 bg-ink px-6 text-paper">
      <span className="font-brand text-6xl leading-none uppercase">Matchai</span>
      {state === "locked" && (
        <div className="flex w-full max-w-xs flex-col items-center gap-4">
          <button
            type="button"
            onClick={unlock}
            className="flex h-14 w-full items-center justify-center bg-paper font-label text-2xl font-semibold tracking-[0.08em] text-ink uppercase active:bg-sage"
          >
            Unlock
          </button>
          {failed && <p className="text-center text-paper/70">That did not work. Try again.</p>}
          <Link href="/logout" className="text-paper/60 underline underline-offset-4 hover:text-paper">
            Sign in with the password instead
          </Link>
        </div>
      )}
    </div>
  );
}
