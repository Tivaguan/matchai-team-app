"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Link2, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DayCalendar } from "@/components/date-popups";
import { IconMenu, Picker, TitleStepper } from "@/components/picker";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { shopToday } from "@/lib/format";
import { supabase } from "@/lib/supabase/client";
import {
  addDays,
  barPosition,
  DEFAULT_FROM,
  DEFAULT_TO,
  fitsIn,
  formatPeriods,
  formatWeekRange,
  hoursOf,
  MAX_SHIFT_PERIODS,
  mondayOf,
  nextPeriod,
  type Period,
  periodsProblem,
  shortDate,
  TIME_OPTIONS,
  toMinutes,
  trimTime,
  uncovered,
  weekdayName,
  weekDays,
} from "@/lib/week";

// The team on one page: one timeline per day, with one row per employee.
// Green is when they said they are free, black is the shift, red is open hours with nobody.
// Tapping a row sets the shift; the Team card manages the employees.

type Employee = { id: string; name: string; active: boolean; lockedUntil: string | null };
type Availability = { notAvailable: boolean; periods: Period[] };
type Shift = Period & { id: string };

type WeekData = {
  /** Keyed by "employeeId|day". */
  availability: Map<string, Availability>;
  shifts: Map<string, Shift[]>;
  published: boolean;
};

/** One or two periods for one person on one day. `hasShift` is true when something is already saved. */
type ShiftForm = { employee: Employee; day: string; periods: Period[]; hasShift: boolean };
/** `id` is null while adding someone new. An empty PIN keeps the current one. */
type EmployeeForm = { id: string | null; name: string; pin: string };

/** One day of the week: when the shop needs someone, or closed. Index 0 is Monday. */
type OpenDay = { closed: boolean; from: string; to: string };

const HOURS_KEY = ["admin", "opening-hours"] as const;

async function loadOpeningHours(): Promise<OpenDay[]> {
  const { data, error } = await supabase.from("opening_hours").select("weekday, closed, open_from, open_to").order("weekday");
  if (error) throw error;
  return data.map((row) => ({ closed: row.closed, from: trimTime(row.open_from), to: trimTime(row.open_to) }));
}

const EMPLOYEES_KEY = ["admin", "employees"] as const;
const PIN_PATTERN = /^[0-9]{4}$/;
const cellKey = (employeeId: string, day: string) => `${employeeId}|${day}`;

async function loadEmployees(): Promise<Employee[]> {
  const [employees, status] = await Promise.all([
    supabase.from("employees").select("id, name, active").order("name"),
    supabase.rpc("employee_pin_status"),
  ]);
  if (employees.error) throw employees.error;
  if (status.error) throw status.error;

  const locks = new Map(status.data.map((row) => [row.employee_id, row.locked_until]));
  return employees.data.map((employee) => ({ ...employee, lockedUntil: locks.get(employee.id) ?? null }));
}

async function loadWeek(weekStart: string): Promise<WeekData> {
  const weekEnd = addDays(weekStart, 6);
  const [availability, shifts, week] = await Promise.all([
    supabase
      .from("availability")
      .select("employee_id, day, not_available, from_time, to_time")
      .gte("day", weekStart)
      .lte("day", weekEnd),
    supabase.from("shifts").select("id, employee_id, day, from_time, to_time").gte("day", weekStart).lte("day", weekEnd),
    supabase.from("schedule_weeks").select("published").eq("week_start", weekStart).maybeSingle(),
  ]);
  if (availability.error) throw availability.error;
  if (shifts.error) throw shifts.error;
  if (week.error) throw week.error;

  // Someone can be free in up to three periods of a day, and work in up to two.
  const availabilityByCell = new Map<string, Availability>();
  for (const row of availability.data) {
    const key = cellKey(row.employee_id, row.day);
    const cell = availabilityByCell.get(key) ?? { notAvailable: false, periods: [] };
    if (row.not_available) cell.notAvailable = true;
    if (row.from_time && row.to_time) cell.periods.push({ from: trimTime(row.from_time), to: trimTime(row.to_time) });
    availabilityByCell.set(key, cell);
  }
  const shiftsByCell = new Map<string, Shift[]>();
  for (const row of shifts.data) {
    const key = cellKey(row.employee_id, row.day);
    shiftsByCell.set(key, [
      ...(shiftsByCell.get(key) ?? []),
      { id: row.id, from: trimTime(row.from_time), to: trimTime(row.to_time) },
    ]);
  }
  const byStart = (a: Period, b: Period) => a.from.localeCompare(b.from);
  for (const cell of availabilityByCell.values()) cell.periods.sort(byStart);
  for (const list of shiftsByCell.values()) list.sort(byStart);

  return { availability: availabilityByCell, shifts: shiftsByCell, published: week.data?.published ?? false };
}

export default function TeamPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  // Opens on next week, the one being planned.
  const [weekStart, setWeekStart] = useState(() => addDays(mondayOf(shopToday()), 7));
  const [shiftForm, setShiftForm] = useState<ShiftForm | null>(null);
  // Open or closed is kept apart from the form, so the dialog keeps its content while it closes.
  const [shiftOpen, setShiftOpen] = useState(false);
  const [employeeForm, setEmployeeForm] = useState<EmployeeForm | null>(null);
  // Kept apart from the form so the title does not change while the dialog closes.
  const [employeeTitle, setEmployeeTitle] = useState("Add employee");
  const [formError, setFormError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const weekKey = ["admin", "schedule", weekStart];
  const refreshWeek = () => queryClient.invalidateQueries({ queryKey: weekKey });
  const refreshEmployees = () => queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEY });

  const employees = useQuery({ queryKey: EMPLOYEES_KEY, queryFn: loadEmployees });
  const openingHours = useQuery({ queryKey: HOURS_KEY, queryFn: loadOpeningHours });
  // The opening hours being edited; null while the dialog has never been opened.
  const [hoursForm, setHoursForm] = useState<OpenDay[] | null>(null);
  const [hoursOpen, setHoursOpen] = useState(false);

  const saveHours = useMutation({
    mutationFn: async (form: OpenDay[]) => {
      const results = await Promise.all(
        form.map((day, index) =>
          supabase
            .from("opening_hours")
            .update({ closed: day.closed, open_from: day.from, open_to: day.to })
            .eq("weekday", index + 1),
        ),
      );
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: () => {
      setHoursOpen(false);
      queryClient.invalidateQueries({ queryKey: HOURS_KEY });
      toast.show("Opening hours saved.");
    },
    onError: () => setFormError("Could not save the hours. Check your connection and try again."),
  });
  const week = useQuery({ queryKey: weekKey, queryFn: () => loadWeek(weekStart) });

  const saveShift = useMutation({
    mutationFn: async (shift: ShiftForm) => {
      // Replace whatever this person had that day with the one or two periods of the form.
      const removed = await supabase.from("shifts").delete().eq("employee_id", shift.employee.id).eq("day", shift.day);
      if (removed.error) throw removed.error;
      const { error } = await supabase.from("shifts").insert(
        shift.periods.map((period) => ({
          employee_id: shift.employee.id,
          day: shift.day,
          from_time: period.from,
          to_time: period.to,
        })),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      setShiftOpen(false);
      refreshWeek();
    },
    onError: () => setFormError("Could not save the shift. Check your connection and try again."),
  });

  const removeShift = useMutation({
    mutationFn: async (shift: ShiftForm) => {
      const { error } = await supabase.from("shifts").delete().eq("employee_id", shift.employee.id).eq("day", shift.day);
      if (error) throw error;
    },
    onSuccess: () => {
      setShiftOpen(false);
      refreshWeek();
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
    onSuccess: (_data, published) => {
      refreshWeek();
      toast.show(published ? "Published. The staff can now see this week." : "Unpublished. This week is hidden from the staff.");
    },
    onError: () => toast.show("Could not change it. Check your connection and try again."),
  });

  const saveEmployee = useMutation({
    mutationFn: async (form: EmployeeForm) => {
      const name = form.name.trim();
      if (form.id === null) {
        const { error } = await supabase.rpc("create_employee", { p_name: name, p_pin: form.pin });
        if (error) throw error;
        return;
      }
      const renamed = await supabase.from("employees").update({ name }).eq("id", form.id);
      if (renamed.error) throw renamed.error;
      if (form.pin !== "") {
        const { error } = await supabase.rpc("set_employee_pin", { p_employee_id: form.id, p_new_pin: form.pin });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setEmployeeForm(null);
      refreshEmployees();
    },
    onError: () => setFormError("Could not save. Check your connection and try again."),
  });

  const unlock = useMutation({
    mutationFn: async (employeeId: string) => {
      const { error } = await supabase.rpc("unlock_employee", { p_employee_id: employeeId });
      if (error) throw error;
    },
    onSuccess: () => {
      setEmployeeForm(null);
      refreshEmployees();
    },
  });

  const setActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("employees").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEmployeeForm(null);
      refreshEmployees();
    },
  });

  const days = weekDays(weekStart);
  const today = shopToday();
  const canPublish = addDays(weekStart, 6) >= today;
  const active = employees.data?.filter((employee) => employee.active) ?? [];
  const inactive = employees.data?.filter((employee) => !employee.active) ?? [];
  const editedEmployee = employees.data?.find((employee) => employee.id === employeeForm?.id) ?? null;
  const shiftAvailability = shiftForm && week.data?.availability.get(cellKey(shiftForm.employee.id, shiftForm.day));
  const shiftProblem = shiftForm ? periodsProblem(shiftForm.periods) : null;
  const shiftOutside = shiftForm?.periods.some((period) => !fitsIn(period, shiftAvailability?.periods ?? [])) ?? false;

  function weekHours(employeeId: string) {
    return hoursOf(days.flatMap((day) => week.data?.shifts.get(cellKey(employeeId, day)) ?? []));
  }

  // A new employee needs a name and a PIN; an existing one may keep its PIN.
  const employeeReady =
    employeeForm !== null &&
    employeeForm.name.trim() !== "" &&
    (PIN_PATTERN.test(employeeForm.pin) || (employeeForm.id !== null && employeeForm.pin === ""));

  /** `at` is the time of day that was tapped, in minutes. */
  function openShift(employee: Employee, day: string, at: number) {
    if (!week.data) return;
    const shifts = week.data.shifts.get(cellKey(employee.id, day)) ?? [];
    const free = week.data.availability.get(cellKey(employee.id, day))?.periods ?? [];
    setFormError(null);
    // Start from the shifts already given, else from the free period that was tapped, else the first one.
    const tapped = free.find((period) => toMinutes(period.from) <= at && at <= toMinutes(period.to));
    const periods =
      shifts.length > 0
        ? shifts.map(({ from, to }) => ({ from, to }))
        : [tapped ?? free[0] ?? { from: DEFAULT_FROM, to: DEFAULT_TO }];
    setShiftForm({ employee, day, periods, hasShift: shifts.length > 0 });
    setShiftOpen(true);
  }

  function setShiftPeriod(index: number, change: Partial<Period>) {
    setShiftForm(
      (current) =>
        current && {
          ...current,
          periods: current.periods.map((period, position) => (position === index ? { ...period, ...change } : period)),
        },
    );
  }

  function openEmployee(employee?: Employee) {
    setFormError(null);
    setEmployeeTitle(employee ? "Edit employee" : "Add employee");
    setEmployeeForm({ id: employee?.id ?? null, name: employee?.name ?? "", pin: "" });
  }

  async function copyLink(path: string) {
    try {
      await navigator.clipboard.writeText(`${origin}${path}`);
      toast.show("Link copied.");
    } catch {
      toast.show(`Could not copy. The link is ${origin}${path}`);
    }
  }

  // Each day shows only its own open hours, stretched when a shift starts earlier or ends later.
  // A closed day borrows the widest hours of the open days.
  const openDays = (openingHours.data ?? []).filter((day) => !day.closed);
  const fallback = openDays.length > 0 ? openDays : [{ from: DEFAULT_FROM, to: DEFAULT_TO }];
  function axisFor(open: Period | null, dayShifts: Period[]) {
    const shown = dayShifts.concat(open ? [open] : fallback);
    const start = Math.min(...shown.map((period) => toMinutes(period.from)));
    const end = Math.max(...shown.map((period) => toMinutes(period.to)));
    // The whole hours inside, for the numbers on top and the faint lines.
    const ticks: number[] = [];
    for (let minutes = Math.ceil(start / 60) * 60; minutes <= end; minutes += 60) ticks.push(minutes);
    return { start, end, ticks, at: (minutes: number) => `${((minutes - start) / (end - start)) * 100}%` };
  }
  const hoursProblem = hoursForm?.some((day) => !day.closed && day.from >= day.to) ?? false;
  const rowGrid = "grid grid-cols-[6.5rem_minmax(0,1fr)] sm:grid-cols-[7.5rem_minmax(0,1fr)]";
  const barText = "absolute inset-y-1.5 flex items-center overflow-hidden pl-2 whitespace-nowrap tabular-nums";

  const linkClass = "self-start text-base text-ink/70 underline underline-offset-4 hover:text-ink";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-ink pt-6 pb-3 sm:items-end">
        {/* The week is the big heading; the page name is only read out by screen readers.
            On a phone this group dissolves: the week takes the first line, and the
            state word sits on the second line, left of the buttons. */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 max-sm:contents">
          <h1 className="sr-only">Team</h1>
          <TitleStepper
            label={formatWeekRange(weekStart)}
            onPrevious={() => setWeekStart(addDays(weekStart, -7))}
            onNext={() => setWeekStart(addDays(weekStart, 7))}
            previousLabel="Previous week"
            nextLabel="Next week"
            popupLabel="Pick a week"
            popup={(close) => (
              <DayCalendar
                value={weekStart}
                isSelected={(day) => mondayOf(day) === weekStart}
                todayLabel="This week"
                onPick={(chosen) => {
                  setWeekStart(mondayOf(chosen));
                  close();
                }}
              />
            )}
          />
          {/* One handwritten word, no box or dot: green once the staff can see the week. */}
          {week.data && canPublish && (
            <span className={"font-hand text-[1.6rem] leading-none font-bold sm:text-4xl " + (week.data.published ? "text-matcha" : "text-ink/50")}>
              {week.data.published ? "Published" : "Draft"}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            aria-label="Opening hours"
            title="Opening hours"
            disabled={!openingHours.data}
            onClick={() => {
              setFormError(null);
              setHoursForm(openingHours.data ?? null);
              setHoursOpen(true);
            }}
            className="flex size-11 items-center justify-center border border-ink/30 bg-white hover:bg-ink hover:text-paper disabled:opacity-50"
          >
            <Clock className="size-5" aria-hidden="true" />
          </button>
          <IconMenu
            label="Copy a link for the staff group"
            icon={<Link2 className="size-5" aria-hidden="true" />}
            items={[
              { label: "Copy availability link", onSelect: () => copyLink("/availability") },
              { label: "Copy schedule link", onSelect: () => copyLink("/schedule") },
            ]}
          />
          {/* The button says what tapping it will do; the state sits beside the week. Past weeks have nothing to publish. */}
          {week.data && canPublish && (
            <>
              <button
                type="button"
                disabled={setPublished.isPending}
                onClick={() => setPublished.mutate(!week.data.published)}
                className={
                  "flex h-11 items-center border px-3 font-label text-base font-semibold tracking-[0.06em] uppercase disabled:opacity-50 sm:px-5 sm:text-lg " +
                  (week.data.published
                    ? "border-ink/30 bg-white hover:bg-ink hover:text-paper"
                    : "border-ink bg-ink text-paper hover:bg-sage hover:text-ink")
                }
              >
                {week.data.published ? "Unpublish" : "Publish"}
              </button>
            </>
          )}
        </div>
      </div>

      {(employees.isPending || week.isPending || openingHours.isPending) && <p className="text-muted-foreground">Loading the week.</p>}
      {(employees.isError || week.isError || openingHours.isError) && (
        <p className="text-destructive">Could not load the week. Check your connection and refresh.</p>
      )}

      {employees.data && week.data && openingHours.data && (
        <div className="grid gap-4 lg:grid-cols-2">
          {days.map((day, dayIndex) => {
            const dayShifts = active.flatMap((employee) => week.data.shifts.get(cellKey(employee.id, day)) ?? []);
            const hours = openingHours.data[dayIndex];
            const open = hours && !hours.closed ? { from: hours.from, to: hours.to } : null;
            const gaps = uncovered(dayShifts, open);
            const axis = axisFor(open, dayShifts);
            const place = (period: Period) => barPosition(period, axis.start, axis.end);
            return (
              <section key={day} className="bg-white">
                {/* The day, and the hours across. */}
                <div className={`${rowGrid} border-b border-ink/30`}>
                  <h2 className="py-2.5 pl-4 font-label text-lg font-semibold tracking-[0.08em] uppercase">
                    {weekdayName(day).slice(0, 3)} <span className="tabular-nums">{Number(day.slice(8))}</span>
                  </h2>
                  <div className="relative mr-5" aria-hidden="true">
                    {axis.ticks.map((minutes, index) => (
                      <span
                        key={minutes}
                        style={{ left: axis.at(minutes) }}
                        className={
                          "absolute bottom-2.5 -translate-x-1/2 text-xs text-ink/50 tabular-nums " +
                          (index % 2 === 1 ? "hidden sm:block" : "")
                        }
                      >
                        {minutes / 60}
                      </span>
                    ))}
                    {/* The open hours as a thin line: green where someone works, red where nobody does yet. */}
                    {open && <span className="absolute bottom-0 h-1 bg-matcha" style={place(open)} />}
                    {gaps.map((gap) => (
                      <span key={gap.from} className="absolute bottom-0 h-1 bg-destructive" style={place(gap)} />
                    ))}
                  </div>
                </div>

                {active.map((employee) => {
                  const availability = week.data.availability.get(cellKey(employee.id, day));
                  const free = availability?.periods ?? [];
                  const shifts = week.data.shifts.get(cellKey(employee.id, day)) ?? [];
                  const working = shifts.length > 0;
                  const answer = !availability ? "no answer" : free.length === 0 ? "not free" : `free ${formatPeriods(free)}`;
                  const outside = shifts.some((shift) => !fitsIn(shift, free));
                  return (
                    <button
                      key={employee.id}
                      type="button"
                      onClick={(event) => {
                        const lane = event.currentTarget.querySelector("[data-lane]")?.getBoundingClientRect();
                        const at = lane ? axis.start + ((event.clientX - lane.left) / lane.width) * (axis.end - axis.start) : 0;
                        openShift(employee, day, at);
                      }}
                      aria-label={`${employee.name}, ${weekdayName(day)} ${shortDate(day)}: ${
                        working ? `works ${formatPeriods(shifts)}` : "no shift"
                      }, ${answer}.${outside ? " The shift is outside their free hours." : ""}`}
                      className={`${rowGrid} w-full items-center border-b border-dashed border-ink/15 text-left hover:bg-ink/5`}
                    >
                      <span className="truncate pl-4 font-label text-base font-semibold tracking-[0.06em] uppercase">
                        {employee.name}
                      </span>
                      <span data-lane className="relative mr-5 block h-10">
                        {axis.ticks.map((minutes) => (
                          <span key={minutes} className="absolute inset-y-0 w-px bg-ink/[0.08]" style={{ left: axis.at(minutes) }} />
                        ))}
                        {!availability && (
                          <span className="absolute inset-y-0 left-2 flex items-center text-xs text-ink/40">No answer</span>
                        )}
                        {availability && free.length === 0 && (
                          <span className="absolute inset-x-0 inset-y-1.5 flex items-center bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(0_0_0/0.06)_6px_12px)] pl-2 text-xs text-ink/50">
                            Not free
                          </span>
                        )}
                        {free.map((period) => (
                          <span
                            key={`free-${period.from}`}
                            className={`${barText} border-x border-matcha/60 bg-matcha/20 text-xs text-ink/70`}
                            style={place(period)}
                          >
                            {!working && `${period.from}–${period.to}`}
                          </span>
                        ))}
                        {shifts.map((shift) => (
                          <span
                            key={shift.id}
                            className={
                              `${barText} bg-ink font-label text-sm font-semibold text-paper ` +
                              (fitsIn(shift, free) ? "" : "ring-2 ring-destructive ring-inset")
                            }
                            style={place(shift)}
                          >
                            {shift.from}–{shift.to}
                          </span>
                        ))}
                      </span>
                    </button>
                  );
                })}

                {/* A sentence, not a row, so it does not read as one more employee. */}
                <p
                  className={
                    "px-4 py-2.5 text-sm tabular-nums " +
                    (!open ? "text-ink/50" : gaps.length > 0 ? "font-medium text-destructive" : "text-matcha")
                  }
                >
                  {!open ? "Closed" : gaps.length > 0 ? `Nobody yet for ${formatPeriods(gaps)}` : "Fully covered"}
                </p>
              </section>
            );
          })}

          {/* The people: tap a name to rename, change the PIN, unlock or deactivate. */}
          <section className="self-start bg-ink text-paper">
            <div className="flex items-baseline justify-between border-b border-paper/30 px-4 py-2.5">
              <h2 className="font-label text-lg font-semibold tracking-[0.08em] uppercase">Team</h2>
              <span className="text-xs text-paper/60">Hours this week</span>
            </div>
            {active.map((employee) => (
              <button
                key={employee.id}
                type="button"
                onClick={() => openEmployee(employee)}
                className="flex h-10 w-full items-center justify-between gap-3 border-b border-dashed border-paper/20 px-4 text-left hover:bg-paper/10"
              >
                <span className="flex items-baseline gap-3">
                  <span className="font-label text-base font-semibold tracking-[0.06em] uppercase">{employee.name}</span>
                  {employee.lockedUntil && (
                    <span className="font-label text-sm font-semibold tracking-[0.1em] text-destructive uppercase">Locked</span>
                  )}
                </span>
                <span className="text-sm tabular-nums">{weekHours(employee.id)} h</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => openEmployee()}
              className="flex h-10 w-full items-center gap-2 px-4 text-left text-paper/60 hover:bg-paper/10 hover:text-paper"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add employee
            </button>
            {inactive.length > 0 && (
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-dashed border-paper/20 px-4 py-2.5 text-sm text-paper/60">
                Deactivated:
                {inactive.map((employee) => (
                  <button
                    key={employee.id}
                    type="button"
                    onClick={() => openEmployee(employee)}
                    className="underline underline-offset-4 hover:text-paper"
                  >
                    {employee.name}
                  </button>
                ))}
              </p>
            )}
          </section>
        </div>
      )}

      <Dialog open={shiftOpen} onOpenChange={setShiftOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {shiftForm?.employee.name}, {shiftForm && weekdayName(shiftForm.day)} {shiftForm && shortDate(shiftForm.day)}
            </DialogTitle>
            <DialogDescription>
              {!shiftAvailability && "No availability sent for this day."}
              {shiftAvailability?.notAvailable && "Said they are not free this day."}
              {shiftAvailability && shiftAvailability.periods.length > 0 && `Free ${formatPeriods(shiftAvailability.periods)}.`}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (shiftForm && shiftProblem === null) saveShift.mutate(shiftForm);
            }}
          >
            {shiftForm?.periods.map((period, index) => (
              <div key={index} className="flex items-end gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Label htmlFor={`shift-from-${index}`}>{index === 0 ? "Works from" : "Then from"}</Label>
                  <Picker
                    id={`shift-from-${index}`}
                    className="w-full"
                    value={period.from}
                    onChange={(from) => setShiftPeriod(index, { from })}
                    options={TIME_OPTIONS}
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Label htmlFor={`shift-to-${index}`}>To</Label>
                  <Picker
                    id={`shift-to-${index}`}
                    className="w-full"
                    value={period.to}
                    onChange={(to) => setShiftPeriod(index, { to })}
                    options={TIME_OPTIONS}
                  />
                </div>
                {index > 0 && (
                  <button
                    type="button"
                    aria-label="Remove this period"
                    onClick={() => setShiftForm((current) => current && { ...current, periods: current.periods.slice(0, index) })}
                    className="flex size-11 shrink-0 items-center justify-center border border-ink/30 bg-white hover:bg-ink hover:text-paper"
                  >
                    <X className="size-5" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
            {/* A split day, e.g. the morning and again the evening. */}
            {shiftForm && shiftForm.periods.length < MAX_SHIFT_PERIODS && (
              <button
                type="button"
                className={`${linkClass} flex items-center gap-2 no-underline`}
                onClick={() =>
                  setShiftForm((current) => {
                    if (!current) return current;
                    // Offer the employee's own second free period when they gave one.
                    const free = shiftAvailability?.periods[1];
                    return { ...current, periods: [...current.periods, free ?? nextPeriod(current.periods)] };
                  })
                }
              >
                <Plus className="size-4" aria-hidden="true" />
                Add another period
              </button>
            )}
            {shiftProblem && <p className="text-sm text-destructive">{shiftProblem}</p>}
            {!shiftProblem && shiftOutside && shiftAvailability && (
              <p className="text-sm text-destructive">These hours are outside what they said. You can still save.</p>
            )}
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              {shiftForm?.hasShift && (
                <Button
                  type="button"
                  variant="destructive"
                  className="h-11 px-5 text-lg sm:mr-auto"
                  disabled={removeShift.isPending}
                  onClick={() => removeShift.mutate(shiftForm)}
                >
                  Remove
                </Button>
              )}
              <Button
                type="submit"
                className="h-11 px-5 text-lg"
                disabled={!shiftForm || shiftProblem !== null || saveShift.isPending}
              >
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={employeeForm !== null} onOpenChange={(open) => !open && setEmployeeForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{employeeTitle}</DialogTitle>
            <DialogDescription>They pick this name on the iPad, then enter the PIN.</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (employeeForm && employeeReady) saveEmployee.mutate(employeeForm);
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="employee-name">Name</Label>
              <Input
                id="employee-name"
                autoComplete="off"
                value={employeeForm?.name ?? ""}
                onChange={(e) => setEmployeeForm((form) => form && { ...form, name: e.target.value })}
                className="h-12 text-lg"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="employee-pin">{employeeTitle === "Edit employee" ? "New PIN (leave empty to keep it)" : "PIN (4 digits)"}</Label>
              <Input
                id="employee-pin"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={employeeForm?.pin ?? ""}
                onChange={(e) => setEmployeeForm((form) => form && { ...form, pin: e.target.value.replace(/\D/g, "") })}
                className="h-12 text-lg tracking-[0.4em]"
              />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            {editedEmployee && (
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {editedEmployee.active && editedEmployee.lockedUntil && (
                  <button type="button" className={linkClass} onClick={() => unlock.mutate(editedEmployee.id)}>
                    Unlock (locked after wrong PINs)
                  </button>
                )}
                <button
                  type="button"
                  className={linkClass}
                  onClick={() => setActive.mutate({ id: editedEmployee.id, active: !editedEmployee.active })}
                >
                  {editedEmployee.active ? "Deactivate" : "Reactivate"}
                </button>
              </div>
            )}
            <DialogFooter>
              <Button type="submit" className="h-11 px-5 text-lg" disabled={!employeeReady || saveEmployee.isPending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={hoursOpen} onOpenChange={setHoursOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Opening hours</DialogTitle>
            <DialogDescription>When the shop needs someone. The schedule shows these hours in red until a shift covers them.</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (hoursForm && !hoursProblem) saveHours.mutate(hoursForm);
            }}
          >
            {hoursForm?.map((day, index) => {
              const change = (patch: Partial<OpenDay>) =>
                setHoursForm((form) => form && form.map((item, position) => (position === index ? { ...item, ...patch } : item)));
              const name = weekdayName(days[index]);
              return (
                <div key={index} className="flex items-center gap-2">
                  <span className="w-10 shrink-0 font-label text-lg font-semibold tracking-[0.06em] uppercase">{name.slice(0, 3)}</span>
                  {day.closed ? (
                    <span className="flex h-11 min-w-0 flex-1 items-center text-ink/50">Nobody needed</span>
                  ) : (
                    <>
                      <Picker
                        className="min-w-0 flex-1"
                        aria-label={`${name} opens at`}
                        value={day.from}
                        onChange={(from) => change({ from })}
                        options={TIME_OPTIONS}
                      />
                      <Picker
                        className="min-w-0 flex-1"
                        aria-label={`${name} closes at`}
                        value={day.to}
                        onChange={(to) => change({ to })}
                        options={TIME_OPTIONS}
                      />
                    </>
                  )}
                  <button
                    type="button"
                    aria-pressed={day.closed}
                    onClick={() => change({ closed: !day.closed })}
                    className={
                      "flex h-11 w-20 shrink-0 items-center justify-center border font-label text-base font-semibold tracking-[0.06em] uppercase " +
                      (day.closed ? "border-ink bg-ink text-paper" : "border-ink/30 bg-white text-ink/60 hover:text-ink")
                    }
                  >
                    Closed
                  </button>
                </div>
              );
            })}
            {hoursProblem && <p className="text-sm text-destructive">The closing time must be after the opening time.</p>}
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="submit" className="h-11 px-5 text-lg" disabled={!hoursForm || hoursProblem || saveHours.isPending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {toast.node}
    </>
  );
}
