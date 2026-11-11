"use client";

import { useState } from "react";
import { Picker } from "@/components/picker";
import { formatDay, formatMoney, formatTime } from "@/lib/format";
import type { Expense } from "@/lib/reports";

/** An amount that can be negative: "400.00 MAD", "−940.00 MAD", or a dash when unknown. */
export function signedMoney(value: number | null) {
  if (value === null) return "—";
  return `${value < 0 ? "−" : ""}${formatMoney(Math.abs(value))}`;
}

type Stat = { label: string; value: string; note?: string; onOpen?: () => void };

const STAT_COLUMNS: Record<number, string> = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" };

/**
 * The top of the Cash page: one short dark strip with the headline number
 * on the left and a few supporting numbers in a row beside it.
 * On a phone the supporting numbers become compact lines under the headline.
 */
export function CashHero({ headline, stats }: { headline: Stat; stats: Stat[] }) {
  return (
    <section className="grid grid-cols-1 bg-ink text-paper lg:grid-cols-[1fr_auto]">
      <div className="flex flex-col justify-center gap-2 p-5 sm:px-8 sm:py-7">
        <span className="font-label text-base font-medium tracking-[0.14em] text-paper/60 uppercase sm:text-lg">
          {headline.label}
        </span>
        <span className="font-brand text-5xl leading-none whitespace-nowrap tabular-nums sm:text-6xl">{headline.value}</span>
        {headline.note && <span className="text-sm text-paper/60">{headline.note}</span>}
      </div>

      <div className={"grid grid-cols-1 border-t border-paper/15 lg:border-t-0 " + (STAT_COLUMNS[stats.length] ?? "sm:grid-cols-3")}>
        {stats.map((stat, index) => {
          const cellClass =
            // Phone: label and note on the left, the number on the right. Wider: stacked in a column.
            "grid min-w-0 grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 px-5 py-3 text-left " +
            "sm:flex sm:flex-col sm:items-start sm:justify-center sm:gap-1.5 sm:px-6 sm:py-6 lg:min-w-44 lg:border-l lg:border-paper/15 " +
            (index > 0 ? "border-t border-paper/15 sm:border-t-0 sm:border-l " : "");
          const content = (
            <>
              <span className="font-label text-sm font-medium tracking-[0.12em] text-paper/60 uppercase">{stat.label}</span>
              <span className="row-span-2 font-label text-2xl leading-none font-semibold whitespace-nowrap tabular-nums">
                {stat.value}
              </span>
              {stat.note ? (
                <span className="text-sm whitespace-nowrap text-paper/60">
                  {stat.note}
                  {stat.onOpen && <span aria-hidden="true"> ›</span>}
                </span>
              ) : (
                // Keeps the labels lined up next to a number that does have a note.
                <span className="hidden text-sm sm:block" aria-hidden="true">
                  &nbsp;
                </span>
              )}
            </>
          );
          // A number with more behind it (the notes and coins of a count) opens on tap.
          return stat.onOpen ? (
            <button
              key={stat.label}
              type="button"
              onClick={stat.onOpen}
              aria-label={`${stat.label}: see the notes and coins`}
              className={cellClass + "touch-manipulation hover:bg-paper/10 focus-visible:bg-paper/10 focus-visible:outline-none"}
            >
              {content}
            </button>
          ) : (
            <div key={stat.label} className={cellClass}>
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** A section's top line: a title (or a switch in its place) on the left, controls on the right. */
export function SectionHeading({ title, lead, children }: { title?: string; lead?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink pb-2">
      {lead ?? <h2 className="font-label text-2xl font-semibold tracking-[0.06em] uppercase">{title}</h2>}
      {children}
    </div>
  );
}

/** The expenses of a day or a month, with a filter by employee. `lead` replaces the title. */
export function ExpenseList({ expenses, showDay, lead }: { expenses: Expense[]; showDay: boolean; lead?: React.ReactNode }) {
  const [who, setWho] = useState("all");

  const names = [...new Set(expenses.map((expense) => expense.who))].sort();
  const filter = names.includes(who) ? who : "all";
  const shown = filter === "all" ? expenses : expenses.filter((expense) => expense.who === filter);
  const total = shown.reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading title="Expenses" lead={lead}>
        {names.length > 1 && (
          <Picker
            value={filter}
            onChange={setWho}
            options={[{ value: "all", label: "Everyone" }, ...names.map((name) => ({ value: name, label: name }))]}
          />
        )}
      </SectionHeading>

      {expenses.length === 0 && (
        <p className="text-ink/60">No cash was taken from the drawer {showDay ? "this month" : "on this day"}.</p>
      )}

      {shown.length > 0 && (
        <ul className="flex flex-col bg-white px-5">
          {shown.map((expense) => (
            <li key={expense.id} className="flex items-baseline justify-between gap-4 border-b border-dashed border-ink/20 py-3">
              <span className="flex min-w-0 flex-col">
                <span className="text-lg">{expense.reason}</span>
                <span className="text-sm text-ink/60">
                  {expense.who} · {showDay ? `${formatDay(expense.day)}, ` : ""}
                  {formatTime(expense.at)}
                </span>
              </span>
              <span className="shrink-0 font-label text-2xl font-semibold tabular-nums">{formatMoney(expense.amount)}</span>
            </li>
          ))}
          <li className="flex items-baseline justify-between gap-4 py-3">
            <span className="font-label text-lg font-semibold tracking-[0.1em] uppercase">
              Total{filter === "all" ? "" : ` · ${filter}`}
            </span>
            <span className="font-label text-2xl font-semibold tabular-nums">{formatMoney(total)}</span>
          </li>
        </ul>
      )}
    </section>
  );
}
