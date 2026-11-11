"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { shopToday } from "@/lib/format";

// Small calendars that open under a stepper, in the app's own style.
// Days are "YYYY-MM-DD" and months "YYYY-MM"; the maths is done in UTC.

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function shiftMonth(month: string, by: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + by, 1)).toISOString().slice(0, 7);
}

function monthTitle(month: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
}

/** The days of a month, with empty slots first so the 1st falls under its weekday (Monday first). */
function monthCells(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const blanks = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return [
    ...Array.from({ length: blanks }, () => null),
    ...Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`),
  ];
}

const arrowClass = "flex size-10 items-center justify-center hover:bg-ink hover:text-paper";
const footerClass =
  "mt-2 h-10 w-full border border-ink font-label text-base font-semibold tracking-[0.08em] uppercase hover:bg-ink hover:text-paper";

function cellClass(selected: boolean, current: boolean) {
  if (selected) return "bg-ink text-paper";
  return (current ? "font-semibold text-matcha ring-1 ring-sage ring-inset " : "") + "hover:bg-ink/10";
}

function Header({ title, onPrevious, onNext, unit }: { title: string; onPrevious: () => void; onNext: () => void; unit: string }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <button type="button" className={arrowClass} onClick={onPrevious} aria-label={`Previous ${unit}`}>
        <ChevronLeft className="size-5" aria-hidden="true" />
      </button>
      <span className="font-label text-lg font-semibold tracking-[0.08em] uppercase" aria-live="polite">
        {title}
      </span>
      <button type="button" className={arrowClass} onClick={onNext} aria-label={`Next ${unit}`}>
        <ChevronRight className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}

type DayCalendarProps = {
  /** The day the calendar opens on. */
  value: string;
  onPick: (day: string) => void;
  /** Which days show as chosen; by default only `value`. */
  isSelected?: (day: string) => boolean;
  /** The shortcut at the bottom, e.g. "Today" or "This week". */
  todayLabel?: string;
};

/** A month of days: tap one to jump to it. */
export function DayCalendar({ value, onPick, isSelected, todayLabel = "Today" }: DayCalendarProps) {
  const [month, setMonth] = useState(value.slice(0, 7));
  const today = shopToday();

  return (
    <div className="w-[17.5rem]">
      <Header title={monthTitle(month)} unit="month" onPrevious={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} />
      <div className="grid grid-cols-7 text-center tabular-nums">
        {WEEKDAYS.map((name, index) => (
          <span key={index} className="py-1 font-label text-sm tracking-[0.1em] text-ink/50" aria-hidden="true">
            {name}
          </span>
        ))}
        {monthCells(month).map((day, index) =>
          day === null ? (
            <span key={`blank-${index}`} />
          ) : (
            <button
              key={day}
              type="button"
              onClick={() => onPick(day)}
              aria-label={`${Number(day.slice(8))} ${monthTitle(month)}`}
              aria-pressed={isSelected ? isSelected(day) : day === value}
              className={"flex h-10 items-center justify-center text-base " + cellClass(isSelected ? isSelected(day) : day === value, day === today)}
            >
              {Number(day.slice(8))}
            </button>
          ),
        )}
      </div>
      <button type="button" className={footerClass} onClick={() => onPick(today)}>
        {todayLabel}
      </button>
    </div>
  );
}

/** A year of months: tap one to jump to it. */
export function MonthGrid({ value, onPick }: { value: string; onPick: (month: string) => void }) {
  const [year, setYear] = useState(Number(value.slice(0, 4)));
  const thisMonth = shopToday().slice(0, 7);

  return (
    <div className="w-[17.5rem]">
      <Header title={String(year)} unit="year" onPrevious={() => setYear(year - 1)} onNext={() => setYear(year + 1)} />
      <div className="grid grid-cols-3 gap-1">
        {MONTH_NAMES.map((name, index) => {
          const month = `${year}-${String(index + 1).padStart(2, "0")}`;
          return (
            <button
              key={month}
              type="button"
              onClick={() => onPick(month)}
              aria-label={monthTitle(month)}
              aria-pressed={month === value}
              className={"flex h-12 items-center justify-center text-base " + cellClass(month === value, month === thisMonth)}
            >
              {name}
            </button>
          );
        })}
      </div>
      <button type="button" className={footerClass} onClick={() => onPick(thisMonth)}>
        This month
      </button>
    </div>
  );
}
