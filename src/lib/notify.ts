import { supabase } from "@/lib/supabase/client";

type AlertRequest =
  | { type: "low_stock"; itemId: string }
  | { type: "expense_logged" }
  | { type: "day_opened" }
  | { type: "day_closed" }
  | { type: "test" };

/**
 * Asks the server to alert the owners. Returns how many devices were reached,
 * or null if it could not be sent. A failed alert never blocks the counter.
 */
export async function requestAlert(alert: AlertRequest): Promise<number | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;

    const response = await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(alert),
    });
    if (!response.ok) return null;
    const result = (await response.json()) as { sent?: number };
    return result.sent ?? 0;
  } catch {
    return null;
  }
}

/**
 * Tells the server that something happened on a page the staff use without an
 * account. The server checks it against the database before alerting anyone.
 */
export function reportStaffEvent(event: { type: "all_answered"; weekStart: string } | { type: "employee_locked"; employeeId: string }) {
  void fetch("/api/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  }).catch(() => undefined);
}
