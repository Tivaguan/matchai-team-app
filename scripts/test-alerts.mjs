// Checks the alert routes of a running app (default http://localhost:3000).
// It does not need a subscribed device: it checks who is allowed to ask for
// alerts, and that the install files are served.
//
// Usage: node --env-file=.env.local scripts/test-alerts.mjs [base-url]

import { createClient } from "@supabase/supabase-js";

const base = process.argv[2] ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let failed = 0;
function check(label, pass, detail = "") {
  if (!pass) failed++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${pass || !detail ? "" : `  -> ${detail}`}`);
}

async function tokenFor(email, password) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return data.session.access_token;
}

async function notify(body, token) {
  const response = await fetch(`${base}/api/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

const owner = await tokenFor(process.env.TEST_OWNER_EMAIL, process.env.TEST_OWNER_PASSWORD);
const counter = await tokenFor(process.env.TEST_COUNTER_EMAIL, process.env.TEST_COUNTER_PASSWORD);

let res = await notify({ type: "test" });
check("no login cannot ask for an alert", res.status === 401, JSON.stringify(res));
res = await notify({ type: "test" }, "not-a-real-token");
check("a made-up login is refused", res.status === 401, JSON.stringify(res));
res = await notify({ type: "test" }, counter);
check("the iPad account cannot send a test", res.status === 403, JSON.stringify(res));
res = await notify({ type: "test" }, owner);
check("an owner can send a test", res.status === 200 && typeof res.body?.sent === "number", JSON.stringify(res));
res = await notify({ type: "made_up" }, owner);
check("an unknown alert is refused", res.status === 400, JSON.stringify(res));
res = await notify({ type: "low_stock", itemId: "00000000-0000-0000-0000-000000000000" }, counter);
check("low stock for an item that does not exist sends nothing", res.status === 200 && res.body?.sent === 0, JSON.stringify(res));
res = await notify({ type: "expense_logged" }, counter);
check("the iPad account can report an expense", res.status === 200 && typeof res.body?.sent === "number", JSON.stringify(res));

let cron = await fetch(`${base}/api/cron/availability-reminder`);
check("the weekly reminder is refused without its secret", cron.status === 401);
cron = await fetch(`${base}/api/cron/availability-reminder`, {
  headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
});
const cronBody = await cron.json().catch(() => null);
check("the weekly reminder runs with its secret", cron.status === 200 && typeof cronBody?.missing === "number", JSON.stringify(cronBody));

// Events from the pages the staff use without an account.
res = await notify({ type: "all_answered", weekStart: "2026-11-17" });
check("everyone-answered for a day that is not a Monday is refused", res.status === 400, JSON.stringify(res));
res = await notify({ type: "all_answered", weekStart: "2031-01-06" });
check("everyone-answered sends nothing when nobody has answered", res.status === 200 && res.body?.sent === 0, JSON.stringify(res));
res = await notify({ type: "employee_locked", employeeId: "00000000-0000-0000-0000-000000000000" });
check("locked-out for an employee that does not exist sends nothing", res.status === 200 && res.body?.sent === 0, JSON.stringify(res));
res = await notify({ type: "employee_locked", employeeId: "not-an-id" });
check("locked-out with a made-up id sends nothing", res.status === 200 && res.body?.sent === 0, JSON.stringify(res));
res = await notify({ type: "day_opened" });
check("no login cannot report an opened day", res.status === 401, JSON.stringify(res));
res = await notify({ type: "day_opened" }, counter);
check("the iPad account can report an opened day", res.status === 200 && typeof res.body?.sent === "number", JSON.stringify(res));

cron = await fetch(`${base}/api/cron/day-not-closed`);
check("the nightly check is refused without its secret", cron.status === 401);
cron = await fetch(`${base}/api/cron/day-not-closed`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
const nightBody = await cron.json().catch(() => null);
check("the nightly check runs with its secret", cron.status === 200 && typeof nightBody?.sent === "number", JSON.stringify(nightBody));
// Forget that this test run announced the day, so the real nightly alert still goes out.
if (nightBody?.day) {
  const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  await admin.from("notification_log").delete().eq("key", `day_not_closed:${nightBody.day}`);
}

const manifest = await fetch(`${base}/manifest.webmanifest`).then((r) => r.json()).catch(() => null);
check("the install manifest is served", manifest?.display === "standalone" && manifest.icons?.length === 3);
const worker = await fetch(`${base}/sw.js`);
check(
  "the service worker is served and never cached",
  worker.status === 200 && (worker.headers.get("cache-control") ?? "").includes("no-store"),
  worker.headers.get("cache-control") ?? "",
);
const icon = await fetch(`${base}/icons/icon-192.png`);
check("the app icon is served", icon.status === 200 && icon.headers.get("content-type") === "image/png");
const offline = await fetch(`${base}/offline.html`);
check("the offline page is served", offline.status === 200);

console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
