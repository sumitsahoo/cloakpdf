interface CheckboxFieldProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  accent?: string;
}

export function CheckboxField({
  label,
  description,
  checked,
  onChange,
  accent = "accent-primary-600",
}: CheckboxFieldProps) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={`mt-0.5 h-4 w-4 shrink-0 rounded ${accent} cursor-pointer`}
      />
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-slate-700 dark:text-dark-text leading-snug">
          {label}
        </p>
        {description && (
          <p className="text-xs text-slate-400 dark:text-dark-text-muted leading-snug">
            {description}
          </p>
        )}
      </div>
    </label>
  );
}
