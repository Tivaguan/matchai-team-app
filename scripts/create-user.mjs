// Creates a login account (owner or counter iPad) and its profile.
//
// Usage:
//   SUPABASE_SECRET_KEY=... NEW_USER_PASSWORD=... \
//     node --env-file=.env.local scripts/create-user.mjs <owner|counter> <email> "<name>"
//
// The secret key is in the Supabase dashboard (Settings > API keys).
// Never put it in a file that is committed.

import { createClient } from "@supabase/supabase-js";

const [role, email, name] = process.argv.slice(2);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const password = process.env.NEW_USER_PASSWORD;

if (!["owner", "counter"].includes(role) || !email || !name) {
  console.error('Usage: create-user.mjs <owner|counter> <email> "<name>"');
  process.exit(1);
}
if (!url || !secretKey || !password) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY or NEW_USER_PASSWORD.");
  process.exit(1);
}

const supabase = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (error) {
  console.error("Could not create the account:", error.message);
  process.exit(1);
}

const { error: profileError } = await supabase
  .from("profiles")
  .insert({ user_id: data.user.id, role, name });
if (profileError) {
  await supabase.auth.admin.deleteUser(data.user.id);
  console.error("Could not create the profile:", profileError.message);
  process.exit(1);
}

console.log(`Created ${role} account for ${email}.`);
