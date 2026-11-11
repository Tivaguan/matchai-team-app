import { createAdminClient, sendAlert, shopToday } from "@/lib/server/push";

// Runs once a week (see vercel.json). Tells the owners how many employees
// have not sent their availability for next week yet.

function nextMonday(today: string) {
  const date = new Date(`${today}T00:00:00Z`);
  const weekday = date.getUTCDay(); // 0 = Sunday
  date.setUTCDate(date.getUTCDate() + (weekday === 0 ? 1 : 8 - weekday));
  return date;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "not allowed" }, { status: 401 });
  }

  const admin = createAdminClient();
  const monday = nextMonday(shopToday());
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const from = monday.toISOString().slice(0, 10);
  const to = sunday.toISOString().slice(0, 10);

  const [employees, answers] = await Promise.all([
    admin.from("employees").select("id, name").eq("active", true),
    admin.from("availability").select("employee_id").gte("day", from).lte("day", to),
  ]);
  if (employees.error || answers.error) return Response.json({ error: "could not read" }, { status: 500 });

  const answered = new Set(answers.data.map((row) => row.employee_id));
  const missing = employees.data.filter((employee) => !answered.has(employee.id));
  if (missing.length === 0) return Response.json({ sent: 0, missing: 0 });

  const names = missing.map((employee) => employee.name).join(", ");
  const sent = await sendAlert(admin, "availability_reminder", {
    title: "Availability still missing",
    body: `${missing.length} of ${employees.data.length} have not answered for next week: ${names}.`,
    url: "/admin/team",
  });
  return Response.json({ sent, missing: missing.length });
}
