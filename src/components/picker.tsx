"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Option = { value: string; label: string };

type PickerProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  className?: string;
};

/** A dropdown list in the app's own style (never the browser's native one). */
export function Picker({ id, value, onChange, options, className = "" }: PickerProps) {
  return (
    <Select items={options} value={value} onValueChange={(next) => onChange(next as string)}>
      <SelectTrigger id={id} className={`h-11 min-w-36 rounded-md bg-white px-3 text-base data-[size=default]:h-11 ${className}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="py-2 text-base">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type StepperProps = {
  label: string;
  onPrevious: () => void;
  onNext: () => void;
  previousLabel: string;
  nextLabel: string;
};

/** Moves one step back or forward in time, e.g. between months or days. */
export function Stepper({ label, onPrevious, onNext, previousLabel, nextLabel }: StepperProps) {
  const arrowClass =
    "flex size-11 items-center justify-center rounded-md border border-input bg-white hover:bg-secondary active:bg-accent";
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={arrowClass} onClick={onPrevious} aria-label={previousLabel}>
        <ChevronLeft className="size-5" aria-hidden="true" />
      </button>
      <span className="min-w-44 text-center text-base font-medium" aria-live="polite">
        {label}
      </span>
      <button type="button" className={arrowClass} onClick={onNext} aria-label={nextLabel}>
        <ChevronRight className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}
