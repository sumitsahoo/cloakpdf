import { ArrowDownAZ, ArrowDownZA } from "lucide-react";

export type SortMode = "off" | "asc" | "desc";

interface SortByNameButtonProps {
  mode: SortMode;
  onChange: (mode: SortMode) => void;
}

const OPTIONS: { value: SortMode; label: string; Icon?: typeof ArrowDownAZ }[] = [
  { value: "off", label: "None" },
  { value: "asc", label: "A → Z", Icon: ArrowDownAZ },
  { value: "desc", label: "Z → A", Icon: ArrowDownZA },
];

export function SortByNameButton({ mode, onChange }: SortByNameButtonProps) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-dark-text-muted">
        Sort
      </span>
      <div className="inline-flex items-center gap-0.5 rounded-lg bg-slate-100 dark:bg-dark-bg p-0.5 border border-slate-200 dark:border-dark-border">
        {OPTIONS.map(({ value, label, Icon }) => {
          const active = mode === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(value)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-[transform,opacity,color,background-color,border-color,box-shadow] duration-150 ${
                active
                  ? "bg-primary-600 text-white font-semibold shadow-sm"
                  : "text-slate-500 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text"
              }`}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
