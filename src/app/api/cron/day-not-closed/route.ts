import { createAdminClient, dayLabel, sendAlertOnce } from "@/lib/server/push";

// Runs once a night, after the shop has closed (see vercel.json). Tells the
// owners when the day was left without a closing count.

/**
 * The shop day this run is about. The job may start a little after midnight,
 * so the day is taken three hours back, in Morocco time.
 */
function shopDay() {
  const earlier = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" }).format(earlier);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "not allowed" }, { status: 401 });
  }

  const admin = createAdminClient();
  const day = shopDay();
  // 1 = Monday ... 7 = Sunday, as in opening_hours.
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay() || 7;

  const [counts, hours] = await Promise.all([
    admin.from("cash_counts").select("kind").eq("day", day),
    admin.from("opening_hours").select("closed").eq("weekday", weekday).maybeSingle(),
  ]);
  if (counts.error || hours.error) return Response.json({ error: "could not read" }, { status: 500 });

  const opened = counts.data.some((count) => count.kind === "opening");
  const closed = counts.data.some((count) => count.kind === "closing");
  // Nothing to say when the day was closed, or when the shop was shut and nobody opened the drawer.
  if (closed || (!opened && (hours.data?.closed ?? false))) return Response.json({ sent: 0, day });

  const sent = await sendAlertOnce(admin, `day_not_closed:${day}`, "day_not_closed", {
    title: "Day not closed",
    body: opened
      ? `The drawer was opened on ${dayLabel(day)} but no closing count was saved.`
      : `No opening or closing count was saved on ${dayLabel(day)}.`,
    url: "/admin/cash",
  });
  return Response.json({ sent, day });
}
