"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatQuantity } from "@/lib/format";
import { supabase } from "@/lib/supabase/client";
import { AmountPad } from "./amount-pad";
import { type ActionResult, type Actor, errorMessage, labelClass, noteClass, primaryButtonClass } from "./shared";

type StockRow = {
  item_id: string;
  item_name: string;
  unit: string;
  category_id: string;
  category_name: string;
  current_quantity: number;
};

const STOCK_KEY = ["counter-stock"] as const;

export function StockScreen({ actor }: { actor: Actor }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [direction, setDirection] = useState<"remove" | "add">("remove");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState<{ text: string; isError: boolean } | null>(null);

  const stock = useQuery({
    queryKey: STOCK_KEY,
    queryFn: async (): Promise<StockRow[]> => {
      const { data, error } = await supabase.rpc("get_counter_stock");
      if (error) throw error;
      return data;
    },
  });

  const selected = stock.data?.find((row) => row.item_id === selectedId) ?? null;

  const save = useMutation({
    mutationFn: async (item: StockRow) => {
      const signed = direction === "add" ? Number(amount) : -Number(amount);
      const { data, error } = await supabase.rpc("adjust_stock", {
        p_employee_id: actor.employee.id,
        p_pin: actor.pin,
        p_item_id: item.item_id,
        p_amount: signed,
      });
      if (error) throw error;
      return { result: data as ActionResult, item };
    },
    onSuccess: ({ result, item }) => {
      if (result.ok) {
        setAmount("");
        setNote({ text: `Saved · now ${formatQuantity(Number(result.quantity_after), item.unit)}`, isError: false });
        queryClient.invalidateQueries({ queryKey: STOCK_KEY });
      } else if (result.error === "not_enough_stock") {
        setNote({ text: `Only ${formatQuantity(Number(result.current_quantity), item.unit)} left`, isError: true });
      } else {
        setNote({ text: errorMessage(result.error), isError: true });
      }
    },
    onError: () => setNote({ text: "No connection · try again", isError: true }),
  });

  function select(itemId: string) {
    setSelectedId(itemId);
    setAmount("");
    setNote(null);
  }

  // Group the rows by category, keeping the order the server sent.
  const categories: { id: string; name: string; items: StockRow[] }[] = [];
  for (const row of stock.data ?? []) {
    const last = categories.at(-1);
    if (last?.id === row.category_id) last.items.push(row);
    else categories.push({ id: row.category_id, name: row.category_name, items: [row] });
  }

  return (
    <section className="grid min-h-0 flex-1 grid-cols-1 gap-8 md:grid-cols-2">
      <div className="flex min-h-0 flex-col gap-5 md:overflow-y-auto md:pr-2">
        {stock.isPending && <p className={`${noteClass} text-xl text-paper/60`}>Loading</p>}
        {stock.isError && <p className={`${noteClass} text-xl text-paper/60`}>No connection · check the Wi-Fi</p>}
        {stock.data?.length === 0 && (
          <p className={`${noteClass} text-xl text-paper/60`}>No items yet · an owner adds them</p>
        )}

        {categories.map((category) => (
          <div key={category.id} className="flex flex-col gap-1.5">
            <h2 className={`${labelClass} border-b border-paper/40 pb-1 text-2xl`}>{category.name}</h2>
            {category.items.map((item) => {
              const isSelected = item.item_id === selectedId;
              return (
                <button
                  key={item.item_id}
                  type="button"
                  onClick={() => select(item.item_id)}
                  aria-pressed={isSelected}
                  className={
                    `${labelClass} flex min-h-16 touch-manipulation items-center justify-between gap-4 px-4 text-left text-2xl text-ink transition-colors select-none ` +
                    (isSelected ? "bg-sage" : "bg-paper active:bg-sage")
                  }
                >
                  <span className="min-w-0">{item.item_name}</span>
                  <span className="shrink-0 tabular-nums">{formatQuantity(item.current_quantity, item.unit)}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        {!selected && stock.data && stock.data.length > 0 && (
          <p className={`${noteClass} pt-10 text-center text-2xl text-paper/60`}>Pick an item</p>
        )}

        {selected && (
          <>
            <div className="flex items-baseline justify-between gap-4">
              <h1 className="font-serif text-4xl leading-none uppercase">{selected.item_name}</h1>
              <span className={`${noteClass} shrink-0 text-xl text-paper/60`}>
                {formatQuantity(selected.current_quantity, selected.unit)} now
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {(["remove", "add"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={direction === option}
                  onClick={() => {
                    setDirection(option);
                    setNote(null);
                  }}
                  className={
                    `${labelClass} h-14 touch-manipulation text-2xl select-none ` +
                    (direction === option ? "bg-sage text-ink" : "border border-paper/40 text-paper")
                  }
                >
                  {option === "remove" ? "− Remove" : "+ Add"}
                </button>
              ))}
            </div>

            <p className="flex items-baseline justify-between gap-4" aria-live="polite">
              <span className="font-brand text-6xl leading-none tabular-nums">
                {direction === "remove" ? "−" : "+"}
                {amount || "0"}
                <span className={`${labelClass} pl-3 text-2xl`}>{selected.unit}</span>
              </span>
              <span className={`${noteClass} text-right text-lg ${note?.isError ? "text-destructive" : "text-sage"}`}>
                {note?.text}
              </span>
            </p>

            <AmountPad
              value={amount}
              decimals={3}
              disabled={save.isPending}
              onChange={(value) => {
                setAmount(value);
                setNote(null);
              }}
            />
            <button
              type="button"
              className={primaryButtonClass}
              disabled={!(Number(amount) > 0) || save.isPending}
              onClick={() => save.mutate(selected)}
            >
              {save.isPending ? "Saving" : "Save"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
