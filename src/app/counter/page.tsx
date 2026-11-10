"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { NoteIcon, ShopIcon, TinIcon } from "@/components/brand-icons";
import { PinPad } from "@/components/counter/pin-pad";
import { RoleGate } from "@/components/role-gate";
import { supabase } from "@/lib/supabase/client";

// The day is opened with a drawer count, and closed with one.
// Stock and expenses can only be logged while it is open.
type DayState = "not_opened" | "open" | "closed";

type PinResult =
  | { ok: true }
  | { ok: false; error: "wrong_pin"; tries_left: number }
  | { ok: false; error: "locked"; locked_until: string }
  | { ok: false; error: "unknown_employee" };

const ACTIONS = {
  open: { label: "Open the day", Icon: ShopIcon },
  stock: { label: "Stock", Icon: TinIcon },
  expense: { label: "Expense", Icon: NoteIcon },
  close: { label: "Close the day", Icon: ShopIcon },
} as const;

type ActionId = keyof typeof ACTIONS;
type Employee = { id: string; name: string };

// With nobody touching the screen, an open flow goes back to the home screen.
const IDLE_MS = 60_000;

const labelClass = "font-label font-semibold tracking-[0.06em] uppercase";
const noteClass = "font-label font-medium tracking-[0.14em] uppercase";
const tileClass =
  "flex min-h-44 touch-manipulation flex-col items-center justify-center gap-6 p-6 text-center transition-colors select-none";

function pinMessage(result: PinResult): string | null {
  if (result.ok) return null;
  if (result.error === "wrong_pin") {
    return result.tries_left === 1 ? "Wrong PIN · 1 try left" : `Wrong PIN · ${result.tries_left} tries left`;
  }
  if (result.error === "locked") {
    const time = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Casablanca",
    }).format(new Date(result.locked_until));
    return `Locked until ${time} · ask an owner`;
  }
  return "Ask an owner to set your PIN";
}

function Counter() {
  const [actionId, setActionId] = useState<ActionId | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [verified, setVerified] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [padKey, setPadKey] = useState(0);

  // The date is read after load, so the page shell can be served instantly.
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(
      new Intl.DateTimeFormat("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "Africa/Casablanca",
      }).format(new Date()),
    );
  }, []);

  const dayQuery = useQuery({
    queryKey: ["day-status"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_day_status");
      if (error) throw error;
      return data as { day: string; state: DayState };
    },
  });

  const employeesQuery = useQuery({
    queryKey: ["employees", "active"],
    queryFn: async (): Promise<Employee[]> => {
      const { data, error } = await supabase.from("employees").select("id, name").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const verifyPin = useMutation({
    mutationFn: async ({ employeeId, pin }: { employeeId: string; pin: string }) => {
      const { data, error } = await supabase.rpc("verify_employee_pin", { p_employee_id: employeeId, p_pin: pin });
      if (error) throw error;
      return data as PinResult;
    },
    onSuccess: (result) => {
      if (result.ok) {
        setVerified(true);
        return;
      }
      setPinError(pinMessage(result));
      setPadKey((key) => key + 1);
    },
    onError: () => {
      setPinError("No connection · try again");
      setPadKey((key) => key + 1);
    },
  });

  const backToHome = useCallback(() => {
    setActionId(null);
    setEmployee(null);
    setVerified(false);
    setPinError(null);
  }, []);

  function backOneStep() {
    if (employee && !verified) {
      setEmployee(null);
      setPinError(null);
    } else {
      backToHome();
    }
  }

  // Idle timer: any touch restarts it.
  useEffect(() => {
    if (!actionId) return;
    let timer = setTimeout(backToHome, IDLE_MS);
    const restart = () => {
      clearTimeout(timer);
      timer = setTimeout(backToHome, IDLE_MS);
    };
    window.addEventListener("pointerdown", restart);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", restart);
    };
  }, [actionId, backToHome]);

  const action = actionId ? ACTIONS[actionId] : null;
  const day = dayQuery.data?.state;

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-ink text-paper md:h-dvh">
      <header className="flex items-end justify-between gap-6 px-6 pt-6 pb-4 sm:px-8">
        <span className="font-brand text-5xl leading-none uppercase">Matchai</span>
        <span className="flex flex-col items-end gap-1 text-right">
          <span className="font-serif text-2xl leading-none italic">Sip green, feel seen.</span>
          <span className={`${noteClass} min-h-6 text-base text-paper/60`}>{today}</span>
        </span>
      </header>

      {!action && !day && (
        <main className="flex flex-1 items-center justify-center px-6 pb-6 text-center">
          <p className={`${noteClass} text-xl text-paper/60`}>
            {dayQuery.isError ? "No connection · check the Wi-Fi" : "Loading"}
          </p>
        </main>
      )}

      {!action && day === "not_opened" && (
        <main className="flex flex-1 px-6 pb-6 sm:px-8 sm:pb-8">
          <button
            type="button"
            onClick={() => setActionId("open")}
            className={`${tileClass} flex-1 bg-paper text-ink active:bg-sage`}
          >
            <ShopIcon className="size-32" />
            <span className="font-brand text-7xl leading-none uppercase lg:text-8xl">Open the day</span>
            <span className={`${noteClass} text-xl text-ink/60`}>Count the drawer to start</span>
          </button>
        </main>
      )}

      {!action && day === "open" && (
        <main className="grid flex-1 grid-cols-1 gap-1.5 px-6 pb-6 sm:px-8 sm:pb-8 md:min-h-0 md:grid-cols-3">
          {(["stock", "expense"] as const).map((id) => {
            const { label, Icon } = ACTIONS[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActionId(id)}
                className={`${tileClass} bg-paper text-ink active:bg-sage`}
              >
                <Icon className="size-28" />
                <span className="font-brand text-6xl leading-none uppercase lg:text-7xl">{label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setActionId("close")}
            className={`${tileClass} border border-paper/40 text-paper active:bg-paper active:text-ink`}
          >
            <ShopIcon className="size-28" />
            <span className="font-brand text-6xl leading-none uppercase lg:text-7xl">Close the day</span>
          </button>
        </main>
      )}

      {!action && day === "closed" && (
        <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 pb-6 text-center sm:px-8 sm:pb-8">
          <ShopIcon className="size-28 text-paper/40" />
          <h1 className="font-serif text-7xl leading-none uppercase">Day closed</h1>
          <p className={`${noteClass} text-xl text-paper/60`}>See you tomorrow</p>
          <button
            type="button"
            onClick={() => setActionId("close")}
            className={`${labelClass} h-14 touch-manipulation border border-paper/40 px-6 text-xl select-none active:bg-paper active:text-ink`}
          >
            Redo closing count
          </button>
        </main>
      )}

      {action && (
        <main className="flex flex-1 flex-col gap-6 px-6 pb-6 sm:px-8 sm:pb-8">
          <div className="flex items-center gap-5 border-t border-paper/25 pt-4">
            <button
              type="button"
              onClick={backOneStep}
              className={`${labelClass} flex h-14 touch-manipulation items-center gap-2 border border-paper/40 px-5 text-xl select-none active:bg-paper active:text-ink`}
            >
              <ArrowLeft className="size-5" aria-hidden="true" />
              Back
            </button>
            <span className={`${labelClass} flex items-center gap-3 text-2xl`}>
              <action.Icon className="size-7" />
              {action.label}
            </span>
          </div>

          {!employee && (
            <section className="flex flex-col gap-6">
              <h1 className="font-serif text-6xl leading-none uppercase">Who are you?</h1>
              {employeesQuery.isPending && <p className={`${noteClass} text-xl text-paper/60`}>Loading</p>}
              {employeesQuery.isError && (
                <p className={`${noteClass} text-xl text-paper/60`}>No connection · check the Wi-Fi</p>
              )}
              {employeesQuery.data?.length === 0 && (
                <p className={`${noteClass} text-xl text-paper/60`}>No employees yet · an owner adds them</p>
              )}
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {employeesQuery.data?.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setEmployee(item)}
                    className={`${labelClass} h-28 touch-manipulation bg-paper px-3 text-3xl text-ink transition-colors select-none active:bg-sage`}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </section>
          )}

          {employee && !verified && (
            <section className="flex flex-1 flex-col items-center gap-4">
              <h1 className="text-center font-serif text-6xl leading-none uppercase">Hi {employee.name}</h1>
              <PinPad
                key={padKey}
                disabled={verifyPin.isPending}
                error={pinError}
                onComplete={(pin) => verifyPin.mutate({ employeeId: employee.id, pin })}
              />
            </section>
          )}

          {employee && verified && (
            <section className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
              <h1 className="font-serif text-6xl leading-none uppercase">PIN accepted</h1>
              <p className={`${noteClass} text-xl text-paper/60`}>The {action.label.toLowerCase()} screen is coming next</p>
              <button
                type="button"
                onClick={backToHome}
                className={`${labelClass} h-16 touch-manipulation bg-paper px-10 text-2xl text-ink select-none active:bg-sage`}
              >
                Back to home
              </button>
            </section>
          )}
        </main>
      )}
    </div>
  );
}

export default function CounterPage() {
  return (
    <RoleGate role="counter">
      <Counter />
    </RoleGate>
  );
}
