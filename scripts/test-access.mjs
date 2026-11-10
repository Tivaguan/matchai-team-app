// Checks the database access rules and the PIN functions against the dev project.
// Uses the test accounts in .env.local. Creates one test employee and removes it.
//
// Usage: node --env-file=.env.local scripts/test-access.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let failed = 0;
function check(label, pass, detail = "") {
  if (!pass) failed++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${pass || !detail ? "" : `  -> ${detail}`}`);
}

async function signIn(email, password) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}

const visitor = createClient(url, key, { auth: { persistSession: false } });
const owner = await signIn(process.env.TEST_OWNER_EMAIL, process.env.TEST_OWNER_PASSWORD);
const counter = await signIn(process.env.TEST_COUNTER_EMAIL, process.env.TEST_COUNTER_PASSWORD);

// --- Owner sets up a test employee -----------------------------------------
const created = await owner.rpc("create_employee", { p_name: "Zz Test Employee", p_pin: "1234" });
check("owner can add an employee", !created.error, created.error?.message);
const employeeId = created.data;

try {
  // --- Public visitor ------------------------------------------------------
  const vEmployees = await visitor.from("employees").select("id");
  check("visitor cannot read employees", !!vEmployees.error || vEmployees.data.length === 0);
  const vVerify = await visitor.rpc("verify_employee_pin", { p_employee_id: employeeId, p_pin: "1234" });
  check("visitor cannot check a PIN", !!vVerify.error);

  // --- Nobody reads PIN hashes ---------------------------------------------
  const oPins = await owner.from("employee_pins").select("*");
  check("owner cannot read PIN hashes", !!oPins.error || oPins.data.length === 0);
  const cPins = await counter.from("employee_pins").select("*");
  check("iPad cannot read PIN hashes", !!cPins.error || cPins.data.length === 0);

  // --- iPad account limits -------------------------------------------------
  const cEmployees = await counter.from("employees").select("id").eq("id", employeeId);
  check("iPad can read employee names", !cEmployees.error && cEmployees.data.length === 1, cEmployees.error?.message);
  const cInsert = await counter.from("employees").insert({ name: "Hacker" }).select();
  check("iPad cannot add an employee directly", !!cInsert.error);
  const cCreate = await counter.rpc("create_employee", { p_name: "Hacker", p_pin: "0000" });
  check("iPad cannot add an employee by function", !!cCreate.error);
  const cSet = await counter.rpc("set_employee_pin", { p_employee_id: employeeId, p_new_pin: "0000" });
  check("iPad cannot reset a PIN", !!cSet.error);
  const cRename = await counter.from("employees").update({ name: "Renamed" }).eq("id", employeeId).select();
  check("iPad cannot rename an employee", !!cRename.error || cRename.data.length === 0);
  for (const table of ["stock_changes", "cash_counts", "expenses", "availability"]) {
    const res = await counter.from(table).select("id").limit(1);
    check(`iPad cannot read ${table}`, !!res.error || res.data.length === 0);
  }
  const oLogs = await owner.from("stock_changes").select("id").limit(1);
  check("owner can read the stock log", !oLogs.error, oLogs.error?.message);
  const oLevels = await owner.from("stock_levels").select("item_id").limit(1);
  check("owner can read stock levels", !oLevels.error, oLevels.error?.message);

  // --- PIN checks and lock -------------------------------------------------
  const verify = (pin) => counter.rpc("verify_employee_pin", { p_employee_id: employeeId, p_pin: pin });

  const good = await verify("1234");
  check("right PIN is accepted", good.data?.ok === true, JSON.stringify(good.data ?? good.error));

  for (let i = 1; i <= 4; i++) {
    const res = await verify("0000");
    check(
      `wrong try ${i} is refused, ${5 - i} left`,
      res.data?.ok === false && res.data.error === "wrong_pin" && res.data.tries_left === 5 - i,
      JSON.stringify(res.data ?? res.error),
    );
  }
  const fifth = await verify("0000");
  check("wrong try 5 locks the employee", fifth.data?.error === "locked", JSON.stringify(fifth.data ?? fifth.error));
  const whileLocked = await verify("1234");
  check("right PIN is refused while locked", whileLocked.data?.error === "locked", JSON.stringify(whileLocked.data));

  const status = await owner.rpc("employee_pin_status");
  const row = status.data?.find((r) => r.employee_id === employeeId);
  check("owner sees the lock", !!row?.locked_until, JSON.stringify(status.error ?? row));
  const cUnlock = await counter.rpc("unlock_employee", { p_employee_id: employeeId });
  check("iPad cannot unlock", !!cUnlock.error);
  const unlock = await owner.rpc("unlock_employee", { p_employee_id: employeeId });
  check("owner can unlock", !unlock.error, unlock.error?.message);
  const afterUnlock = await verify("1234");
  check("right PIN works after unlock", afterUnlock.data?.ok === true, JSON.stringify(afterUnlock.data));

  // --- Only owners change PINs ---------------------------------------------
  const selfChange = await counter.rpc("change_employee_pin", {
    p_employee_id: employeeId,
    p_current_pin: "1234",
    p_new_pin: "5678",
  });
  check("iPad cannot change a PIN", !!selfChange.error);
  const reset = await owner.rpc("set_employee_pin", { p_employee_id: employeeId, p_new_pin: "4321" });
  check("owner can reset a PIN", !reset.error, reset.error?.message);
  check("reset PIN works", (await verify("4321")).data?.ok === true);
  check("old PIN no longer works", (await verify("1234")).data?.error === "wrong_pin");

  // --- Deactivated employee ------------------------------------------------
  await owner.from("employees").update({ active: false }).eq("id", employeeId);
  const inactive = await verify("4321");
  check("deactivated employee is refused", inactive.data?.error === "unknown_employee", JSON.stringify(inactive.data));
} finally {
  const removed = await owner.from("employees").delete().eq("id", employeeId);
  check("test employee removed", !removed.error, removed.error?.message);
}

console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
