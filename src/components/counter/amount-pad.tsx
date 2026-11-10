"use client";

import { Delete } from "lucide-react";

type AmountPadProps = {
  /** The amount as typed, e.g. "12.5". Empty means nothing typed yet. */
  value: string;
  onChange: (value: string) => void;
  /** How many digits are allowed after the point. */
  decimals: number;
  disabled?: boolean;
};

const MAX_WHOLE_DIGITS = 7;

/** A plain number keypad (not shuffled) for money and quantities. */
export function AmountPad({ value, onChange, decimals, disabled = false }: AmountPadProps) {
  function press(key: string) {
    if (key === ".") {
      if (decimals === 0 || value.includes(".")) return;
      onChange(value === "" ? "0." : `${value}.`);
      return;
    }
    const [whole, fraction] = value.split(".");
    if (fraction !== undefined) {
      if (fraction.length >= decimals) return;
    } else if (whole.length >= MAX_WHOLE_DIGITS) {
      return;
    }
    onChange(value === "0" ? key : value + key);
  }

  const keyClass =
    "flex h-[min(5rem,9.5dvh)] items-center justify-center bg-paper font-label text-4xl font-semibold text-ink " +
    "touch-manipulation select-none transition-colors active:bg-sage disabled:opacity-40";

  return (
    <div className="grid w-full grid-cols-3 gap-1.5">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"].map((key) => (
        <button key={key} type="button" className={keyClass} disabled={disabled} onClick={() => press(key)}>
          {key}
        </button>
      ))}
      <button
        type="button"
        className={keyClass}
        disabled={disabled || value === ""}
        onClick={() => onChange(value.slice(0, -1))}
        aria-label="Delete last digit"
      >
        <Delete className="size-8" aria-hidden="true" />
      </button>
    </div>
  );
}
