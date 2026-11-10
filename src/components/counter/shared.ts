export type Employee = { id: string; name: string };

/** What every counter action needs: who is acting, and their PIN for the server to check. */
export type Actor = { employee: Employee; pin: string };

export type ActionResult = { ok: true; [key: string]: unknown } | { ok: false; error: string; [key: string]: unknown };

export const labelClass = "font-label font-semibold tracking-[0.06em] uppercase";
export const noteClass = "font-label font-medium tracking-[0.14em] uppercase";
export const primaryButtonClass =
  `${labelClass} h-16 touch-manipulation bg-paper px-10 text-2xl text-ink select-none active:bg-sage ` +
  "disabled:bg-paper/25 disabled:text-ink/60";

const MESSAGES: Record<string, string> = {
  day_not_open: "The day is not open",
  already_opened: "The day is already open",
  invalid_amount: "Enter an amount first",
  invalid_reason: "Write a short reason",
  unknown_item: "This item was removed · go back and retry",
  wrong_pin: "Wrong PIN · go back and retry",
  locked: "Locked after wrong PINs · ask an owner",
  unknown_employee: "Ask an owner to check your name",
};

export function errorMessage(code: string) {
  return MESSAGES[code] ?? "Something went wrong · try again";
}
