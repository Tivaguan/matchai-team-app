"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DayView } from "@/components/admin/day-view";
import { MonthView } from "@/components/admin/month-view";
import { DayCalendar, MonthGrid } from "@/components/date-popups";
import { ExportButtons } from "@/components/export-buttons";
import { Switch, TitleStepper } from "@/components/picker";
import { exportDay, exportMonth } from "@/lib/export";
import { formatDay, shopToday } from "@/lib/format";
import { loadDay, loadMonth } from "@/lib/reports";
import { addDays } from "@/lib/week";

type View = "day" | "month";

function shiftMonth(month: string, by: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + by, 1)).toISOString().slice(0, 7);
}

function formatMonth(month: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
}

// The drawer, by day or by month: counts, expenses and totals.
export default function CashPage() {
  const [view, setView] = useState<View>("day");
  const [day, setDay] = useState(() => shopToday());
  const [month, setMonth] = useState(() => shopToday().slice(0, 7));

  // The same numbers the view below loads (shared, so they are fetched once), for the export buttons.
  const dayReport = useQuery({ queryKey: ["admin", "day", day], queryFn: () => loadDay(day), enabled: view === "day" }).data;
  const monthReport = useQuery({
    queryKey: ["admin", "month", month],
    queryFn: () => loadMonth(month),
    enabled: view === "month",
  }).data;

  function switchTo(next: View) {
    // Going to the month view opens the month of the day being looked at.
    if (next === "month") setMonth(day.slice(0, 7));
    setView(next);
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pt-6 pb-3">
        {/* The period is the big heading; the page name is only read out by screen readers. */}
        <div className="flex min-w-0 flex-col">
          <h1 className="sr-only">Cash</h1>
          {view === "day" ? (
            <TitleStepper
              label={formatDay(day)}
              onPrevious={() => setDay(addDays(day, -1))}
              onNext={() => setDay(addDays(day, 1))}
              previousLabel="Previous day"
              nextLabel="Next day"
              popupLabel="Pick a day"
              popup={(close) => (
                <DayCalendar
                  value={day}
                  onPick={(chosen) => {
                    setDay(chosen);
                    close();
                  }}
                />
              )}
            />
          ) : (
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
          )}
        </div>
        <div className="flex items-center gap-3">
          <Switch
            label="Show a day or a month"
            value={view}
            onChange={switchTo}
            options={[
              { value: "day", label: "Day" },
              { value: "month", label: "Month" },
            ]}
          />
          {view === "day" ? (
            <ExportButtons
              disabled={!dayReport}
              onExcel={async () => void (dayReport && (await exportDay.excel(dayReport)))}
              onPdf={async () => void (dayReport && (await exportDay.pdf(dayReport)))}
            />
          ) : (
            <ExportButtons
              disabled={!monthReport || monthReport.days.length === 0}
              onExcel={async () => void (monthReport && (await exportMonth.excel(monthReport)))}
              onPdf={async () => void (monthReport && (await exportMonth.pdf(monthReport)))}
            />
          )}
        </div>
      </div>

      {view === "day" ? (
        <DayView day={day} />
      ) : (
        <MonthView
          month={month}
          onOpenDay={(chosen) => {
            setDay(chosen);
            setView("day");
          }}
        />
      )}
    </>
  );
}
