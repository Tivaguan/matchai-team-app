"use client";

import { useMutation } from "@tanstack/react-query";
import { Delete } from "lucide-react";
import { useState } from "react";
import { formatAmount, formatMoney } from "@/lib/format";
import { requestAlert } from "@/lib/notify";
import { supabase } from "@/lib/supabase/client";
import { MoneyPicture } from "./money-picture";
import { type ActionResult, type Actor, errorMessage, labelClass, noteClass, primaryButtonClass } from "./shared";

type CashCountScreenProps = {
  kind: "opening" | "closing";
  actor: Actor;
  /** Called after the count is saved, with a short message for the home screen. */
  onSaved: (message: string) => void;
};

// Moroccan notes and coins, in dirhams. The same list is checked on the server.
const NOTES = ["200", "100", "50", "20"] as const;
const COINS = ["10", "5", "2", "1", "0.5"] as const;
const ALL = [...NOTES, ...COINS];

const MAX_DIGITS = 4;

function denominationLabel(value: string) {
  return value.startsWith("0.") ? `${Number(value) * 100} c` : value;
}

/** The drawer count: how many of each note and coin. The total adds itself up. */
export function CashCountScreen({ kind, actor, onSaved }: CashCountScreenProps) {
  // Counts as typed, by denomination. Missing means zero.
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string>(ALL[0]);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = ALL.reduce((sum, value) => sum + Number(value) * Number(counts[value] ?? 0), 0);

  const save = useMutation({
    mutationFn: async () => {
      const breakdown = Object.fromEntries(ALL.map((value) => [value, Number(counts[value] ?? 0)]));
      const { data, error: rpcError } = await supabase.rpc("log_cash_count", {
        p_employee_id: actor.employee.id,
        p_pin: actor.pin,
        p_kind: kind,
        p_breakdown: breakdown,
      });
      if (rpcError) throw rpcError;
      return data as ActionResult;
    },
    onSuccess: (result) => {
      if (result.ok) {
        void requestAlert({ type: kind === "opening" ? "day_opened" : "day_closed" });
        onSaved(`${kind === "opening" ? "Day opened" : "Day closed"} · ${formatMoney(total)}`);
      } else {
        setConfirming(false);
        setError(errorMessage(result.error));
      }
    },
    onError: () => {
      setConfirming(false);
      setError("No connection · try again");
    },
  });

  function change(next: string) {
    setCounts((current) => ({ ...current, [selected]: next }));
    setConfirming(false);
    setError(null);
  }

  function pressDigit(digit: string) {
    const current = counts[selected] ?? "";
    if (current.length >= MAX_DIGITS) return;
    change(current === "0" ? digit : current + digit);
  }

  function selectNext() {
    const index = ALL.indexOf(selected as (typeof ALL)[number]);
    setSelected(ALL[(index + 1) % ALL.length]);
  }

  const keyClass =
    "flex h-[min(4.5rem,9dvh)] items-center justify-center bg-paper font-label text-4xl font-semibold text-ink " +
    "touch-manipulation select-none transition-colors active:bg-sage disabled:opacity-40";

  return (
    <section className="grid min-h-0 flex-1 grid-cols-1 gap-6 md:grid-cols-[1.9fr_1fr]">
      <div className="grid grid-cols-3 gap-1.5 md:grid-rows-3">
        {ALL.map((value) => {
          const count = Number(counts[value] ?? 0);
          const isSelected = value === selected;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${denominationLabel(value)}${value.startsWith("0.") ? "" : " dirhams"}, ${count} counted`}
              onClick={() => setSelected(value)}
              className={
                "flex min-h-28 touch-manipulation flex-col justify-between gap-2 p-3 text-left text-ink select-none " +
                (isSelected ? "bg-sage" : "bg-paper active:bg-sage")
              }
            >
              <MoneyPicture value={value} className="h-[min(7.5rem,12dvh)] justify-center" />
              <span className="flex items-baseline justify-between gap-2">
                <span
                  className={`font-brand text-5xl leading-none whitespace-nowrap tabular-nums ${count === 0 && !isSelected ? "text-ink/30" : ""}`}
                >
                  × {count}
                </span>
                <span className={`${labelClass} text-2xl whitespace-nowrap text-ink/60 tabular-nums`}>
                  {count > 0 ? formatAmount(Number(value) * count) : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className={`${noteClass} text-xl text-paper/60`}>
            {kind === "opening" ? "Opening count" : "Closing count"} · total
          </h1>
          <p className="font-brand text-6xl leading-none tabular-nums" aria-live="polite">
            {formatMoney(total)}
          </p>
          <p className={`${noteClass} min-h-6 text-lg text-destructive`} aria-live="polite">
            {error}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
            <button key={digit} type="button" className={keyClass} disabled={save.isPending} onClick={() => pressDigit(digit)}>
              {digit}
            </button>
          ))}
          <button
            type="button"
            className={`${keyClass} text-2xl tracking-[0.06em] uppercase`}
            disabled={save.isPending}
            onClick={selectNext}
          >
            Next
          </button>
          <button type="button" className={keyClass} disabled={save.isPending} onClick={() => pressDigit("0")}>
            0
          </button>
          <button
            type="button"
            className={keyClass}
            disabled={save.isPending || !counts[selected]}
            onClick={() => change((counts[selected] ?? "").slice(0, -1))}
            aria-label="Delete last digit"
          >
            <Delete className="size-8" aria-hidden="true" />
          </button>
        </div>

        {/* Two taps to save: an opening count cannot be changed afterwards. */}
        <button
          type="button"
          className={confirming ? primaryButtonClass.replace("bg-paper ", "bg-sage ") : primaryButtonClass}
          disabled={save.isPending}
          onClick={() => (confirming ? save.mutate() : setConfirming(true))}
        >
          {save.isPending
            ? "Saving"
            : confirming
              ? `Confirm ${formatMoney(total)}`
              : kind === "opening"
                ? "Open the day"
                : "Close the day"}
        </button>
      </div>
    </section>
  );
}
