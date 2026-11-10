"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase/client";

type EmployeeRow = {
  id: string;
  name: string;
  active: boolean;
  lockedUntil: string | null;
};

const EMPLOYEES_KEY = ["admin", "employees"] as const;
const PIN_PATTERN = /^[0-9]{4}$/;

async function loadEmployees(): Promise<EmployeeRow[]> {
  const [employees, status] = await Promise.all([
    supabase.from("employees").select("id, name, active").order("active", { ascending: false }).order("name"),
    supabase.rpc("employee_pin_status"),
  ]);
  if (employees.error) throw employees.error;
  if (status.error) throw status.error;

  const locks = new Map(status.data.map((row) => [row.employee_id, row.locked_until]));
  return employees.data.map((employee) => ({ ...employee, lockedUntil: locks.get(employee.id) ?? null }));
}

function PinField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>PIN (4 digits)</Label>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        className="h-12 text-lg tracking-[0.4em]"
      />
    </div>
  );
}

export default function EmployeesPage() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "employees"] });

  const { data: employees, isPending, isError } = useQuery({ queryKey: EMPLOYEES_KEY, queryFn: loadEmployees });

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [resetting, setResetting] = useState<EmployeeRow | null>(null);
  const [resetPin, setResetPin] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const addEmployee = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("create_employee", { p_name: newName.trim(), p_pin: newPin });
      if (error) throw error;
    },
    onSuccess: () => {
      setAdding(false);
      setNewName("");
      setNewPin("");
      refresh();
    },
    onError: () => setFormError("Could not add the employee. Check your connection and try again."),
  });

  const setPin = useMutation({
    mutationFn: async (employeeId: string) => {
      const { error } = await supabase.rpc("set_employee_pin", { p_employee_id: employeeId, p_new_pin: resetPin });
      if (error) throw error;
    },
    onSuccess: () => {
      setResetting(null);
      setResetPin("");
      refresh();
    },
    onError: () => setFormError("Could not change the PIN. Check your connection and try again."),
  });

  const unlock = useMutation({
    mutationFn: async (employeeId: string) => {
      const { error } = await supabase.rpc("unlock_employee", { p_employee_id: employeeId });
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const setActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("employees").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const canAdd = newName.trim().length > 0 && PIN_PATTERN.test(newPin);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-3">
        <h1 className="font-serif text-5xl leading-none uppercase">Employees</h1>
        <Button
          size="lg"
          className="h-11 px-5 text-base"
          onClick={() => {
            setFormError(null);
            setAdding(true);
          }}
        >
          Add employee
        </Button>
      </div>

      {isPending && <p className="text-muted-foreground">Loading employees.</p>}
      {isError && <p className="text-destructive">Could not load employees. Check your connection and refresh.</p>}
      {employees?.length === 0 && (
        <p className="text-lg text-muted-foreground">
          No employees yet. Add the first one so they can use the counter iPad.
        </p>
      )}

      <ul className="flex flex-col">
        {employees?.map((employee) => (
          <li
            key={employee.id}
            className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-ink/15 py-4"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <span
                className={
                  "font-label text-2xl font-semibold tracking-[0.06em] uppercase " +
                  (employee.active ? "" : "text-ink/40 line-through")
                }
              >
                {employee.name}
              </span>
              {!employee.active && (
                <span className="border border-ink/30 px-2 py-0.5 text-sm text-ink/60">Deactivated</span>
              )}
              {employee.active && employee.lockedUntil && (
                <span className="bg-destructive px-2 py-0.5 text-sm font-medium text-white">
                  Locked after wrong PINs
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {employee.active && employee.lockedUntil && (
                <Button variant="outline" className="h-10 px-4" onClick={() => unlock.mutate(employee.id)}>
                  Unlock
                </Button>
              )}
              {employee.active && (
                <Button
                  variant="outline"
                  className="h-10 px-4"
                  onClick={() => {
                    setFormError(null);
                    setResetPin("");
                    setResetting(employee);
                  }}
                >
                  Reset PIN
                </Button>
              )}
              <Button
                variant="ghost"
                className="h-10 px-4"
                onClick={() => setActive.mutate({ id: employee.id, active: !employee.active })}
              >
                {employee.active ? "Deactivate" : "Reactivate"}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add employee</DialogTitle>
            <DialogDescription>They pick this name on the iPad, then enter the PIN.</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canAdd) addEmployee.mutate();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-employee-name">Name</Label>
              <Input
                id="new-employee-name"
                autoComplete="off"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-12 text-lg"
              />
            </div>
            <PinField id="new-employee-pin" value={newPin} onChange={setNewPin} />
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="submit" className="h-11 px-5 text-base" disabled={!canAdd || addEmployee.isPending}>
                Add employee
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={resetting !== null} onOpenChange={(open) => !open && setResetting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset PIN for {resetting?.name}</DialogTitle>
            <DialogDescription>The old PIN stops working right away. Any lock is cleared.</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (resetting && PIN_PATTERN.test(resetPin)) setPin.mutate(resetting.id);
            }}
          >
            <PinField id="reset-employee-pin" value={resetPin} onChange={setResetPin} />
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button
                type="submit"
                className="h-11 px-5 text-base"
                disabled={!PIN_PATTERN.test(resetPin) || setPin.isPending}
              >
                Save new PIN
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
