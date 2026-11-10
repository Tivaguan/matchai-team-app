"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Picker, Stepper } from "@/components/picker";
import { Label } from "@/components/ui/label";
import { formatDay, formatMoney, formatTime, shopToday } from "@/lib/format";
import { supabase } from "@/lib/supabase/client";

type Period = "month" | "day";

/** "2026-11" moved by a number of months. */
function shiftMonth(month: string, by: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + by, 1)).toISOString().slice(0, 7);
}

/** "2026-11-10" moved by a number of days. */
function shiftDay(day: string, by: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + by);
  return date.toISOString().slice(0, 10);
}

/** "2026-11" -> "November 2026" */
function formatMonth(month: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
}

/** First day of the month after "2026-11". */
function nextMonthStart(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1));
  return next.toISOString().slice(0, 10);
}

export default function ExpensesPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [month, setMonth] = useState(() => shopToday().slice(0, 7));
  const [day, setDay] = useState(() => shopToday());
  const [employeeId, setEmployeeId] = useState("all");

  const employees = useQuery({
    queryKey: ["admin", "employee-names"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const expenses = useQuery({
    queryKey: ["admin", "expenses", period, period === "month" ? month : day, employeeId],
    enabled: period === "month" ? month.length === 7 : day.length === 10,
    queryFn: async () => {
      let query = supabase
        .from("expenses")
        .select("id, day, amount, reason, created_at, employees(name)")
        .order("created_at", { ascending: false });
      query =
        period === "month" ? query.gte("day", `${month}-01`).lt("day", nextMonthStart(month)) : query.eq("day", day);
      if (employeeId !== "all") query = query.eq("employee_id", employeeId);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const total = expenses.data?.reduce((sum, row) => sum + row.amount, 0) ?? 0;

  return (
    <>
      <div className="border-b border-ink pb-3">
        <h1 className="font-serif text-5xl leading-none uppercase">Expenses</h1>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="expenses-period">Show</Label>
          <Picker
            id="expenses-period"
            value={period}
            onChange={(value) => setPeriod(value as Period)}
            options={[
              { value: "month", label: "A month" },
              { value: "day", label: "A day" },
            ]}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>{period === "month" ? "Month" : "Day"}</Label>
          {period === "month" ? (
            <Stepper
              label={formatMonth(month)}
              onPrevious={() => setMonth(shiftMonth(month, -1))}
              onNext={() => setMonth(shiftMonth(month, 1))}
              previousLabel="Previous month"
              nextLabel="Next month"
            />
          ) : (
            <Stepper
              label={formatDay(day)}
              onPrevious={() => setDay(shiftDay(day, -1))}
              onNext={() => setDay(shiftDay(day, 1))}
              previousLabel="Previous day"
              nextLabel="Next day"
            />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="expenses-employee">Employee</Label>
          <Picker
            id="expenses-employee"
            value={employeeId}
            onChange={setEmployeeId}
            options={[
              { value: "all", label: "Everyone" },
              ...(employees.data ?? []).map((employee) => ({ value: employee.id, label: employee.name })),
            ]}
          />
        </div>

        <p className="ml-auto flex flex-col items-end">
          <span className="font-label text-lg tracking-[0.1em] text-ink/60 uppercase">Total</span>
          <span className="font-brand text-4xl leading-none tabular-nums">{formatMoney(total)}</span>
        </p>
      </div>

      {expenses.isPending && <p className="text-muted-foreground">Loading expenses.</p>}
      {expenses.isError && (
        <p className="text-destructive">Could not load the expenses. Check your connection and refresh.</p>
      )}
      {expenses.data?.length === 0 && (
        <p className="text-lg text-muted-foreground">No expenses for this {period} and employee.</p>
      )}

      {expenses.data && expenses.data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-ink/30 font-label text-lg tracking-[0.1em] uppercase">
                <th className="py-2 pr-4 font-semibold">When</th>
                <th className="py-2 pr-4 font-semibold">Who</th>
                <th className="py-2 pr-4 font-semibold">Reason</th>
                <th className="py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.data.map((row) => (
                <tr key={row.id} className="border-b border-ink/15 align-top">
                  <td className="py-3 pr-4 whitespace-nowrap">
                    {formatDay(row.day)}, {formatTime(row.created_at)}
                  </td>
                  <td className="py-3 pr-4">{row.employees?.name ?? "Unknown"}</td>
                  <td className="py-3 pr-4">{row.reason}</td>
                  <td className="py-3 text-right text-lg font-medium tabular-nums">{formatMoney(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
