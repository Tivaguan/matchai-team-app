"use client";

import { MonthGrid } from "@/components/date-popups";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Picker, TitleStepper } from "@/components/picker";
import { formatQuantity, formatTime, shopToday } from "@/lib/format";
import { nextMonthStart } from "@/lib/reports";
import { supabase } from "@/lib/supabase/client";

function shiftMonth(month: string, by: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + by, 1)).toISOString().slice(0, 7);
}

function formatMonth(month: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
}

function formatWhen(timestamp: string) {
  const day = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Africa/Casablanca",
  }).format(new Date(timestamp));
  return `${day}, ${formatTime(timestamp)}`;
}

type StockLogProps = {
  /** Open the log already narrowed to one item, or "all". */
  initialItemId: string;
  onBack: () => void;
};

/** The stock log: one month at a time, filtered by item and employee. */
export function StockLog({ initialItemId, onBack }: StockLogProps) {
  const [month, setMonth] = useState(() => shopToday().slice(0, 7));
  const [employeeId, setEmployeeId] = useState("all");
  const [itemId, setItemId] = useState(initialItemId);

  const filters = useQuery({
    queryKey: ["admin", "log-filters"],
    queryFn: async () => {
      const [employees, items] = await Promise.all([
        supabase.from("employees").select("id, name").order("name"),
        supabase.from("stock_items").select("id, name").order("name"),
      ]);
      if (employees.error) throw employees.error;
      if (items.error) throw items.error;
      return { employees: employees.data, items: items.data };
    },
  });

  const changes = useQuery({
    queryKey: ["admin", "stock-log", month, employeeId, itemId],
    queryFn: async () => {
      // Month borders in shop time (Morocco is UTC+1 all year).
      let query = supabase
        .from("stock_changes")
        .select("id, amount, quantity_before, quantity_after, created_at, employees(name), stock_items(name, unit)")
        .gte("created_at", `${month}-01T00:00:00+01:00`)
        .lt("created_at", `${nextMonthStart(month)}T00:00:00+01:00`)
        .order("created_at", { ascending: false })
        .limit(500);
      if (employeeId !== "all") query = query.eq("employee_id", employeeId);
      if (itemId !== "all") query = query.eq("item_id", itemId);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pt-6 pb-3">
        {/* The month is the big heading; the page name is only read out by screen readers. */}
        <div className="flex min-w-0 flex-col">
          <h1 className="sr-only">Stock log</h1>
          <TitleStepper
            label={formatMonth(month)}
            onPrevious={() => setMonth(shiftMonth(month, -1))}
            onNext={() => setMonth(shiftMonth(month, 1))}
            previousLabel="Previous month"
            nextLabel="Next month"
            popupLabel="Pick a month"
            popup={(close) => (
              <MonthGrid
                value={month}
                onPick={(chosen) => {
                  setMonth(chosen);
                  close();
                }}
              />
            )}
          />
        </div>
        {/* One line only: the filters and the way back sit to the right of the month. */}
        <div className="flex flex-wrap items-center gap-3">
          <Picker
            id="log-item"
            className="min-w-32"
            value={itemId}
            onChange={setItemId}
            options={[
              { value: "all", label: "Every item" },
              ...(filters.data?.items ?? []).map((item) => ({ value: item.id, label: item.name })),
            ]}
          />
          <Picker
            id="log-employee"
            className="min-w-32"
            value={employeeId}
            onChange={setEmployeeId}
            options={[
              { value: "all", label: "Everyone" },
              ...(filters.data?.employees ?? []).map((employee) => ({ value: employee.id, label: employee.name })),
            ]}
          />
          <button
            type="button"
            onClick={onBack}
            className="flex h-11 items-center gap-2 border border-ink/30 bg-white px-4 text-base font-medium hover:bg-ink hover:text-paper"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Stock
          </button>
        </div>
      </div>

      {changes.isPending && <p className="text-muted-foreground">Loading the log.</p>}
      {changes.isError && <p className="text-destructive">Could not load the log. Check your connection and refresh.</p>}
      {changes.data?.length === 0 && (
        <p className="text-ink/60">No stock changes for this month and filter.</p>
      )}

      {changes.data && changes.data.length > 0 && (
        <div className="overflow-x-auto bg-white">
          <table className="w-full min-w-[44rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-ink/30 font-label text-base tracking-[0.1em] text-ink/60 uppercase">
                <th className="py-3 pr-4 pl-5 font-medium">When</th>
                <th className="py-3 pr-4 font-medium">Who</th>
                <th className="py-3 pr-4 font-medium">Item</th>
                <th className="py-3 pr-4 text-right font-medium">Before</th>
                <th className="py-3 pr-4 text-right font-medium">Change</th>
                <th className="py-3 pr-5 text-right font-medium">After</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {changes.data.map((row) => {
                const unit = row.stock_items?.unit ?? "";
                return (
                  <tr key={row.id} className="border-b border-dashed border-ink/20 last:border-b-0">
                    <td className="py-3 pr-4 pl-5 whitespace-nowrap">{formatWhen(row.created_at)}</td>
                    <td className="py-3 pr-4">{row.employees?.name ?? "Unknown"}</td>
                    <td className="py-3 pr-4">{row.stock_items?.name ?? "Unknown"}</td>
                    <td className="py-3 pr-4 text-right text-ink/60">{formatQuantity(row.quantity_before, unit)}</td>
                    <td className="py-3 pr-4 text-right font-label text-xl font-semibold">
                      {row.amount > 0 ? "+" : "−"}
                      {formatQuantity(Math.abs(row.amount), unit)}
                    </td>
                    <td className="py-3 pr-5 text-right">{formatQuantity(row.quantity_after, unit)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
