"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PinPad } from "@/components/counter/pin-pad";
import { Picker } from "@/components/picker";
import { PublicShell } from "@/components/public-shell";
import { formatTime } from "@/lib/format";
import { supabase } from "@/lib/supabase/client";
import { useShopToday } from "@/lib/use-shop-today";
import {
  addDays,
  DEFAULT_FROM,
  DEFAULT_TO,
  formatWeekRange,
  mondayOf,
  shortDate,
  TIME_OPTIONS,
  weekdayName,
  weekDays,
} from "@/lib/week";

type Employee = { id: string; name: string };
type DayAnswer = { day: string; free: boolean; from: string; to: string };

type LoadResult =
  | { ok: true; published: boolean; days: { day: string; not_available: boolean; from: string | null; to: string | null }[] }
  | { ok: false; error: string; tries_left?: number; locked_until?: string };

const labelClass = "font-label font-semibold tracking-[0.06em] uppercase";
const noteClass = "font-label font-medium tracking-[0.14em] uppercase";
const primaryClass = `${labelClass} h-14 w-full touch-manipulation bg-paper text-2xl text-ink select-none active:bg-sage disabled:opacity-50`;

function pinMessage(result: Extract<LoadResult, { ok: false }>) {
  if (result.error === "wrong_pin") {
    return result.tries_left === 1 ? "Wrong PIN · 1 try left" : `Wrong PIN · ${result.tries_left} tries left`;
  }
  if (result.error === "locked" && result.locked_until) {
    return `Locked until ${formatTime(result.locked_until)} · ask an owner`;
  }
  return "Ask an owner to set your PIN";
}

export default function AvailabilityPage() {
  const today = useShopToday();
  // Staff always answer for the week that starts next Monday.
  const weekStart = today ? addDays(mondayOf(today), 7) : null;

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [answers, setAnswers] = useState<DayAnswer[] | null>(null);
  const [published, setPublished] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [padKey, setPadKey] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);

  const roster = useQuery({
    queryKey: ["availability-roster"],
    queryFn: async (): Promise<Employee[]> => {
      const { data, error } = await supabase.rpc("get_availability_roster");
      if (error) throw error;
      return data.map((row) => ({ id: row.employee_id, name: row.employee_name }));
    },
  });

  const load = useMutation({
    mutationFn: async (input: { employeeId: string; pin: string; weekStart: string }) => {
      const { data, error } = await supabase.rpc("get_my_availability", {
        p_employee_id: input.employeeId,
        p_pin: input.pin,
        p_week_start: input.weekStart,
      });
      if (error) throw error;
      return data as LoadResult;
    },
    onSuccess: (result, input) => {
      if (!result.ok) {
        setPinError(pinMessage(result));
        setPadKey((key) => key + 1);
        return;
      }
      // Start from "not available" every day, then fill in what was saved before.
      const savedDays = new Map(result.days.map((row) => [row.day, row]));
      setAnswers(
        weekDays(input.weekStart).map((day) => {
          const row = savedDays.get(day);
          const free = row ? !row.not_available : false;
          return { day, free, from: row?.from ?? DEFAULT_FROM, to: row?.to ?? DEFAULT_TO };
        }),
      );
      setPublished(result.published);
      setPin(input.pin);
    },
    onError: () => {
      setPinError("No connection · try again");
      setPadKey((key) => key + 1);
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("save_availability", {
        p_employee_id: employee!.id,
        p_pin: pin!,
        p_week_start: weekStart!,
        p_days: answers!.map((answer) =>
          answer.free
            ? { day: answer.day, not_available: false, from: answer.from, to: answer.to }
            : { day: answer.day, not_available: true },
        ),
      });
      if (error) throw error;
      return data as { ok: boolean; error?: string };
    },
    onSuccess: (result) => {
      if (result.ok) {
        setSaved(true);
      } else if (result.error === "week_published") {
        setPublished(true);
      } else if (result.error === "invalid_hours") {
        setSaveError("Check your hours: the end must be after the start.");
      } else {
        setSaveError("Could not save. Go back and try again.");
      }
    },
    onError: () => setSaveError("No connection. Try again."),
  });

  function update(day: string, change: Partial<DayAnswer>) {
    setAnswers((current) => current?.map((answer) => (answer.day === day ? { ...answer, ...change } : answer)) ?? null);
    setSaveError(null);
  }

  function startOver() {
    setEmployee(null);
    setPin(null);
    setAnswers(null);
    setSaved(false);
    setPinError(null);
    setSaveError(null);
  }

  const hoursValid = answers?.every((answer) => !answer.free || answer.from < answer.to) ?? false;

  return (
    <PublicShell title="Availability">
      {weekStart && (
        <p className={`${noteClass} border-t border-paper/25 pt-3 text-lg text-paper/60`}>
          Week of {formatWeekRange(weekStart)}
        </p>
      )}

      {/* Step 1: who are you */}
      {!employee && (
        <section className="flex flex-col gap-5">
          <h1 className="font-serif text-5xl leading-none uppercase">Who are you?</h1>
          {roster.isPending && <p className={`${noteClass} text-lg text-paper/60`}>Loading</p>}
          {roster.isError && <p className={`${noteClass} text-lg text-paper/60`}>No connection · try again</p>}
          <div className="grid grid-cols-2 gap-1.5">
            {roster.data?.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setEmployee(item)}
                className={`${labelClass} h-20 touch-manipulation bg-paper px-3 text-2xl text-ink select-none active:bg-sage`}
              >
                {item.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Step 2: PIN */}
      {employee && !answers && (
        <section className="flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={startOver}
            className={`${labelClass} flex h-12 items-center gap-2 self-start border border-paper/40 px-4 text-lg select-none active:bg-paper active:text-ink`}
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
            Back
          </button>
          <h1 className="text-center font-serif text-5xl leading-none uppercase">Hi {employee.name}</h1>
          <PinPad
            key={padKey}
            shuffle={false}
            disabled={load.isPending || !weekStart}
            error={pinError}
            onComplete={(entered) => weekStart && load.mutate({ employeeId: employee.id, pin: entered, weekStart })}
          />
        </section>
      )}

      {/* Step 3: the week */}
      {employee && answers && published && (
        <section className="flex flex-col gap-5">
          <h1 className="font-serif text-4xl leading-none uppercase">The schedule is out</h1>
          <p className="text-lg text-paper/80">
            This week is already planned, so your availability can no longer be changed. Talk to an owner if something
            came up.
          </p>
          <Link href="/schedule" className={`${primaryClass} flex items-center justify-center`}>
            See the schedule
          </Link>
        </section>
      )}

      {employee && answers && !published && saved && (
        <section className="flex flex-col gap-5">
          <h1 className="font-serif text-5xl leading-none uppercase">Saved</h1>
          <p className="text-lg text-paper/80">
            Thanks {employee.name}. You can change your answers until the schedule is published.
          </p>
          <button type="button" className={primaryClass} onClick={() => setSaved(false)}>
            Change my answers
          </button>
          <button
            type="button"
            onClick={startOver}
            className={`${labelClass} h-14 border border-paper/40 text-xl select-none active:bg-paper active:text-ink`}
          >
            Done
          </button>
        </section>
      )}

      {employee && answers && !published && !saved && (
        <section className="flex flex-col gap-4">
          <h1 className="font-serif text-4xl leading-none uppercase">When are you free, {employee.name}?</h1>

          <ul className="flex flex-col gap-1.5">
            {answers.map((answer) => (
              <li key={answer.day} className="flex flex-col gap-3 bg-paper p-4 text-ink">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex flex-col">
                    <span className={`${labelClass} text-xl leading-none`}>{weekdayName(answer.day)}</span>
                    <span className="text-sm text-ink/60">{shortDate(answer.day)}</span>
                  </span>
                  <div className="grid shrink-0 grid-cols-2 gap-1" role="group" aria-label={`${weekdayName(answer.day)} availability`}>
                    {[
                      { free: true, label: "Free" },
                      { free: false, label: "Not free" },
                    ].map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        aria-pressed={answer.free === option.free}
                        onClick={() => update(answer.day, { free: option.free })}
                        className={
                          `${labelClass} h-11 touch-manipulation px-2.5 text-base whitespace-nowrap select-none ` +
                          (answer.free === option.free ? "bg-ink text-paper" : "border border-ink/30 text-ink/60")
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {answer.free && (
                  <div className="flex items-center gap-3">
                    <Picker
                      className="min-w-0 flex-1"
                      value={answer.from}
                      onChange={(from) => update(answer.day, { from })}
                      options={TIME_OPTIONS}
                    />
                    <span className={`${noteClass} text-base text-ink/60`}>to</span>
                    <Picker
                      className="min-w-0 flex-1"
                      value={answer.to}
                      onChange={(to) => update(answer.day, { to })}
                      options={TIME_OPTIONS}
                    />
                  </div>
                )}
                {answer.free && answer.from >= answer.to && (
                  <p className="text-sm font-medium text-destructive">The end must be after the start.</p>
                )}
              </li>
            ))}
          </ul>

          {saveError && <p className="text-base font-medium text-destructive">{saveError}</p>}
          <button type="button" className={primaryClass} disabled={!hoursValid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving" : "Save my availability"}
          </button>
        </section>
      )}
    </PublicShell>
  );
}
