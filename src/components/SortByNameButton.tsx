import { ArrowDownAZ, ArrowDownZA } from "lucide-react";
import { SegmentedControl, type SegmentedOption } from "./SegmentedControl.tsx";

export type SortMode = "off" | "asc" | "desc";

interface SortByNameButtonProps {
  mode: SortMode;
  onChange: (mode: SortMode) => void;
}

const OPTIONS: readonly SegmentedOption<SortMode>[] = [
  { value: "off", label: "None" },
  { value: "asc", label: "A → Z", icon: ArrowDownAZ },
  { value: "desc", label: "Z → A", icon: ArrowDownZA },
];

export function SortByNameButton({ mode, onChange }: SortByNameButtonProps) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-dark-text-muted">
        Sort
      </span>
      <SegmentedControl
        size="sm"
        ariaLabel="Sort by file name"
        value={mode}
        onChange={onChange}
        options={OPTIONS}
      />
    </div>
  );
}
