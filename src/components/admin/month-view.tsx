"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CashHero, ExpenseList, SectionHeading, signedMoney } from "@/components/admin/cash-parts";
import { Switch } from "@/components/picker";
import { formatDay, formatMoney } from "@/lib/format";
import { loadMonth } from "@/lib/reports";

/** One month: the headline numbers, then one list at a time: the days or every expense. */
export function MonthView({ month, onOpenDay }: { month: string; onOpenDay: (day: string) => void }) {
  const { data: report, isPending, isError } = useQuery({
    queryKey: ["admin", "month", month],
    queryFn: () => loadMonth(month),
  });

  const [list, setList] = useState<"days" | "expenses">("days");

  if (isPending) return <p className="text-muted-foreground">Loading the month.</p>;
  if (isError) return <p className="text-destructive">Could not load the month. Check your connection and refresh.</p>;

  const closedDays = report.days.filter((day) => day.net !== null).length;
  const expenses = report.days.flatMap((day) => day.expenses).reverse();

  // Two long lists under each other would be a lot of scrolling, so only one shows.
  const listSwitch = (
    <Switch
      label="Show the days or the expenses"
      value={list}
      onChange={setList}
      options={[
        { value: "days", label: "Days" },
        { value: "expenses", label: "Expenses" },
      ]}
    />
  );

  return (
    <>
      <CashHero
        headline={{ label: "Cash sales", value: signedMoney(closedDays > 0 ? report.totals.net : null) }}
        stats={[
          {
            label: "Average per day",
            value: closedDays > 0 ? signedMoney(report.totals.net / closedDays) : "—",
            note: closedDays > 0 ? `over ${closedDays} ${closedDays === 1 ? "day" : "days"}` : undefined,
          },
          { label: "Expenses", value: formatMoney(report.totals.expenses) },
        ]}
      />

      {list === "days" ? (
      <section className="flex flex-col gap-3">
        <SectionHeading lead={listSwitch} />
        {report.days.length === 0 && <p className="text-ink/60">Nothing was logged this month.</p>}
        {report.days.length > 0 && (
          <div className="overflow-x-auto bg-white">
            <table className="w-full min-w-[36rem] border-collapse text-left tabular-nums">
              <thead>
                <tr className="border-b border-ink/30 font-label text-base tracking-[0.1em] text-ink/60 uppercase">
                  <th className="py-3 pr-4 pl-5 font-medium">Day</th>
                  <th className="py-3 pr-4 text-right font-medium">Opening</th>
                  <th className="py-3 pr-4 text-right font-medium">Closing</th>
                  <th className="py-3 pr-4 text-right font-medium">Expenses</th>
                  <th className="py-3 pr-5 text-right font-medium">Cash sales</th>
                </tr>
              </thead>
              <tbody>
                {report.days.map((day) => (
                  <tr
                    key={day.day}
                    onClick={() => onOpenDay(day.day)}
                    className="cursor-pointer border-b border-dashed border-ink/20 last:border-b-0 hover:bg-ink/5"
                  >
                    <td className="py-3 pr-4 pl-5 whitespace-nowrap">
                      <button type="button" className="text-lg" onClick={() => onOpenDay(day.day)}>
                        {formatDay(day.day)}
                      </button>
                    </td>
                    <td className="py-3 pr-4 text-right">{day.opening ? formatMoney(day.opening.amount) : "—"}</td>
                    <td className="py-3 pr-4 text-right">{day.closing ? formatMoney(day.closing.amount) : "—"}</td>
                    <td className="py-3 pr-4 text-right">{formatMoney(day.expensesTotal)}</td>
                    <td className="py-3 pr-5 text-right font-label text-xl font-semibold">{signedMoney(day.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      ) : (
        <ExpenseList expenses={expenses} showDay lead={listSwitch} />
      )}
    </>
  );
}
