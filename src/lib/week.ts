// Weeks run Monday to Sunday and are named by their Monday, e.g. "2026-11-16".
// Days are plain "YYYY-MM-DD" strings; the maths is done in UTC so it never
// shifts with the device's time zone.

function toDate(day: string) {
  return new Date(`${day}T00:00:00Z`);
}

export function addDays(day: string, count: number) {
  const date = toDate(day);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

/** The Monday of the week that contains this day. */
export function mondayOf(day: string) {
  const weekday = toDate(day).getUTCDay(); // 0 = Sunday
  return addDays(day, weekday === 0 ? -6 : 1 - weekday);
}

/** The seven days of a week, Monday first. */
export function weekDays(weekStart: string) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

/** "2026-11-16" -> "16 – 22 Nov 2026" */
export function formatWeekRange(weekStart: string) {
  const end = addDays(weekStart, 6);
  const dayOnly = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "UTC" });
  const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const full = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const sameMonth = weekStart.slice(0, 7) === end.slice(0, 7);
  return `${(sameMonth ? dayOnly : dayMonth).format(toDate(weekStart))} – ${full.format(toDate(end))}`;
}

/** "2026-11-16" -> "Monday" */
export function weekdayName(day: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(toDate(day));
}

/** "2026-11-16" -> "16 Nov" */
export function shortDate(day: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(toDate(day));
}

/** Half-hour steps staff and owners can pick from, 07:00 to 23:00: a little wider than opening hours. */
export const TIME_OPTIONS = Array.from({ length: 33 }, (_, index) => {
  const minutes = 7 * 60 + index * 30;
  const text = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return { value: text, label: text };
});

export const DEFAULT_FROM = "11:00";
export const DEFAULT_TO = "22:00";

/** "11:00:00" (as the database returns times) -> "11:00" */
export function trimTime(time: string) {
  return time.slice(0, 5);
}

/** A stretch of a day, as "HH:MM" strings. */
export type Period = { from: string; to: string };
/** Staff can say they are free in up to three periods of a day (think of classes in between). */
export const MAX_FREE_PERIODS = 3;
/** Owners can give someone up to two shifts in a day (a split day). */
export const MAX_SHIFT_PERIODS = 2;

/** Another period to offer after the ones already there: the next free hours, up to the evening. */
export function nextPeriod(periods: Period[]): Period {
  const last = TIME_OPTIONS[TIME_OPTIONS.length - 1].value;
  const latestEnd = periods.reduce((latest, period) => (period.to > latest ? period.to : latest), "00:00");
  const start = TIME_OPTIONS.find((option) => option.value > latestEnd)?.value ?? last;
  const end = TIME_OPTIONS.find((option) => option.value >= "22:00" && option.value > start)?.value ?? last;
  return { from: start, to: end };
}

/** What is wrong with a day's periods, or null when they are fine. */
export function periodsProblem(periods: Period[]) {
  if (periods.some((period) => period.from >= period.to)) return "The end must be after the start.";
  const overlap = periods.some((first, index) =>
    periods.slice(index + 1).some((second) => first.from < second.to && second.from < first.to),
  );
  return overlap ? "Two periods overlap." : null;
}

/** "09:00–11:00", or "09:00–11:00 and 16:00–19:00" for several periods, earliest first. */
export function formatPeriods(periods: Period[]) {
  return [...periods]
    .sort((a, b) => a.from.localeCompare(b.from))
    .map((period) => `${period.from}–${period.to}`)
    .join(" and ");
}

// --- Reading a day at a glance (Team page) ---

export function toMinutes(time: string) {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

export function minutesToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Where a period sits on a bar that runs from `start` to `end` (minutes of the day), in percent. */
export function barPosition(period: Period, start: number, end: number) {
  const from = Math.max(toMinutes(period.from), start);
  const to = Math.min(toMinutes(period.to), end);
  return { left: `${((from - start) / (end - start)) * 100}%`, width: `${(Math.max(to - from, 0) / (end - start)) * 100}%` };
}

/** Periods in order, with touching or overlapping ones joined into one. */
function joined(periods: Period[]) {
  const sorted = periods.map((period) => [toMinutes(period.from), toMinutes(period.to)]).sort((a, b) => a[0] - b[0]);
  const out: number[][] = [];
  for (const [from, to] of sorted) {
    const last = out.at(-1);
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else out.push([from, to]);
  }
  return out;
}

/** True when the whole shift is inside the hours the person said they are free. */
export function fitsIn(shift: Period, free: Period[]) {
  const from = toMinutes(shift.from);
  const to = toMinutes(shift.to);
  return joined(free).some(([start, end]) => start <= from && to <= end);
}

/** The part of a day's open hours that no shift covers. `open` is null when the shop is closed. */
export function uncovered(shifts: Period[], open: Period | null): Period[] {
  if (!open) return [];
  const gaps: Period[] = [];
  let cursor = toMinutes(open.from);
  const end = toMinutes(open.to);
  for (const [from, to] of joined(shifts)) {
    if (from > cursor && cursor < end) gaps.push({ from: minutesToTime(cursor), to: minutesToTime(Math.min(from, end)) });
    cursor = Math.max(cursor, to);
  }
  if (cursor < end) gaps.push({ from: minutesToTime(cursor), to: open.to });
  return gaps;
}

/** Total length of some periods, in hours: 5, 7.5, ... */
export function hoursOf(periods: Period[]) {
  return periods.reduce((sum, period) => sum + toMinutes(period.to) - toMinutes(period.from), 0) / 60;
}
