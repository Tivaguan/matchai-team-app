// Checks the cashier log, expenses and stock rules against the dev project.
// Needs today to be "not opened". Creates test rows and removes them at the end,
// which needs the secret key (logs cannot be deleted by any app account).
//
// Usage: SUPABASE_SECRET_KEY=... node --env-file=.env.local scripts/test-modules.mjs

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
async function signIn(email, password) {
  const client = createClient(url, key, noSession);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}

const admin = createClient(url, secretKey, noSession);
const visitor = createClient(url, key, noSession);
const owner = await signIn(process.env.TEST_OWNER_EMAIL, process.env.TEST_OWNER_PASSWORD);
const counter = await signIn(process.env.TEST_COUNTER_EMAIL, process.env.TEST_COUNTER_PASSWORD);

const status = await counter.rpc("get_day_status");
if (status.data?.state !== "not_opened") {
  console.error(`Today is already "${status.data?.state}" on the dev project. Run this on a day with no counts.`);
  process.exit(1);
}

const PIN = "1234";
const employee = await owner.rpc("create_employee", { p_name: "Zz Module Test", p_pin: PIN });
const employeeId = employee.data;
const category = await owner.from("stock_categories").insert({ name: "Zz Test Category" }).select("id").single();
const item = await owner
  .from("stock_items")
  .insert({ category_id: category.data.id, name: "Zz Test Item", unit: "L", starting_quantity: 10, low_stock_level: 5 })
  .select("id")
  .single();
const itemId = item.data.id;
check("owner can add a category and an item", !category.error && !item.error, category.error?.message ?? item.error?.message);

const who = { p_employee_id: employeeId, p_pin: PIN };
// A count is a number of each note and coin; the server works out the total.
const count = (kind, breakdown, pin = PIN) =>
  counter.rpc("log_cash_count", { p_employee_id: employeeId, p_pin: pin, p_kind: kind, p_breakdown: breakdown });
const expense = (amount, reason) => counter.rpc("log_expense", { ...who, p_amount: amount, p_reason: reason });
const adjust = (amount) => counter.rpc("adjust_stock", { ...who, p_item_id: itemId, p_amount: amount });
const state = async () => (await counter.rpc("get_day_status")).data?.state;

try {
  // --- Before the day is opened --------------------------------------------
  let res = await expense(20, "Ice");
  check("expense is refused before opening", res.data?.error === "day_not_open", show(res));
  res = await adjust(-1);
  check("stock change is refused before opening", res.data?.error === "day_not_open", show(res));
  res = await count("closing", { 200: 2 });
  check("closing is refused before opening", res.data?.error === "day_not_open", show(res));

  // --- Opening --------------------------------------------------------------
  res = await count("opening", { 200: 2 }, "0000");
  check("opening with a wrong PIN is refused", res.data?.error === "wrong_pin", show(res));
  check("the day is still not opened", (await state()) === "not_opened");
  res = await visitor.rpc("log_cash_count", { ...who, p_kind: "opening", p_breakdown: { 200: 2 } });
  check("visitor cannot log a count", !!res.error);
  res = await count("opening", { 200: -1 });
  check("negative count is refused", res.data?.error === "invalid_amount", show(res));
  res = await count("opening", { 3: 1 });
  check("a note that does not exist is refused", res.data?.error === "invalid_amount", show(res));
  res = await count("opening", { 200: 2, 100: 1, 20: 0, 0.5: 1 });
  check(
    "opening count opens the day and totals 500.50",
    res.data?.ok === true && res.data.state === "open" && Number(res.data.amount) === 500.5,
    show(res),
  );
  res = await count("opening", { 200: 3 });
  check("a second opening is refused", res.data?.error === "already_opened", show(res));

  // --- Expenses -------------------------------------------------------------
  res = await expense(0, "Ice");
  check("expense of 0 is refused", res.data?.error === "invalid_amount", show(res));
  res = await expense(20, "   ");
  check("expense with no reason is refused", res.data?.error === "invalid_reason", show(res));
  res = await visitor.rpc("log_expense", { ...who, p_amount: 20, p_reason: "Ice" });
  check("visitor cannot log an expense", !!res.error);
  res = await expense(35.75, "  Ice bags  ");
  check("expense is accepted while open", res.data?.ok === true, show(res));
  res = await counter.from("expenses").insert({ amount: 5, reason: "Direct", employee_id: employeeId }).select();
  check("iPad cannot write expenses directly", !!res.error);
  res = await owner.from("expenses").select("amount, reason, day").eq("employee_id", employeeId);
  check(
    "owner sees the expense, trimmed",
    res.data?.length === 1 && Number(res.data[0].amount) === 35.75 && res.data[0].reason === "Ice bags",
    show(res),
  );

  // --- Stock ----------------------------------------------------------------
  res = await counter.rpc("get_counter_stock");
  const listed = res.data?.find((row) => row.item_id === itemId);
  check("iPad sees the item at its starting quantity", Number(listed?.current_quantity) === 10, show(res));
  res = await adjust(-6);
  check(
    "removing 6 gives 4 and flags low stock",
    res.data?.ok === true && Number(res.data.quantity_after) === 4 && res.data.became_low === true,
    show(res),
  );
  res = await adjust(-5);
  check("cannot remove more than there is", res.data?.error === "not_enough_stock", show(res));
  res = await adjust(2.5);
  check(
    "adding 2.5 gives 6.5, not flagged again",
    res.data?.ok === true && Number(res.data.quantity_after) === 6.5 && res.data.became_low === false,
    show(res),
  );
  res = await adjust(0);
  check("a change of 0 is refused", res.data?.error === "invalid_amount", show(res));
  res = await counter.from("stock_changes").select("id").eq("item_id", itemId);
  check("iPad cannot read the stock log", !!res.error || res.data.length === 0);
  res = await counter.from("stock_changes").insert({
    item_id: itemId,
    employee_id: employeeId,
    amount: 1,
    quantity_before: 0,
    quantity_after: 1,
  });
  check("iPad cannot write the stock log directly", !!res.error);
  res = await owner.from("stock_changes").select("amount, quantity_before, quantity_after").eq("item_id", itemId).order("id");
  check(
    "owner sees both changes with before and after",
    res.data?.length === 2 &&
      Number(res.data[0].quantity_before) === 10 &&
      Number(res.data[0].quantity_after) === 4 &&
      Number(res.data[1].quantity_after) === 6.5,
    show(res),
  );
  res = await owner.from("stock_levels").select("current_quantity, is_low").eq("item_id", itemId).single();
  check("stock level matches the log", Number(res.data?.current_quantity) === 6.5 && res.data.is_low === false, show(res));
  res = await owner.from("stock_changes").delete().eq("item_id", itemId).select();
  check("owner cannot delete log entries", !!res.error || res.data.length === 0);

  // --- Closing --------------------------------------------------------------
  res = await count("closing", { 200: 6 });
  check("closing count closes the day", res.data?.ok === true && res.data.state === "closed", show(res));
  res = await expense(10, "Late");
  check("expense is refused after closing", res.data?.error === "day_not_open", show(res));
  res = await adjust(1);
  check("stock change is refused after closing", res.data?.error === "day_not_open", show(res));
  res = await count("closing", { 200: 6, 50: 1 });
  check("closing count can be redone", res.data?.ok === true, show(res));
  res = await owner.from("cash_counts").select("kind, amount, breakdown").eq("employee_id", employeeId).order("id");
  check(
    "owner sees opening and both closing counts",
    res.data?.length === 3 && Number(res.data[0].amount) === 500.5 && Number(res.data[2].amount) === 1250,
    show(res),
  );
  check(
    "the notes and coins are kept, without the zero lines",
    JSON.stringify(res.data?.[0].breakdown) === JSON.stringify({ "0.5": 1, 100: 1, 200: 2 }),
    show(res),
  );
  res = await counter.from("cash_counts").select("id").limit(1);
  check("iPad cannot read cash counts", !!res.error || res.data.length === 0);
} finally {
  // Remove everything this run created. Only the secret key can delete logs.
  await admin.from("stock_changes").delete().eq("employee_id", employeeId);
  await admin.from("expenses").delete().eq("employee_id", employeeId);
  await admin.from("cash_counts").delete().eq("employee_id", employeeId);
  await admin.from("stock_items").delete().eq("id", itemId);
  await admin.from("stock_categories").delete().eq("id", category.data.id);
  const removed = await admin.from("employees").delete().eq("id", employeeId);
  check("test rows removed", !removed.error && (await state()) === "not_opened", removed.error?.message);
}

console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
