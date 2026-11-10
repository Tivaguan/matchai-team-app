"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PublicShell } from "@/components/public-shell";
import { supabase } from "@/lib/supabase/client";
import { useShopToday } from "@/lib/use-shop-today";
import { addDays, formatWeekRange, mondayOf, shortDate, weekdayName, weekDays } from "@/lib/week";

type Shift = { name: string; day: string; from: string; to: string };
type Schedule = { published: boolean; shifts: Shift[] };

const labelClass = "font-label font-semibold tracking-[0.06em] uppercase";
const noteClass = "font-label font-medium tracking-[0.14em] uppercase";

export default function SchedulePage() {
  const today = useShopToday();
  const [which, setWhich] = useState<"this" | "next">("this");
  const weekStart = today ? addDays(mondayOf(today), which === "this" ? 0 : 7) : null;

  const schedule = useQuery({
    queryKey: ["public-schedule", weekStart],
    enabled: weekStart !== null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_published_schedule", { p_week_start: weekStart! });
      if (error) throw error;
      return data as Schedule;
    },
  });

  return (
    <PublicShell title="Schedule">
      <div className="grid grid-cols-2 gap-1.5 border-t border-paper/25 pt-4">
        {(["this", "next"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={which === option}
            onClick={() => setWhich(option)}
            className={
              `${labelClass} h-12 touch-manipulation text-xl select-none ` +
              (which === option ? "bg-paper text-ink" : "border border-paper/40 text-paper")
            }
          >
            {option === "this" ? "This week" : "Next week"}
          </button>
        ))}
      </div>

      {weekStart && <p className={`${noteClass} text-lg text-paper/60`}>Week of {formatWeekRange(weekStart)}</p>}

      {(schedule.isPending || !weekStart) && <p className={`${noteClass} text-lg text-paper/60`}>Loading</p>}
      {schedule.isError && <p className={`${noteClass} text-lg text-paper/60`}>No connection · try again</p>}

      {schedule.data && !schedule.data.published && (
        <section className="flex flex-col gap-3">
          <h1 className="font-serif text-4xl leading-none uppercase">Not published yet</h1>
          <p className="text-lg text-paper/80">The schedule for this week will show here once it is ready.</p>
        </section>
      )}

      {schedule.data?.published && weekStart && (
        <ul className="flex flex-col gap-1.5">
          {weekDays(weekStart).map((day) => {
            const shifts = schedule.data.shifts.filter((shift) => shift.day === day);
            return (
              <li key={day} className={"flex flex-col gap-2 p-4 text-ink " + (day === today ? "bg-sage" : "bg-paper")}>
                <div className="flex items-baseline justify-between gap-3 border-b border-ink/40 pb-1">
                  <span className={`${labelClass} text-2xl`}>{weekdayName(day)}</span>
                  <span className="text-sm text-ink/70">
                    {shortDate(day)}
                    {day === today ? " · today" : ""}
                  </span>
                </div>
                {shifts.length === 0 && <p className="text-ink/60">Nobody scheduled</p>}
                {shifts.map((shift) => (
                  <p key={`${shift.name}-${shift.from}`} className="flex items-baseline justify-between gap-3 text-lg">
                    <span className="font-medium">{shift.name}</span>
                    <span className="tabular-nums">
                      {shift.from} – {shift.to}
                    </span>
                  </p>
                ))}
              </li>
            );
          })}
        </ul>
      )}
    </PublicShell>
  );
}
