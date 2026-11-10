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

/** Half-hour steps staff and owners can pick from, a little wider than opening hours. */
export const TIME_OPTIONS = Array.from({ length: 29 }, (_, index) => {
  const minutes = 9 * 60 + index * 30;
  const text = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return { value: text, label: text };
});

export const DEFAULT_FROM = "11:00";
export const DEFAULT_TO = "22:00";

/** "11:00:00" (as the database returns times) -> "11:00" */
export function trimTime(time: string) {
  return time.slice(0, 5);
}
