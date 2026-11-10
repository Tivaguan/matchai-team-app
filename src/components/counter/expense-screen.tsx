"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { supabase } from "@/lib/supabase/client";
import { AmountPad } from "./amount-pad";
import { type ActionResult, type Actor, errorMessage, noteClass, primaryButtonClass } from "./shared";

type ExpenseScreenProps = {
  actor: Actor;
  /** Called after the expense is saved, with a short message for the home screen. */
  onSaved: (message: string) => void;
};

export function ExpenseScreen({ actor, onSaved }: ExpenseScreenProps) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const { data, error: rpcError } = await supabase.rpc("log_expense", {
        p_employee_id: actor.employee.id,
        p_pin: actor.pin,
        p_amount: Number(amount),
        p_reason: reason,
      });
      if (rpcError) throw rpcError;
      return data as ActionResult;
    },
    onSuccess: (result) => {
      if (result.ok) onSaved(`Expense saved · ${formatMoney(amount)}`);
      else setError(errorMessage(result.error));
    },
    onError: () => setError("No connection · try again"),
  });

  const ready = Number(amount) > 0 && reason.trim().length > 0;

  return (
    <section className="grid flex-1 grid-cols-1 items-start gap-8 md:grid-cols-2">
      <div className="flex flex-col gap-4">
        <h1 className="font-serif text-5xl leading-none uppercase">Cash taken out</h1>
        <p className="font-brand text-6xl leading-none tabular-nums" aria-live="polite">
          {formatMoney(amount || 0)}
        </p>

        <label htmlFor="expense-reason" className={`${noteClass} pt-2 text-xl text-paper/60`}>
          What was it for?
        </label>
        <textarea
          id="expense-reason"
          rows={3}
          maxLength={200}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setError(null);
          }}
          placeholder="Ice bags"
          className="w-full resize-none border border-paper/40 bg-transparent p-4 text-2xl text-paper outline-none placeholder:text-paper/30 focus:border-paper"
        />
        <p className={`${noteClass} min-h-7 text-xl text-destructive`} aria-live="polite">
          {error}
        </p>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <AmountPad
          value={amount}
          decimals={2}
          disabled={save.isPending}
          onChange={(value) => {
            setAmount(value);
            setError(null);
          }}
        />
        <button
          type="button"
          className={primaryButtonClass}
          disabled={!ready || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving" : "Save expense"}
        </button>
      </div>
    </section>
  );
}
