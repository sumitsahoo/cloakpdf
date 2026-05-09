import { ArrowDownAZ, ArrowDownUp, ArrowDownZA } from "lucide-react";

export type SortMode = "off" | "asc" | "desc";

interface SortByNameButtonProps {
  mode: SortMode;
  onClick: () => void;
}

export function SortByNameButton({ mode, onClick }: SortByNameButtonProps) {
  const isActive = mode !== "off";
  const Icon = mode === "asc" ? ArrowDownAZ : mode === "desc" ? ArrowDownZA : ArrowDownUp;
  const label = mode === "asc" ? "Name: A → Z" : mode === "desc" ? "Name: Z → A" : "Sort by name";
  const title =
    mode === "off"
      ? "Sort by file name"
      : mode === "asc"
        ? "Sorted A → Z — click for Z → A"
        : "Sorted Z → A — click to clear";

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={isActive}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-lg border transition-all duration-150 select-none ${
        isActive
          ? "border-primary-200 dark:border-primary-700/60 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium shadow-sm"
          : "border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface text-slate-500 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text hover:bg-slate-50 dark:hover:bg-dark-surface-alt"
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}
