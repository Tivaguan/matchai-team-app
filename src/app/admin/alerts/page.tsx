"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { lockSupported, savedLock, turnLockOff, turnLockOn } from "@/lib/app-lock";
import { requestAlert } from "@/lib/notify";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

type Alert = Database["public"]["Enums"]["notification_alert"];

const ALERTS: { id: Alert; title: string; detail: string }[] = [
  { id: "day_opened", title: "Day opened", detail: "When the opening count is saved, with the amount in the drawer." },
  { id: "drawer_mismatch", title: "Drawer doesn't match", detail: "When the opening count differs from the last closing count." },
  { id: "expense_logged", title: "Expense logged", detail: "Each time cash is taken from the drawer." },
  { id: "day_closed", title: "Day closed", detail: "When the closing count is saved, with the cash sales of the day." },
  { id: "day_not_closed", title: "Day not closed", detail: "After midnight, if no closing count was saved for the day." },
  { id: "low_stock", title: "Low stock", detail: "When a stock change takes an item below its low level." },
  {
    id: "availability_reminder",
    title: "Availability reminder",
    detail: "On Saturday morning, if some employees have not answered for next week.",
  },
  { id: "all_answered", title: "Everyone has answered", detail: "When the last employee sends their availability for a week." },
  { id: "employee_locked", title: "Employee locked out", detail: "When someone enters a wrong PIN too many times." },
];

// What this device can do about notifications right now.
type DeviceState = "checking" | "unsupported" | "needs-install" | "blocked" | "off" | "on";

const SETTINGS_KEY = ["admin", "alert-settings"] as const;

/** The push key, in the form the browser asks for. */
function keyToBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(window.atob(padded), (character) => character.charCodeAt(0));
}

async function readDeviceState(): Promise<DeviceState> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    // iPhone and iPad only allow notifications once the app is on the home screen.
    const isApple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1);
    return isApple ? "needs-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "blocked";
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription && Notification.permission === "granted" ? "on" : "off";
}

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const [device, setDevice] = useState<DeviceState>("checking");
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    readDeviceState().then(setDevice);
  }, []);

  // The Face ID lock of this device: "none" when the phone cannot do it.
  const [lock, setLock] = useState<"checking" | "none" | "off" | "on">("checking");
  const [lockError, setLockError] = useState(false);
  const userId = session?.userId;
  useEffect(() => {
    if (!userId) return;
    lockSupported().then((supported) => setLock(!supported ? "none" : savedLock(userId) ? "on" : "off"));
  }, [userId]);

  async function toggleLock() {
    if (!session) return;
    setLockError(false);
    try {
      if (lock === "on") turnLockOff();
      else await turnLockOn(session.userId, session.name);
      setLock(lock === "on" ? "off" : "on");
    } catch {
      setLockError(true);
    }
  }

  const settings = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("notification_settings").select("alert, enabled");
      if (error) throw error;
      // No saved row means the alert is on.
      return new Map(data.map((row) => [row.alert, row.enabled]));
    },
  });

  const setAlert = useMutation({
    mutationFn: async ({ alert, enabled }: { alert: Alert; enabled: boolean }) => {
      const { error } = await supabase
        .from("notification_settings")
        .upsert({ owner_id: session!.userId, alert, enabled });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });

  const turnOn = useMutation({
    mutationFn: async () => {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("blocked");

      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyToBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
        }));

      const keys = subscription.toJSON().keys;
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          owner_id: session!.userId,
          endpoint: subscription.endpoint,
          p256dh: keys?.p256dh ?? "",
          auth: keys?.auth ?? "",
          user_agent: navigator.userAgent.slice(0, 200),
        },
        { onConflict: "endpoint" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      setDeviceError(null);
      setDevice("on");
    },
    onError: (error) => {
      if (error.message === "blocked") setDevice("blocked");
      else setDeviceError("Could not turn notifications on. Check your connection and try again.");
    },
  });

  const turnOff = useMutation({
    mutationFn: async () => {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return;
      await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
      await subscription.unsubscribe();
    },
    onSuccess: () => {
      setTestResult(null);
      setDevice("off");
    },
    onError: () => setDeviceError("Could not turn notifications off. Try again."),
  });

  const sendTest = useMutation({
    mutationFn: () => requestAlert({ type: "test" }),
    onSuccess: (sent) => {
      if (sent === null) setTestResult("The test could not be sent. Check your connection.");
      else if (sent === 0) setTestResult("No device received it. Turn notifications off and on again.");
      else setTestResult(`Sent to ${sent} ${sent === 1 ? "device" : "devices"}. It should appear in a few seconds.`);
    },
  });

  const rowClass = "flex items-center justify-between gap-6 border-b border-dashed border-ink/20 px-5 py-4";
  const detailClass = "text-sm text-ink/60";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="border-b border-ink pt-6 pb-3">
        <h1 className="font-serif text-3xl leading-none uppercase sm:text-5xl">Alerts</h1>
      </div>

      {settings.isError && <p className="text-destructive">Could not load your settings. Refresh the page.</p>}

      <ul className="flex flex-col bg-white">
        {/* First line: this phone or laptop. The lines below choose which alerts it gets. */}
        <li className={rowClass + " flex-wrap"}>
          <span className="flex min-w-0 flex-1 basis-56 flex-col">
            <span className="text-lg font-medium">This device</span>
            <span className={detailClass}>
              {device === "checking" && "Checking this device."}
              {device === "unsupported" && "This browser cannot show notifications. Use Safari or Chrome."}
              {device === "needs-install" &&
                "On iPhone and iPad, add the app to your home screen first: tap Share in Safari, then “Add to Home Screen”. Open it from the new icon and come back here."}
              {device === "blocked" && "Notifications are blocked. Allow them in your phone or browser settings, then reload this page."}
              {device === "off" && "Off. Turn it on once on each phone or laptop where you want alerts."}
              {device === "on" && (testResult ?? "On. This device receives the alerts chosen below.")}
            </span>
            {deviceError && <span className="text-sm text-destructive">{deviceError}</span>}
          </span>
          {device === "off" && (
            <Button className="h-11 shrink-0 px-5 text-base" disabled={turnOn.isPending} onClick={() => turnOn.mutate()}>
              {turnOn.isPending ? "Turning on" : "Turn on"}
            </Button>
          )}
          {device === "on" && (
            <span className="flex shrink-0 gap-2">
              <Button variant="outline" className="h-11 px-4 text-base" disabled={sendTest.isPending} onClick={() => sendTest.mutate()}>
                {sendTest.isPending ? "Sending" : "Test"}
              </Button>
              <Button variant="outline" className="h-11 px-4 text-base" disabled={turnOff.isPending} onClick={() => turnOff.mutate()}>
                Turn off
              </Button>
            </span>
          )}
        </li>

        {ALERTS.map((alert, index) => {
          const enabled = settings.data?.get(alert.id) ?? true;
          return (
            <li key={alert.id} className={rowClass + (index === ALERTS.length - 1 ? " border-b-0" : "")}>
              <span className="flex min-w-0 flex-col">
                <span id={`alert-${alert.id}`} className="text-lg font-medium">
                  {alert.title}
                </span>
                <span className={detailClass}>{alert.detail}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-labelledby={`alert-${alert.id}`}
                disabled={!settings.data || !session}
                onClick={() => setAlert.mutate({ alert: alert.id, enabled: !enabled })}
                className={
                  "relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50 " +
                  (enabled ? "bg-primary" : "bg-ink/25")
                }
              >
                <span
                  className={
                    "absolute top-1 left-1 size-6 rounded-full bg-white transition-transform " + (enabled ? "translate-x-6" : "")
                  }
                />
              </button>
            </li>
          );
        })}
      </ul>

      <p className="text-sm text-ink/60">These choices are yours only. The other owner has their own.</p>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 bg-white px-5 py-4">
        <span className="flex min-w-0 flex-1 basis-56 flex-col">
          <span className="text-lg font-medium">Face ID lock</span>
          <span className={detailClass}>
            {lock === "checking" && "Checking this device."}
            {lock === "none" && "Not available here. It needs a phone with Face ID or fingerprint, and the app on its secure address."}
            {lock === "off" && "Off. Turn it on to ask for Face ID or fingerprint each time the app opens on this phone."}
            {lock === "on" && "On. This phone asks for Face ID or fingerprint when the app opens."}
          </span>
          {lockError && <span className="text-sm text-destructive">That did not work. Try again.</span>}
        </span>
        {(lock === "off" || lock === "on") && (
          <Button variant={lock === "on" ? "outline" : "default"} className="h-11 shrink-0 px-5 text-base" onClick={toggleLock}>
            {lock === "on" ? "Turn off" : "Turn on"}
          </Button>
        )}
      </div>
    </div>
  );
}
