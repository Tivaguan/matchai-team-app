"use client";

import { Popover } from "@base-ui/react/popover";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
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
export function Picker({ id, value, onChange, options, className = "min-w-36" }: PickerProps) {
  return (
    <Select items={options} value={value} onValueChange={(next) => onChange(next as string)}>
      <SelectTrigger id={id} className={`h-11 rounded-none border-ink/30 bg-white px-3 text-base data-[size=default]:h-11 ${className}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="py-2.5 text-base">
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
  /** A calendar to open when the label is tapped; call `close` once something is picked. */
  popup?: (close: () => void) => React.ReactNode;
  popupLabel?: string;
};

/** Moves one step back or forward in time, e.g. between months or days. */
export function Stepper({ label, onPrevious, onNext, previousLabel, nextLabel, popup, popupLabel }: StepperProps) {
  const [open, setOpen] = useState(false);
  const labelClass = "flex min-w-44 items-center justify-center px-4 text-base font-medium whitespace-nowrap";
  const arrowClass = "flex h-full w-11 items-center justify-center hover:bg-ink hover:text-paper";
  return (
    // One white control, so it stands out from the page: arrow, label, arrow.
    <div className="flex h-11 items-stretch border border-ink/30 bg-white">
      <button type="button" className={`${arrowClass} border-r border-ink/30`} onClick={onPrevious} aria-label={previousLabel}>
        <ChevronLeft className="size-5" aria-hidden="true" />
      </button>
      {popup ? (
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger
            aria-label={`${label}. ${popupLabel ?? "Pick a date"}`}
            className={`${labelClass} hover:bg-ink/10 data-[popup-open]:bg-ink data-[popup-open]:text-paper`}
          >
            {label}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner side="bottom" align="center" sideOffset={6} className="z-50">
              <Popover.Popup className="border border-ink bg-white p-3 text-ink shadow-lg outline-none">
                {popup(() => setOpen(false))}
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      ) : (
        <span className={labelClass} aria-live="polite">
          {label}
        </span>
      )}
      <button type="button" className={`${arrowClass} border-l border-ink/30`} onClick={onNext} aria-label={nextLabel}>
        <ChevronRight className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * The period as the page's big heading, with an arrow on each side.
 * Tapping the heading opens a calendar (`popup`).
 */
export function TitleStepper({ label, onPrevious, onNext, previousLabel, nextLabel, popup, popupLabel }: StepperProps) {
  const [open, setOpen] = useState(false);
  const arrowClass = "flex size-9 shrink-0 items-center justify-center hover:bg-ink hover:text-paper sm:size-11";
  const titleClass = "px-1 font-serif text-3xl leading-none whitespace-nowrap uppercase lining-nums sm:px-2 sm:text-5xl";
  return (
    // On a phone the title takes the whole line: arrows at the edges, the period centered.
    <div className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between sm:mr-0 sm:-ml-3 sm:w-auto sm:justify-start">
      <button type="button" className={arrowClass} onClick={onPrevious} aria-label={previousLabel}>
        <ChevronLeft className="size-6" aria-hidden="true" />
      </button>
      {popup ? (
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger
            aria-label={`${label}. ${popupLabel ?? "Pick a date"}`}
            className={`${titleClass} min-w-0 py-1 hover:bg-ink/10 data-[popup-open]:bg-ink/10`}
          >
            {label}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner side="bottom" align="start" sideOffset={6} className="z-50">
              <Popover.Popup className="border border-ink bg-white p-3 text-ink shadow-lg outline-none">
                {popup(() => setOpen(false))}
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      ) : (
        <span className={titleClass} aria-live="polite">
          {label}
        </span>
      )}
      <button type="button" className={arrowClass} onClick={onNext} aria-label={nextLabel}>
        <ChevronRight className="size-6" aria-hidden="true" />
      </button>
    </div>
  );
}

type IconMenuProps = {
  /** What the button does, read out by screen readers (it only shows an icon). */
  label: string;
  icon: React.ReactNode;
  items: { label: string; onSelect: () => void; disabled?: boolean }[];
  /** "solid" is the black button, for the page's main action. */
  tone?: "plain" | "solid";
  /** Which edge of the button the list lines up with. */
  align?: "start" | "end";
};

/** A small square icon button that opens a short list of choices under it. */
export function IconMenu({ label, icon, items, tone = "plain", align = "end" }: IconMenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={label}
        className={
          "flex size-11 items-center justify-center border " +
          (tone === "solid"
            ? "border-ink bg-ink text-paper hover:bg-sage hover:text-ink data-[popup-open]:bg-sage data-[popup-open]:text-ink"
            : "border-ink/30 bg-white hover:bg-ink hover:text-paper data-[popup-open]:bg-ink data-[popup-open]:text-paper")
        }
      >
        {icon}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align={align} sideOffset={6} className="z-50">
          <Popover.Popup className="flex w-48 flex-col border border-ink bg-white p-1 text-ink shadow-lg outline-none">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className="flex h-11 items-center px-3 text-left text-base font-medium hover:bg-ink hover:text-paper disabled:pointer-events-none disabled:opacity-40"
              >
                {item.label}
              </button>
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

type SwitchProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
};

/** A small two-or-three way switch, in the same white control as the stepper. */
export function Switch<T extends string>({ value, onChange, options, label }: SwitchProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex h-11 items-stretch border border-ink/30 bg-white">
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={
            "px-5 text-base font-medium " +
            (index > 0 ? "border-l border-ink/30 " : "") +
            (option.value === value ? "bg-ink text-paper" : "hover:bg-ink/10")
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
