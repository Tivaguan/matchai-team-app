"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const HOLD_MS = 2000;

/**
 * The counter's logo. Pressing and holding it for two seconds offers to sign the iPad out.
 * Nothing on screen hints at it, so staff do not sign out by accident.
 */
export function HiddenSignOut() {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stop() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  useEffect(() => stop, []);

  return (
    <>
      <span
        className="touch-manipulation font-brand text-5xl leading-none uppercase select-none [-webkit-touch-callout:none]"
        onPointerDown={() => {
          stop();
          timer.current = setTimeout(() => setAsking(true), HOLD_MS);
        }}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onContextMenu={(event) => event.preventDefault()}
      >
        Matchai
      </span>

      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out of this iPad?</DialogTitle>
            <DialogDescription>The counter will need the email and password to be used again.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-12 px-5 text-lg" onClick={() => setAsking(false)}>
              Stay
            </Button>
            <Button type="button" variant="destructive" className="h-12 px-5 text-lg" onClick={() => router.push("/logout")}>
              Sign out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
