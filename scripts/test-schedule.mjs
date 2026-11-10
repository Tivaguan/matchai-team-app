// Checks the availability and schedule rules against the dev project.
// Uses a far-future test week, creates test rows and removes them at the end
// (removing needs the secret key).
//
// Usage: SUPABASE_SECRET_KEY=... node --env-file=.env.local scripts/test-schedule.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!secretKey) {
  console.error("Missing SUPABASE_SECRET_KEY (needed to clean up the test rows).");
  process.exit(1);
}

let failed = 0;
function check(label, pass, detail = "") {
  if (!pass) failed++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${pass || !detail ? "" : `  -> ${detail}`}`);
}
const show = (res) => JSON.stringify(res.data ?? res.error?.message);

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secretKey, noSession);
const visitor = createClient(url, key, noSession);
const owner = createClient(url, key, noSession);
await owner.auth.signInWithPassword({
  email: process.env.TEST_OWNER_EMAIL,
  password: process.env.TEST_OWNER_PASSWORD,
});

// A Monday far in the future, so real weeks are never touched.
const WEEK = "2030-01-07";
const TUESDAY = "2030-01-08";
const PIN = "1234";

const created = await owner.rpc("create_employee", { p_name: "Zz Schedule Test", p_pin: PIN });
const employeeId = created.data;
const who = { p_employee_id: employeeId, p_pin: PIN, p_week_start: WEEK };
const save = (days, overrides = {}) => visitor.rpc("save_availability", { ...who, p_days: days, ...overrides });

const answers = [
  { day: WEEK, not_available: true },
  { day: TUESDAY, not_available: false, from: "11:00", to: "18:30" },
];

try {
  // --- Public page: names and my own answers --------------------------------
  let res = await visitor.rpc("get_availability_roster");
  check("visitor sees the names to pick from", res.data?.some((row) => row.employee_id === employeeId), show(res));
  res = await visitor.from("employees").select("id");
  check("visitor still cannot read the employees table", !!res.error || res.data.length === 0);

  res = await save(answers, { p_pin: "0000" });
  check("saving with a wrong PIN is refused", res.data?.error === "wrong_pin", show(res));
  res = await save(answers, { p_week_start: TUESDAY });
  check("a week that does not start on Monday is refused", res.data?.error === "invalid_week", show(res));
  res = await save([{ day: "2030-01-20", not_available: true }]);
  check("a day outside the week is refused", res.data?.error === "invalid_days", show(res));
  res = await save([{ day: TUESDAY, not_available: false, from: "18:00", to: "11:00" }]);
  check("hours that end before they start are refused", res.data?.error === "invalid_hours", show(res));
  res = await save([answers[0], answers[0]]);
  check("the same day twice is refused", res.data?.error === "invalid_days", show(res));

  res = await save(answers);
  check("visitor with the right PIN can save availability", res.data?.ok === true, show(res));
  res = await visitor.rpc("get_my_availability", who);
  check(
    "the saved answers come back",
    res.data?.ok === true &&
      res.data.published === false &&
      res.data.days.length === 2 &&
      res.data.days[0].not_available === true &&
      res.data.days[1].from === "11:00" &&
      res.data.days[1].to === "18:30",
    show(res),
  );
  res = await visitor.rpc("get_my_availability", { ...who, p_pin: "0000" });
  check("reading with a wrong PIN is refused", res.data?.error === "wrong_pin", show(res));

  res = await save([{ day: TUESDAY, not_available: false, from: "13:00", to: "22:00" }]);
  const after = await visitor.rpc("get_my_availability", who);
  check(
    "saving again replaces the week",
    res.data?.ok === true && after.data?.days.length === 1 && after.data.days[0].from === "13:00",
    show(after),
  );
  res = await visitor.from("availability").select("id").limit(1);
  check("visitor cannot read the availability table", !!res.error || res.data.length === 0);

  // --- Owner builds and publishes the schedule ------------------------------
  res = await owner.from("availability").select("day, from_time, to_time").eq("employee_id", employeeId);
  check("owner sees the availability", res.data?.length === 1 && res.data[0].from_time.startsWith("13:00"), show(res));
  res = await owner
    .from("shifts")
    .insert({ employee_id: employeeId, day: TUESDAY, from_time: "13:00", to_time: "19:00" })
    .select("id");
  check("owner can assign a shift", !res.error && res.data.length === 1, res.error?.message);

  res = await visitor.rpc("get_published_schedule", { p_week_start: WEEK });
  check("an unpublished week shows nothing", res.data?.published === false && res.data.shifts.length === 0, show(res));
  res = await visitor.from("shifts").select("id").limit(1);
  check("visitor cannot read the shifts table", !!res.error || res.data.length === 0);
  res = await visitor.from("schedule_weeks").upsert({ week_start: WEEK, published: true }).select();
  check("visitor cannot publish a week", !!res.error);

  res = await owner.from("schedule_weeks").upsert({ week_start: WEEK, published: true }).select();
  check("owner can publish the week", !res.error, res.error?.message);
  res = await visitor.rpc("get_published_schedule", { p_week_start: WEEK });
  check(
    "the published week shows the shift",
    res.data?.published === true &&
      res.data.shifts.length === 1 &&
      res.data.shifts[0].name === "Zz Schedule Test" &&
      res.data.shifts[0].from === "13:00" &&
      res.data.shifts[0].to === "19:00",
    show(res),
  );
  res = await save(answers);
  check("availability is locked once the week is published", res.data?.error === "week_published", show(res));
  res = await visitor.rpc("get_my_availability", who);
  check("the page is told the week is published", res.data?.published === true, show(res));
} finally {
  await admin.from("shifts").delete().eq("employee_id", employeeId);
  await admin.from("availability").delete().eq("employee_id", employeeId);
  await admin.from("schedule_weeks").delete().eq("week_start", WEEK);
  const removed = await admin.from("employees").delete().eq("id", employeeId);
  check("test rows removed", !removed.error, removed.error?.message);
}

console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
