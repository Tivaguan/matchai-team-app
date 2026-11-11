import { createAdminClient, dayLabel, sendAlert, sendAlertOnce, sendToOwner, shopToday } from "@/lib/server/push";

// Called by the app right after something worth an alert happened.
// The caller only says WHAT kind of thing happened. The text of the alert is
// built here from the database, so a caller cannot make up a message.

const RECENT_MS = 5 * 60 * 1000;

function money(amount: number) {
  return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
}

function quantity(amount: number, unit: string) {
  const text = amount.toLocaleString("en-US", { maximumFractionDigits: 3 });
  return unit ? `${text} ${unit}` : text;
}

function isRecent(timestamp: string) {
  return Date.now() - new Date(timestamp).getTime() < RECENT_MS;
}

type Admin = ReturnType<typeof createAdminClient>;
type Body = { type?: string; itemId?: string; employeeId?: string; weekStart?: string } | null;

const DAY_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Two events come from pages the staff use without an account (their own phone).
 * They carry no text and are checked against the database, and each one is sent
 * only once, so calling this by hand cannot invent or repeat an alert.
 */
async function staffEvent(admin: Admin, body: Body): Promise<Response | null> {
  if (body?.type === "all_answered") {
    const weekStart = body.weekStart ?? "";
    if (!DAY_PATTERN.test(weekStart) || new Date(`${weekStart}T00:00:00Z`).getUTCDay() !== 1) {
      return Response.json({ error: "unknown week" }, { status: 400 });
    }
    const end = new Date(`${weekStart}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 6);
    const weekEnd = end.toISOString().slice(0, 10);
    const [employees, answers] = await Promise.all([
      admin.from("employees").select("id").eq("active", true),
      admin.from("availability").select("employee_id").gte("day", weekStart).lte("day", weekEnd),
    ]);
    if (employees.error || answers.error) throw employees.error ?? answers.error;
    const answered = new Set(answers.data.map((row) => row.employee_id));
    const everyone = employees.data.length > 0 && employees.data.every((employee) => answered.has(employee.id));
    if (!everyone) return Response.json({ sent: 0 });
    const sent = await sendAlertOnce(admin, `all_answered:${weekStart}`, "all_answered", {
      title: "Everyone has answered",
      body: `All ${employees.data.length} employees sent their availability for ${dayLabel(weekStart)} to ${dayLabel(weekEnd)}. You can make the schedule.`,
      url: "/admin/team",
    });
    return Response.json({ sent });
  }

  if (body?.type === "employee_locked") {
    const employeeId = body.employeeId ?? "";
    if (!UUID_PATTERN.test(employeeId)) return Response.json({ sent: 0 });
    const [employee, pin] = await Promise.all([
      admin.from("employees").select("name").eq("id", employeeId).maybeSingle(),
      admin.from("employee_pins").select("locked_until").eq("employee_id", employeeId).maybeSingle(),
    ]);
    const lockedUntil = pin.data?.locked_until;
    if (!employee.data || !lockedUntil || new Date(lockedUntil).getTime() <= Date.now()) return Response.json({ sent: 0 });
    const sent = await sendAlertOnce(admin, `employee_locked:${employeeId}:${lockedUntil}`, "employee_locked", {
      title: `${employee.data.name} is locked out`,
      body: "Too many wrong PINs. Tap their name on the Team page to unlock them.",
      url: "/admin/team",
    });
    return Response.json({ sent });
  }

  return null;
}

export async function POST(request: Request) {
  const admin = createAdminClient();
  const body = (await request.json().catch(() => null)) as Body;

  try {
    const fromStaff = await staffEvent(admin, body);
    if (fromStaff) return fromStaff;
  } catch {
    return Response.json({ error: "could not send" }, { status: 500 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return Response.json({ error: "not signed in" }, { status: 401 });

  const { data: auth } = await admin.auth.getUser(token);
  if (!auth.user) return Response.json({ error: "not signed in" }, { status: 401 });

  const { data: profile } = await admin.from("profiles").select("role").eq("user_id", auth.user.id).maybeSingle();
  if (!profile) return Response.json({ error: "not allowed" }, { status: 403 });

  try {
    if (body?.type === "test") {
      if (profile.role !== "owner") return Response.json({ error: "not allowed" }, { status: 403 });
      const sent = await sendToOwner(admin, auth.user.id, {
        title: "Matchai Team",
        body: "Notifications work on this device.",
        url: "/admin/alerts",
      });
      return Response.json({ sent });
    }

    if (body?.type === "low_stock" && body.itemId) {
      const [item, level] = await Promise.all([
        admin.from("stock_items").select("name, unit, low_stock_level").eq("id", body.itemId).maybeSingle(),
        admin.from("stock_levels").select("current_quantity, is_low").eq("item_id", body.itemId).maybeSingle(),
      ]);
      if (!item.data || !level.data?.is_low) return Response.json({ sent: 0 });
      const sent = await sendAlert(admin, "low_stock", {
        title: `Low stock: ${item.data.name}`,
        body: `${quantity(level.data.current_quantity ?? 0, item.data.unit)} left. The low level is ${quantity(item.data.low_stock_level, item.data.unit)}.`,
        url: "/admin/stock",
      });
      return Response.json({ sent });
    }

    if (body?.type === "expense_logged") {
      const { data: expense } = await admin
        .from("expenses")
        .select("amount, reason, created_at, employees(name)")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!expense || !isRecent(expense.created_at)) return Response.json({ sent: 0 });
      const sent = await sendAlert(admin, "expense_logged", {
        title: `Expense: ${money(expense.amount)}`,
        body: `${expense.employees?.name ?? "Someone"} took cash from the drawer: ${expense.reason}`,
        url: "/admin/cash",
      });
      return Response.json({ sent });
    }

    if (body?.type === "day_opened") {
      const today = shopToday();
      const { data: counts } = await admin
        .from("cash_counts")
        .select("amount, created_at, employees(name)")
        .eq("day", today)
        .eq("kind", "opening")
        .order("created_at", { ascending: false })
        .limit(1);
      const opening = counts?.[0];
      if (!opening || !isRecent(opening.created_at)) return Response.json({ sent: 0 });
      let sent = await sendAlertOnce(admin, `day_opened:${today}`, "day_opened", {
        title: "Day opened",
        body: `${opening.employees?.name ?? "Someone"} counted ${money(opening.amount)} in the drawer.`,
        url: "/admin/cash",
      });

      // The drawer should hold what was left at the last closing.
      const { data: closings } = await admin
        .from("cash_counts")
        .select("day, amount")
        .eq("kind", "closing")
        .lt("day", today)
        .order("day", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);
      const closing = closings?.[0];
      if (closing && closing.amount !== opening.amount) {
        const gap = opening.amount - closing.amount;
        sent += await sendAlertOnce(admin, `drawer_mismatch:${today}`, "drawer_mismatch", {
          title: `Drawer is ${money(Math.abs(gap))} ${gap < 0 ? "short" : "over"}`,
          body: `Opening count ${money(opening.amount)}. The last closing (${dayLabel(closing.day)}) was ${money(closing.amount)}.`,
          url: "/admin/cash",
        });
      }
      return Response.json({ sent });
    }

    if (body?.type === "day_closed") {
      const { data: counts } = await admin
        .from("cash_counts")
        .select("kind, amount, created_at, employees(name)")
        .eq("day", shopToday())
        .order("created_at");
      const opening = counts?.find((count) => count.kind === "opening");
      const closing = counts?.findLast((count) => count.kind === "closing");
      if (!closing || !isRecent(closing.created_at)) return Response.json({ sent: 0 });
      // Cash sales, as on the Cash page: closing minus opening, plus what was taken out of the drawer.
      const { data: expenses } = await admin.from("expenses").select("amount").eq("day", shopToday());
      const taken = (expenses ?? []).reduce((sum, expense) => sum + expense.amount, 0);
      const difference = opening ? ` Cash sales: ${money(closing.amount - opening.amount + taken)}.` : "";
      const sent = await sendAlert(admin, "day_closed", {
        title: "Day closed",
        body: `${closing.employees?.name ?? "Someone"} counted ${money(closing.amount)}.${difference}`,
        url: "/admin/cash",
      });
      return Response.json({ sent });
    }
  } catch {
    return Response.json({ error: "could not send" }, { status: 500 });
  }

  return Response.json({ error: "unknown alert" }, { status: 400 });
}
