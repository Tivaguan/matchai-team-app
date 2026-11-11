"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Splash } from "@/components/role-gate";
import { homeFor, SESSION_KEY, useSession } from "@/lib/session";
import { markUnlocked } from "@/lib/app-lock";
import { supabase } from "@/lib/supabase/client";

const fieldClass =
  "h-14 w-full border border-ink/30 bg-white px-4 text-lg text-ink outline-none focus:border-ink focus:ring-2 focus:ring-sage";

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, isPending } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in: go straight to this account's home.
  useEffect(() => {
    if (session) router.replace(homeFor(session.role));
  }, [session, router]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) {
      setError("Wrong email or password.");
      setBusy(false);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: SESSION_KEY });
    const current = queryClient.getQueryData(SESSION_KEY);
    if (!current) {
      // A valid login that is neither an owner nor the counter iPad.
      await supabase.auth.signOut({ scope: "local" });
      setError("This account has no access to the app.");
      setBusy(false);
      return;
    }

    // The password is the way in when Face ID fails, so it also opens the app lock.
    markUnlocked();

    // The app keeps this page in memory, so empty the form now:
    // otherwise the email and password would still be filled in after a sign-out.
    setEmail("");
    setPassword("");
    setBusy(false);
  }

  if (isPending || session) return <Splash />;

  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-8 bg-ink p-6 text-paper">
      <div className="flex flex-col items-center gap-2">
        <span className="font-brand text-7xl leading-none uppercase">Matchai</span>
        <span className="font-serif text-2xl leading-none italic">Sip green, feel seen.</span>
      </div>

      <form onSubmit={signIn} className="flex w-full max-w-sm flex-col gap-5 bg-paper p-7 text-ink">
        <h1 className="border-b border-ink pb-2 font-label text-3xl font-semibold tracking-[0.06em] uppercase">
          Team sign in
        </h1>

        <label className="flex flex-col gap-2">
          <span className="font-label text-lg font-medium tracking-[0.14em] uppercase">Email</span>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="font-label text-lg font-medium tracking-[0.14em] uppercase">Password</span>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldClass}
          />
        </label>

        <p className="min-h-6 text-base font-medium text-destructive" aria-live="polite">
          {error}
        </p>

        <button
          type="submit"
          disabled={busy}
          className="h-14 touch-manipulation bg-ink font-label text-2xl font-semibold tracking-[0.06em] text-paper uppercase select-none active:bg-sage active:text-ink disabled:opacity-50"
        >
          {busy ? "Signing in" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
