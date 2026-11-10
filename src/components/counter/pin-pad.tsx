"use client";

import { Delete } from "lucide-react";
import { useState } from "react";

const PIN_LENGTH = 4;

// Shuffles the ten digits so nobody can learn a PIN by watching finger positions.
function shuffledDigits(): number[] {
  const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const random = new Uint32Array(digits.length);
  crypto.getRandomValues(random);
  for (let i = digits.length - 1; i > 0; i--) {
    const j = random[i] % (i + 1);
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return digits;
}

type PinPadProps = {
  /** Called once all four digits are entered. */
  onComplete: (pin: string) => void;
  disabled?: boolean;
  error?: string | null;
  /** Shuffle the digits (default). Turn off on a personal phone, where nobody is watching. */
  shuffle?: boolean;
};

const ORDERED_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

/** Shuffled 4-digit keypad. Made to sit on the dark counter background. */
export function PinPad({ onComplete, disabled = false, error = null, shuffle = true }: PinPadProps) {
  const [digits] = useState(() => (shuffle ? shuffledDigits() : ORDERED_DIGITS));
  const [pin, setPin] = useState("");

  function press(digit: number) {
    if (disabled || pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === PIN_LENGTH) onComplete(next);
  }

  const keyClass =
    "flex h-[min(6rem,11dvh)] items-center justify-center bg-paper font-label text-5xl font-semibold text-ink " +
    "touch-manipulation select-none transition-colors active:bg-sage disabled:opacity-40";

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-5">
      <p
        className={
          "min-h-7 text-center font-label text-xl font-medium tracking-[0.18em] uppercase " +
          (error ? "text-destructive" : "text-paper/60")
        }
        aria-live="polite"
      >
        {error ?? "Enter your PIN"}
      </p>

      <div className="flex gap-5" role="status" aria-label={`${pin.length} of ${PIN_LENGTH} digits entered`}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span
            key={i}
            className={
              "size-5 rounded-full border-2 border-paper transition-colors " +
              (i < pin.length ? "bg-paper" : "bg-transparent")
            }
          />
        ))}
      </div>

      <div className="grid w-full grid-cols-3 gap-1.5">
        {digits.slice(0, 9).map((digit) => (
          <button key={digit} type="button" className={keyClass} disabled={disabled} onClick={() => press(digit)}>
            {digit}
          </button>
        ))}
        <span />
        <button type="button" className={keyClass} disabled={disabled} onClick={() => press(digits[9])}>
          {digits[9]}
        </button>
        <button
          type="button"
          className={keyClass}
          disabled={disabled || pin.length === 0}
          onClick={() => setPin(pin.slice(0, -1))}
          aria-label="Delete last digit"
        >
          <Delete className="size-9" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
