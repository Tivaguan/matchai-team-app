"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Picker, Stepper } from "@/components/picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { shopToday } from "@/lib/format";
import { supabase } from "@/lib/supabase/client";
import {
  addDays,
  DEFAULT_FROM,
  DEFAULT_TO,
  formatWeekRange,
  mondayOf,
  shortDate,
  TIME_OPTIONS,
  trimTime,
  weekdayName,
  weekDays,
} from "@/lib/week";

type Employee = { id: string; name: string };
type Hours = { from: string; to: string };
type Availability = { notAvailable: boolean; hours: Hours | null };
type Shift = Hours & { id: string };

type WeekData = {
  employees: Employee[];
  /** Keyed by "employeeId|day". */
  availability: Map<string, Availability>;
  shifts: Map<string, Shift>;
  published: boolean;
};

type Editing = { employee: Employee; day: string; from: string; to: string; shiftId: string | null };

const cellKey = (employeeId: string, day: string) => `${employeeId}|${day}`;

async function loadWeek(weekStart: string): Promise<WeekData> {
  const weekEnd = addDays(weekStart, 6);
  const [employees, availability, shifts, week] = await Promise.all([
    supabase.from("employees").select("id, name").eq("active", true).order("name"),
    supabase
      .from("availability")
      .select("employee_id, day, not_available, from_time, to_time")
      .gte("day", weekStart)
      .lte("day", weekEnd),
    supabase.from("shifts").select("id, employee_id, day, from_time, to_time").gte("day", weekStart).lte("day", weekEnd),
    supabase.from("schedule_weeks").select("published").eq("week_start", weekStart).maybeSingle(),
  ]);
  if (employees.error) throw employees.error;
  if (availability.error) throw availability.error;
  if (shifts.error) throw shifts.error;
  if (week.error) throw week.error;

  return {
    employees: employees.data,
    availability: new Map(
      availability.data.map((row) => [
        cellKey(row.employee_id, row.day),
        {
          notAvailable: row.not_available,
          hours: row.from_time && row.to_time ? { from: trimTime(row.from_time), to: trimTime(row.to_time) } : null,
        },
      ]),
    ),
    shifts: new Map(
      shifts.data.map((row) => [
        cellKey(row.employee_id, row.day),
        { id: row.id, from: trimTime(row.from_time), to: trimTime(row.to_time) },
      ]),
    ),
    published: week.data?.published ?? false,
  };
}

export default function SchedulePage() {
  const queryClient = useQueryClient();
  // Opens on next week, the one being planned.
  const [weekStart, setWeekStart] = useState(() => addDays(mondayOf(shopToday()), 7));
  const [editing, setEditing] = useState<Editing | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const queryKey = ["admin", "schedule", weekStart];
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const { data, isPending, isError } = useQuery({ queryKey, queryFn: () => loadWeek(weekStart) });

  const saveShift = useMutation({
    mutationFn: async (shift: Editing) => {
      // One shift per person per day: replace whatever was there.
      const removed = await supabase.from("shifts").delete().eq("employee_id", shift.employee.id).eq("day", shift.day);
      if (removed.error) throw removed.error;
      const { error } = await supabase
        .from("shifts")
        .insert({ employee_id: shift.employee.id, day: shift.day, from_time: shift.from, to_time: shift.to });
      if (error) throw error;
    },
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
    onError: () => setFormError("Could not save the shift. Check your connection and try again."),
  });

  const removeShift = useMutation({
    mutationFn: async (shiftId: string) => {
      const { error } = await supabase.from("shifts").delete().eq("id", shiftId);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
    onError: () => setFormError("Could not remove the shift. Check your connection and try again."),
  });

  const setPublished = useMutation({
    mutationFn: async (published: boolean) => {
      const { error } = await supabase
        .from("schedule_weeks")
        .upsert({ week_start: weekStart, published, published_at: published ? new Date().toISOString() : null });
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const days = weekDays(weekStart);
  const answered = data
    ? data.employees.filter((employee) => days.some((day) => data.availability.has(cellKey(employee.id, day)))).length
    : 0;

  function openCell(employee: Employee, day: string) {
    if (!data) return;
    const shift = data.shifts.get(cellKey(employee.id, day));
    const free = data.availability.get(cellKey(employee.id, day))?.hours;
    setFormError(null);
    setEditing({
      employee,
      day,
      from: shift?.from ?? free?.from ?? DEFAULT_FROM,
      to: shift?.to ?? free?.to ?? DEFAULT_TO,
      shiftId: shift?.id ?? null,
    });
  }

  const editingAvailability = editing && data?.availability.get(cellKey(editing.employee.id, editing.day));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-3">
        <h1 className="font-serif text-5xl leading-none uppercase">Schedule</h1>
        <Stepper
          label={formatWeekRange(weekStart)}
          onPrevious={() => setWeekStart(addDays(weekStart, -7))}
          onNext={() => setWeekStart(addDays(weekStart, 7))}
          previousLabel="Previous week"
          nextLabel="Next week"
        />
      </div>

      {isPending && <p className="text-muted-foreground">Loading the week.</p>}
      {isError && <p className="text-destructive">Could not load the week. Check your connection and refresh.</p>}

      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-lg">
              <span className="font-medium">
                {answered} of {data.employees.length}
              </span>{" "}
              employees sent their availability.{" "}
              {data.published ? (
                <span className="bg-sage px-2 py-0.5 font-medium">Published</span>
              ) : (
                <span className="border border-ink/30 px-2 py-0.5 text-ink/70">Not published</span>
              )}
            </p>
            <Button
              className="h-11 px-5 text-base"
              variant={data.published ? "outline" : "default"}
              disabled={setPublished.isPending}
              onClick={() => setPublished.mutate(!data.published)}
            >
              {data.published ? "Unpublish" : "Publish this week"}
            </Button>
          </div>

          {data.employees.length === 0 && (
            <p className="text-lg text-muted-foreground">No employees yet. Add them on the Employees page first.</p>
          )}

          {data.employees.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-ink/30">
                    <th className="py-2 pr-3 font-label text-lg font-semibold tracking-[0.1em] uppercase">Employee</th>
                    {days.map((day) => (
                      <th key={day} className="px-1 py-2 font-label text-lg font-semibold tracking-[0.1em] uppercase">
                        {weekdayName(day).slice(0, 3)}
                        <span className="block text-sm font-normal tracking-normal text-ink/60 normal-case">
                          {shortDate(day)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.employees.map((employee) => (
                    <tr key={employee.id} className="border-b border-ink/15 align-top">
                      <th className="py-2 pr-3 font-label text-xl font-semibold tracking-[0.06em] uppercase">
                        {employee.name}
                      </th>
                      {days.map((day) => {
                        const availability = data.availability.get(cellKey(employee.id, day));
                        const shift = data.shifts.get(cellKey(employee.id, day));
                        return (
                          <td key={day} className="p-1">
                            <button
                              type="button"
                              onClick={() => openCell(employee, day)}
                              className={
                                "flex min-h-20 w-full flex-col justify-between gap-1 rounded-md border p-2 text-left " +
                                (shift ? "border-ink bg-ink text-paper" : "border-ink/20 bg-white hover:border-ink/60")
                              }
                            >
                              <span className={"text-xs " + (shift ? "text-paper/70" : "text-ink/60")}>
                                {!availability && "No answer"}
                                {availability?.notAvailable && "Not free"}
                                {availability?.hours && `Free ${availability.hours.from}–${availability.hours.to}`}
                              </span>
                              <span className="text-sm font-semibold tabular-nums">
                                {shift ? `${shift.from}–${shift.to}` : <span className="font-normal text-ink/40">Add shift</span>}
                              </span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col gap-1 border-t border-ink/20 pt-4 text-sm text-ink/70">
            <p className="font-medium text-ink">Links to share in the staff WhatsApp group</p>
            <p className="select-all">Availability: {origin}/availability</p>
            <p className="select-all">Schedule: {origin}/schedule</p>
          </div>
        </>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.employee.name}, {editing && weekdayName(editing.day)} {editing && shortDate(editing.day)}
            </DialogTitle>
            <DialogDescription>
              {!editingAvailability && "No availability sent for this day."}
              {editingAvailability?.notAvailable && "Said they are not free this day."}
              {editingAvailability?.hours &&
                `Free from ${editingAvailability.hours.from} to ${editingAvailability.hours.to}.`}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (editing && editing.from < editing.to) saveShift.mutate(editing);
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="shift-from">Works from</Label>
                <Picker
                  id="shift-from"
                  className="w-full"
                  value={editing?.from ?? DEFAULT_FROM}
                  onChange={(from) => setEditing((current) => current && { ...current, from })}
                  options={TIME_OPTIONS}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="shift-to">To</Label>
                <Picker
                  id="shift-to"
                  className="w-full"
                  value={editing?.to ?? DEFAULT_TO}
                  onChange={(to) => setEditing((current) => current && { ...current, to })}
                  options={TIME_OPTIONS}
                />
              </div>
            </div>
            {editing && editing.from >= editing.to && (
              <p className="text-sm text-destructive">The end must be after the start.</p>
            )}
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              {editing?.shiftId && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 px-5 text-base"
                  disabled={removeShift.isPending}
                  onClick={() => editing.shiftId && removeShift.mutate(editing.shiftId)}
                >
                  Remove shift
                </Button>
              )}
              <Button
                type="submit"
                className="h-11 px-5 text-base"
                disabled={!editing || editing.from >= editing.to || saveShift.isPending}
              >
                Save shift
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
