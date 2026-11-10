"use client";

import { useQuery } from "@tanstack/react-query";
import { formatDay, formatMoney, formatTime } from "@/lib/format";
import { supabase } from "@/lib/supabase/client";

type Count = { amount: number; who: string; at: string; detail: string };
type DayRow = { day: string; opening: Count | null; closing: Count | null; closingRecounts: number };

const DAYS_SHOWN = 60;

/** {"200": 3, "0.5": 4} -> "3 × 200, 4 × 50 c", biggest first. */
function describeBreakdown(breakdown: unknown) {
  if (!breakdown || typeof breakdown !== "object") return "";
  return Object.entries(breakdown as Record<string, number>)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([value, count]) => `${count} × ${value.startsWith("0.") ? `${Number(value) * 100} c` : value}`)
    .join(", ");
}

async function loadDays(): Promise<DayRow[]> {
  const { data, error } = await supabase
    .from("cash_counts")
    .select("day, kind, amount, breakdown, created_at, employees(name)")
    .order("day", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(DAYS_SHOWN * 6);
  if (error) throw error;

  const days = new Map<string, DayRow>();
  for (const row of data) {
    const entry = days.get(row.day) ?? { day: row.day, opening: null, closing: null, closingRecounts: -1 };
    const count = {
      amount: row.amount,
      who: row.employees?.name ?? "Unknown",
      at: row.created_at,
      detail: describeBreakdown(row.breakdown),
    };
    if (row.kind === "opening") {
      entry.opening = count;
    } else {
      // Rows come oldest first, so the last closing count wins.
      entry.closing = count;
      entry.closingRecounts += 1;
    }
    days.set(row.day, entry);
  }
  return [...days.values()].slice(0, DAYS_SHOWN);
}

function CountCell({ count }: { count: Count | null }) {
  if (!count) return <span className="text-ink/40">Not counted</span>;
  return (
    <span className="flex flex-col">
      <span className="text-lg font-medium tabular-nums">{formatMoney(count.amount)}</span>
      <span className="text-sm text-ink/60">
        {count.who} at {formatTime(count.at)}
      </span>
      {count.detail && <span className="text-sm text-ink/60">{count.detail}</span>}
    </span>
  );
}

export default function CashPage() {
  const { data: days, isPending, isError } = useQuery({ queryKey: ["admin", "cash"], queryFn: loadDays });

  return (
    <>
      <div className="border-b border-ink pb-3">
        <h1 className="font-serif text-5xl leading-none uppercase">Cash</h1>
      </div>

      {isPending && <p className="text-muted-foreground">Loading counts.</p>}
      {isError && <p className="text-destructive">Could not load the counts. Check your connection and refresh.</p>}
      {days?.length === 0 && (
        <p className="text-lg text-muted-foreground">
          No counts yet. They appear here once the day is opened on the counter iPad.
        </p>
      )}

      {days && days.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-ink/30 font-label text-lg tracking-[0.1em] uppercase">
                <th className="py-2 pr-4 font-semibold">Day</th>
                <th className="py-2 pr-4 font-semibold">Opening</th>
                <th className="py-2 pr-4 font-semibold">Closing</th>
                <th className="py-2 text-right font-semibold">Closing − opening</th>
              </tr>
            </thead>
            <tbody>
              {days.map((row) => {
                const difference = row.opening && row.closing ? row.closing.amount - row.opening.amount : null;
                return (
                  <tr key={row.day} className="border-b border-ink/15 align-top">
                    <td className="py-3 pr-4 font-medium whitespace-nowrap">{formatDay(row.day)}</td>
                    <td className="py-3 pr-4">
                      <CountCell count={row.opening} />
                    </td>
                    <td className="py-3 pr-4">
                      <CountCell count={row.closing} />
                      {row.closingRecounts > 0 && (
                        <span className="text-sm text-ink/60">
                          Recounted {row.closingRecounts} {row.closingRecounts === 1 ? "time" : "times"}
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right text-lg font-medium tabular-nums">
                      {difference === null ? <span className="text-ink/40">—</span> : formatMoney(difference)}
                    </td>
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
