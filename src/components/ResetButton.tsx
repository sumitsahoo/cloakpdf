import { Undo2 } from "lucide-react";

interface ResetButtonProps {
  onClick: () => void;
  label?: string;
}

export function ResetButton({ onClick, label = "Reset" }: ResetButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-dark-text-muted dark:hover:text-dark-text transition-colors"
    >
      <Undo2 className="w-4 h-4" />
      {label}
    </button>
  );
}
