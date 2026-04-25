import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Icon + optional title + body callout with themed color.
 *
 * **Color system across the app:**
 *
 * - `error` (red) → {@link AlertBox} · universal, attention-grabbing.
 * - `warning` (amber) → this component with `accent="warning"` · universal,
 *   amber regardless of tool so the caution signal is preserved.
 * - `info` / `success` → this component with `accent="primary"` (default).
 *
 * The legacy per-category accent values (`organise` / `transform` /
 * `annotate` / `security`) are accepted for backwards compatibility but
 * all resolve to `primary` — per-category coloring was retired in
 * favour of a single, calmer accent.
 *
 * Title is optional — omit it for short single-line success/info messages,
 * include it for richer multi-line callouts that benefit from a headline.
 */

type Accent = "primary" | "organise" | "transform" | "annotate" | "security" | "warning";

interface InfoCalloutProps {
  icon: LucideIcon;
  /** Optional headline. Omit for short one-liner messages. */
  title?: string;
  /** `warning` for universal amber, otherwise primary (default). */
  accent?: Accent;
  children: ReactNode;
}

const PRIMARY_STYLE = {
  container: "bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800/60",
  icon: "text-primary-600 dark:text-primary-400",
  title: "text-primary-800 dark:text-primary-200",
  body: "text-primary-700/90 dark:text-primary-300/90",
};

const accentStyles: Record<
  Accent,
  { container: string; icon: string; title: string; body: string }
> = {
  primary: PRIMARY_STYLE,
  organise: PRIMARY_STYLE,
  transform: PRIMARY_STYLE,
  annotate: PRIMARY_STYLE,
  security: PRIMARY_STYLE,
  warning: {
    container: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/60",
    icon: "text-amber-600 dark:text-amber-400",
    title: "text-amber-800 dark:text-amber-200",
    body: "text-amber-700/90 dark:text-amber-300/90",
  },
};

export function InfoCallout({ icon: Icon, title, accent = "primary", children }: InfoCalloutProps) {
  const s = accentStyles[accent];
  const pulseClass = accent === "warning" ? "warning-pulse" : "";
  return (
    <div
      className={`flex ${title ? "items-start" : "items-center"} gap-3 border rounded-xl p-4 ${s.container} ${pulseClass}`}
    >
      <Icon className={`w-5 h-5 shrink-0 ${title ? "mt-0.5" : ""} ${s.icon}`} aria-hidden="true" />
      <div className="text-sm leading-relaxed">
        {title ? (
          <>
            <p className={`font-semibold mb-0.5 ${s.title}`}>{title}</p>
            <p className={s.body}>{children}</p>
          </>
        ) : (
          <p className={s.title}>{children}</p>
        )}
      </div>
    </div>
  );
}
