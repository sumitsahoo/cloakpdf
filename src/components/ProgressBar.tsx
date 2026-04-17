/**
 * Determinate progress bar with an optional label above it.
 *
 * Used by any tool that processes pages sequentially (Compress,
 * PdfToImage, Grayscale, ContactSheet, OCR). The bar reflects the
 * `current / total` ratio; if `total` is 0 the bar is rendered empty
 * rather than NaN-filled.
 *
 * Styling follows the app's violet "transform" accent by default;
 * override via the `color` prop (a Tailwind background class).
 */
interface ProgressBarProps {
  /** Completed units (e.g. rendered page count). */
  current: number;
  /** Total units of work. Must be ≥ `current`. A `total` of 0 renders an empty bar. */
  total: number;
  /** Left-hand label above the bar. Defaults to "Processing…". */
  label?: string;
  /**
   * Tailwind background class for the filled portion of the bar.
   * Defaults to the app's violet transform accent.
   */
  color?: string;
}

export function ProgressBar({
  current,
  total,
  label = "Processing…",
  color = "bg-violet-600",
}: ProgressBarProps) {
  const percent = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm text-slate-600 dark:text-dark-text-muted">
        <span>{label}</span>
        <span className="tabular-nums">
          {current} / {total}
        </span>
      </div>
      <div className="w-full bg-slate-200 dark:bg-dark-border rounded-full h-2 overflow-hidden">
        <div
          className={`${color} h-2 rounded-full transition-all duration-300`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
