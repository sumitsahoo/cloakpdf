interface LabeledSliderProps {
  id?: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  displayValue?: string;
  onChange: (value: number) => void;
  accent?: string;
}

export function LabeledSlider({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  displayValue,
  onChange,
  accent = "accent-primary-600",
}: LabeledSliderProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-dark-text">
          {label}
        </label>
        <span className="inline-flex items-center rounded-full bg-primary-100 dark:bg-primary-900/40 px-2 py-0.5 text-xs font-semibold text-primary-700 dark:text-primary-300 tabular-nums">
          {displayValue ?? `${value}${unit}`}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full ${accent} cursor-pointer`}
      />
    </div>
  );
}
