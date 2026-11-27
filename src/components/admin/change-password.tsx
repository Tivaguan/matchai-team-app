"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase/client";

const MIN_LENGTH = 8;
const EMPTY = { current: "", next: "", repeat: "" };

/** Row with a "Change" button: the owner types the current password, then the new one twice. */
export function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const change = useMutation({
    mutationFn: async () => {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email;
      if (!email) throw new Error("You are signed out. Sign in again, then try.");

      // Check the current password first, so a phone left open can't be used to take over the account.
      const check = await supabase.auth.signInWithPassword({ email, password: form.current });
      if (check.error) throw new Error("The current password is wrong.");

      const { error: updateError } = await supabase.auth.updateUser({ password: form.next });
      if (updateError) {
        if (updateError.code === "same_password") throw new Error("The new password is the same as the current one.");
        if (updateError.code === "weak_password") throw new Error("This password is too weak. Make it longer.");
        throw new Error("Could not change the password. Check your connection and try again.");
      }
    },
    onSuccess: () => {
      setOpen(false);
      setForm(EMPTY);
      setDone(true);
    },
    onError: (e: Error) => setError(e.message),
  });

  function submit() {
    setError(null);
    if (form.next.length < MIN_LENGTH) return setError(`The new password needs at least ${MIN_LENGTH} characters.`);
    if (form.next !== form.repeat) return setError("The two new passwords don't match.");
    change.mutate();
  }

  const field = (id: keyof typeof EMPTY, label: string, autoComplete: string) => (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`password-${id}`}>{label}</Label>
      <Input
        id={`password-${id}`}
        type="password"
        autoComplete={autoComplete}
        value={form[id]}
        onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
        className="h-12 text-lg"
      />
    </div>
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 bg-white px-5 py-4">
        <span className="flex min-w-0 flex-1 basis-56 flex-col">
          <span className="text-lg font-medium">Password</span>
          <span className="text-sm text-ink/60">
            {done ? "Changed. Use the new password next time you sign in." : "The one you use to sign in to this app."}
          </span>
        </span>
        <Button
          variant="outline"
          className="h-11 shrink-0 px-5 text-base"
          onClick={() => {
            setForm(EMPTY);
            setError(null);
            setOpen(true);
          }}
        >
          Change
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>At least {MIN_LENGTH} characters.</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {field("current", "Current password", "current-password")}
            {field("next", "New password", "new-password")}
            {field("repeat", "New password again", "new-password")}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button
                type="submit"
                className="h-11 px-5 text-lg"
                disabled={!form.current || !form.next || !form.repeat || change.isPending}
              >
                {change.isPending ? "Saving" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
