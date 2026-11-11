"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CashHero, ExpenseList, signedMoney } from "@/components/admin/cash-parts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatMoney, formatTime } from "@/lib/format";
import { type Count, loadDay } from "@/lib/reports";

function countStat(label: string, count: Count | null, onOpen: (count: Count) => void) {
  return count
    ? {
        label,
        value: formatMoney(count.amount),
        note: `${count.who} · ${formatTime(count.at)}`,
        onOpen: count.detail ? () => onOpen(count) : undefined,
      }
    : { label, value: "—" };
}

/** One day: the headline numbers, then the expenses. Tapping a count shows its notes and coins. */
export function DayView({ day }: { day: string }) {
  const { data: report, isPending, isError } = useQuery({ queryKey: ["admin", "day", day], queryFn: () => loadDay(day) });
  const [opened, setOpened] = useState<Count | null>(null);

  if (isPending) return <p className="text-muted-foreground">Loading the day.</p>;
  if (isError) return <p className="text-destructive">Could not load the day. Check your connection and refresh.</p>;

  return (
    <>
      <CashHero
        headline={{
          label: "Cash sales",
          value: signedMoney(report.net),
        }}
        stats={[
          countStat("Opening", report.opening, setOpened),
          countStat("Closing", report.closing, setOpened),
          { label: "Expenses", value: formatMoney(report.expensesTotal) },
        ]}
      />

      <ExpenseList expenses={report.expenses} showDay={false} />

      <Dialog open={opened !== null} onOpenChange={(open) => !open && setOpened(null)}>
        <DialogContent>
          {opened && (
            <>
              <DialogHeader>
                <DialogTitle>{opened.kind === "opening" ? "Opening count" : "Closing count"}</DialogTitle>
                <DialogDescription>
                  {opened.who} · {formatTime(opened.at)}
                </DialogDescription>
              </DialogHeader>
              <ul className="flex flex-col">
                {opened.detail.split(", ").map((line) => (
                  <li key={line} className="border-b border-dashed border-ink/20 py-2 text-lg tabular-nums">
                    {line}
                  </li>
                ))}
                <li className="flex items-baseline justify-between gap-4 pt-3">
                  <span className="font-label text-lg font-semibold tracking-[0.1em] uppercase">Total</span>
                  <span className="font-label text-2xl font-semibold tabular-nums">{formatMoney(opened.amount)}</span>
                </li>
              </ul>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
