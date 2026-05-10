/**
 * Generic segmented (radio-style) toggle control.
 *
 * Two visual sizes:
 *  - "md"  full-width form control (page size, output format, modes)
 *  - "sm"  compact inline pill row (sort, view toggles)
 *
 * Pass `fullWidth` for the wide layout where each option fills the row.
 * Without it the control is `inline-flex` and sizes to its options — used
 * for header-area toggles like ComparePdf's "Side by Side / Diff Overlay".
 */

import type { ComponentType, ReactNode } from "react";

export interface SegmentedOption<T extends string | number | boolean> {
  value: T;
  label: ReactNode;
  /** Optional leading icon (lucide). Renders at 14×14 in sm, 14×14 in md. */
  icon?: ComponentType<{ className?: string }>;
}

interface SegmentedControlProps<T extends string | number | boolean> {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  /** Visual size. Defaults to "md". */
  size?: "sm" | "md";
  /** Stretch the control to fill its container; each option becomes flex-1. */
  fullWidth?: boolean;
  /** Accessible name for the group; rendered as a <fieldset> legend if provided. */
  ariaLabel?: string;
}

const SIZE = {
  sm: {
    track: "gap-0.5 rounded-lg p-0.5",
    button: "px-2.5 py-1 text-xs rounded-md",
    icon: "w-3.5 h-3.5",
  },
  md: {
    track: "gap-0.5 rounded-xl p-1",
    button: "rounded-lg py-1.5 px-3 text-sm",
    icon: "w-3.5 h-3.5",
  },
} as const;

export function SegmentedControl<T extends string | number | boolean>({
  value,
  onChange,
  options,
  size = "md",
  fullWidth = false,
  ariaLabel,
}: SegmentedControlProps<T>) {
  const s = SIZE[size];
  const trackClasses = `inline-flex items-center ${s.track} bg-slate-100 dark:bg-dark-bg border border-slate-200 dark:border-dark-border ${
    fullWidth ? "w-full" : ""
  }`;

  return (
    <div role="group" aria-label={ariaLabel} className={trackClasses}>
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        const buttonClasses = `inline-flex items-center justify-center gap-1.5 ${s.button} transition-[transform,opacity,color,background-color,border-color,box-shadow] duration-150 ${
          fullWidth ? "flex-1" : ""
        } ${
          active
            ? "font-semibold text-white bg-primary-600 shadow-sm"
            : "font-medium text-slate-500 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text hover:bg-white/60 dark:hover:bg-dark-surface-alt"
        }`;
        return (
          <button
            key={String(opt.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={buttonClasses}
          >
            {Icon && <Icon className={s.icon} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
