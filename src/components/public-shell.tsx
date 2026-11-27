// The frame for the public pages staff open on their phones.
export function PublicShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="safe-screen flex min-h-dvh flex-1 flex-col bg-ink text-paper">
      <header className="mx-auto flex w-full max-w-xl items-end justify-between gap-4 px-5 pt-6 pb-4">
        <span className="font-brand text-4xl leading-none uppercase">Matchai</span>
        <span className="font-label text-lg font-medium tracking-[0.14em] text-paper/60 uppercase">{title}</span>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-5 pb-10">{children}</main>
    </div>
  );
}
