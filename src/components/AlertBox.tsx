/**
 * Colour-coded alert banner for inline feedback messages.
 *
 * Variants: `error` (red), `success` (emerald), `warning` (amber), `info` (blue).
 *
 * `error` and `warning` gain a continuous soft-ring attention pulse (see
 * `.error-pulse` / `.warning-pulse` in index.css) so users don't miss them.
 * The pulse respects `prefers-reduced-motion`.
 */

interface AlertBoxProps {
  /** Text displayed inside the alert. */
  message: string;
  /** Visual style — determines background, border, and text colour. */
  variant: "error" | "success" | "warning" | "info";
}

const styles = {
  error:
    "bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-300",
  success:
    "bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 text-sm text-emerald-700 dark:text-emerald-300",
  warning:
    "bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-300",
  info: "bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm text-blue-700 dark:text-blue-300",
};

const pulse: Record<AlertBoxProps["variant"], string> = {
  error: "error-pulse",
  warning: "warning-pulse",
  success: "",
  info: "",
};

export function AlertBox({ message, variant }: AlertBoxProps) {
  return (
    <div className={`${styles[variant]} ${pulse[variant]}`}>
      <p>{message}</p>
    </div>
  );
}
