"use client";

import { Popover } from "@base-ui/react/popover";
import { Download } from "lucide-react";
import { useState } from "react";

type ExportButtonsProps = {
  /** Disabled until the numbers are loaded. */
  disabled: boolean;
  onExcel: () => Promise<void>;
  onPdf: () => Promise<void>;
};

/** One small download button that offers the two file types. */
export function ExportButtons({ disabled, onExcel, onPdf }: ExportButtonsProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"excel" | "pdf" | null>(null);
  const [failed, setFailed] = useState(false);

  async function run(kind: "excel" | "pdf", action: () => Promise<void>) {
    setBusy(kind);
    setFailed(false);
    try {
      await action();
      setOpen(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label="Export"
        disabled={disabled}
        className="flex size-11 items-center justify-center border border-ink/30 bg-white hover:bg-ink hover:text-paper disabled:pointer-events-none disabled:opacity-40 data-[popup-open]:bg-ink data-[popup-open]:text-paper"
      >
        <Download className="size-5" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
          <Popover.Popup className="flex w-44 flex-col border border-ink bg-white p-1 text-ink shadow-lg outline-none">
            {(
              [
                ["excel", "Excel", onExcel],
                ["pdf", "PDF", onPdf],
              ] as const
            ).map(([kind, name, action]) => (
              <button
                key={kind}
                type="button"
                disabled={busy !== null}
                onClick={() => run(kind, action)}
                className="flex h-11 items-center px-3 text-left text-base font-medium hover:bg-ink hover:text-paper disabled:opacity-50"
              >
                {busy === kind ? "Preparing" : name}
              </button>
            ))}
            {failed && <p className="px-3 py-2 text-sm text-destructive">The export failed. Try again.</p>}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
