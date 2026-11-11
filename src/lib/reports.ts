import { supabase } from "@/lib/supabase/client";

// The numbers the owners look at, built from the raw counts and expenses.
// Used by the day and month pages and by the Excel and PDF exports.

export type Count = { kind: "opening" | "closing"; amount: number; who: string; at: string; detail: string };
export type Expense = { id: number; day: string; amount: number; reason: string; who: string; at: string };

export type DayReport = {
  day: string;
  opening: Count | null;
  /** The latest closing count, if the day was closed. */
  closing: Count | null;
  /** Every count of the day, oldest first, recounts included. */
  counts: Count[];
  expenses: Expense[];
  expensesTotal: number;
  /** Closing minus opening. Null until both exist. */
  difference: number | null;
  /** Cash that came in: closing minus opening, plus what was taken out. Null until both counts exist. */
  net: number | null;
};

export type MonthReport = {
  month: string;
  days: DayReport[];
  totals: { expenses: number; difference: number; net: number };
};

/** {"200": 3, "0.5": 4} -> "3 × 200, 4 × 50 c", biggest first. */
export function describeBreakdown(breakdown: unknown) {
  if (!breakdown || typeof breakdown !== "object") return "";
  return Object.entries(breakdown as Record<string, number>)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([value, count]) => `${count} × ${value.startsWith("0.") ? `${Number(value) * 100} c` : value}`)
    .join(", ");
}

/** "2026-11" -> the first day of the following month. */
export function nextMonthStart(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
}

function buildDay(day: string, counts: Count[], expenses: Expense[]): DayReport {
  const opening = counts.find((count) => count.kind === "opening") ?? null;
  const closing = counts.findLast((count) => count.kind === "closing") ?? null;
  const expensesTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const difference = opening && closing ? closing.amount - opening.amount : null;
  return {
    day,
    opening,
    closing,
    counts,
    expenses,
    expensesTotal,
    difference,
    net: difference === null ? null : difference + expensesTotal,
  };
}

async function loadRange(from: string, toExclusive: string) {
  const [counts, expenses] = await Promise.all([
    supabase
      .from("cash_counts")
      .select("day, kind, amount, breakdown, created_at, employees(name)")
      .gte("day", from)
      .lt("day", toExclusive)
      .order("created_at"),
    supabase
      .from("expenses")
      .select("id, day, amount, reason, created_at, employees(name)")
      .gte("day", from)
      .lt("day", toExclusive)
      .order("created_at"),
  ]);
  if (counts.error) throw counts.error;
  if (expenses.error) throw expenses.error;

  const countsByDay = new Map<string, Count[]>();
  for (const row of counts.data) {
    const list = countsByDay.get(row.day) ?? [];
    list.push({
      kind: row.kind,
      amount: row.amount,
      who: row.employees?.name ?? "Unknown",
      at: row.created_at,
      detail: describeBreakdown(row.breakdown),
    });
    countsByDay.set(row.day, list);
  }

  const expensesByDay = new Map<string, Expense[]>();
  for (const row of expenses.data) {
    const list = expensesByDay.get(row.day) ?? [];
    list.push({
      id: row.id,
      day: row.day,
      amount: row.amount,
      reason: row.reason,
      who: row.employees?.name ?? "Unknown",
      at: row.created_at,
    });
    expensesByDay.set(row.day, list);
  }

  return { countsByDay, expensesByDay };
}

export async function loadDay(day: string): Promise<DayReport> {
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const { countsByDay, expensesByDay } = await loadRange(day, next.toISOString().slice(0, 10));
  return buildDay(day, countsByDay.get(day) ?? [], expensesByDay.get(day) ?? []);
}

/** Every day of the month that has a count or an expense, oldest first. */
export async function loadMonth(month: string): Promise<MonthReport> {
  const { countsByDay, expensesByDay } = await loadRange(`${month}-01`, nextMonthStart(month));
  const dayKeys = [...new Set([...countsByDay.keys(), ...expensesByDay.keys()])].sort();
  const days = dayKeys.map((day) => buildDay(day, countsByDay.get(day) ?? [], expensesByDay.get(day) ?? []));

  return {
    month,
    days,
    totals: {
      expenses: days.reduce((sum, day) => sum + day.expensesTotal, 0),
      difference: days.reduce((sum, day) => sum + (day.difference ?? 0), 0),
      net: days.reduce((sum, day) => sum + (day.net ?? 0), 0),
    },
  };
}
