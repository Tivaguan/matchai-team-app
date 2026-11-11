import "server-only";
import { createClient } from "@supabase/supabase-js";
import { sendNotification, setVapidDetails } from "web-push";
import type { Database } from "@/lib/supabase/database.types";

// Server-side only: sends push notifications to the owners' devices.
// It uses the project's secret key, which must never reach the browser.

export type Alert = Database["public"]["Enums"]["notification_alert"];
export type Message = { title: string; body: string; url?: string };

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.");
  return createClient<Database>(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Admin = ReturnType<typeof createAdminClient>;

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error("Missing the web push keys.");
  setVapidDetails(process.env.VAPID_SUBJECT ?? "https://team.matchai.ma", publicKey, privateKey);
}

/**
 * Sends one message to every device of the given owners.
 * Devices that no longer exist are forgotten. Returns how many were reached.
 */
async function sendToDevices(admin: Admin, ownerIds: string[], message: Message) {
  if (ownerIds.length === 0) return 0;
  configureWebPush();

  const { data: devices, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("owner_id", ownerIds);
  if (error) throw error;

  let reached = 0;
  await Promise.all(
    devices.map(async (device) => {
      try {
        await sendNotification(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          JSON.stringify(message),
        );
        reached++;
      } catch (sendError) {
        const status = (sendError as { statusCode?: number }).statusCode;
        // 404 and 410 mean the device unsubscribed or was reset.
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", device.id);
        }
      }
    }),
  );
  return reached;
}

/** Today in the shop, as "2026-11-10". */
export function shopToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" }).format(new Date());
}

/** Sends an alert to every owner who has not turned that alert off. */
export async function sendAlert(admin: Admin, alert: Alert, message: Message) {
  const [owners, turnedOff] = await Promise.all([
    admin.from("profiles").select("user_id").eq("role", "owner"),
    admin.from("notification_settings").select("owner_id").eq("alert", alert).eq("enabled", false),
  ]);
  if (owners.error) throw owners.error;
  if (turnedOff.error) throw turnedOff.error;

  const off = new Set(turnedOff.data.map((row) => row.owner_id));
  const ownerIds = owners.data.map((row) => row.user_id).filter((id) => !off.has(id));
  return sendToDevices(admin, ownerIds, message);
}

/** Sends a message to one owner's devices, whatever their settings (used for the test button). */
export function sendToOwner(admin: Admin, ownerId: string, message: Message) {
  return sendToDevices(admin, [ownerId], message);
}

/**
 * Sends an alert that must go out only once for a given event, named by `key`
 * (for example "all_answered:2026-11-16"). A second call with the same key sends nothing.
 */
export async function sendAlertOnce(admin: Admin, key: string, alert: Alert, message: Message) {
  const { error } = await admin.from("notification_log").insert({ key });
  // 23505: this key is already there, so the alert was sent before.
  if (error) {
    if (error.code === "23505") return 0;
    throw error;
  }
  return sendAlert(admin, alert, message);
}

/** "2026-11-16" -> "Mon 16 Nov". */
export function dayLabel(day: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}
