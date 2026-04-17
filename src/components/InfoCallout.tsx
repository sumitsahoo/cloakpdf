import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Informational callout with an icon, title, and body. Always pick the accent
 * matching the host tool's category so the banner harmonises with the page —
 * even for warnings (the title and copy carry the warning semantic; the color
 * carries the visual hierarchy). Use `primary` outside of tool pages (default).
 *
 * For pure pass/fail feedback (error / success), use {@link AlertBox} instead.
 */

type Accent = "primary" | "organise" | "transform" | "annotate" | "security";

interface InfoCalloutProps {
  icon: LucideIcon;
  title: string;
  /** Tool category for color theming. Defaults to `primary` (brand blue). */
  accent?: Accent;
  children: ReactNode;
}

const accentStyles: Record<
  Accent,
  { container: string; icon: string; title: string; body: string }
> = {
  primary: {
    container: "bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800/60",
    icon: "text-primary-600 dark:text-primary-400",
    title: "text-primary-800 dark:text-primary-200",
    body: "text-primary-700/90 dark:text-primary-300/90",
  },
  organise: {
    container: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/60",
    icon: "text-blue-600 dark:text-blue-400",
    title: "text-blue-800 dark:text-blue-200",
    body: "text-blue-700/90 dark:text-blue-300/90",
  },
  transform: {
    container: "bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800/60",
    icon: "text-violet-600 dark:text-violet-400",
    title: "text-violet-800 dark:text-violet-200",
    body: "text-violet-700/90 dark:text-violet-300/90",
  },
  annotate: {
    container: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/60",
    icon: "text-emerald-600 dark:text-emerald-400",
    title: "text-emerald-800 dark:text-emerald-200",
    body: "text-emerald-700/90 dark:text-emerald-300/90",
  },
  security: {
    container: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/60",
    icon: "text-amber-600 dark:text-amber-400",
    title: "text-amber-800 dark:text-amber-200",
    body: "text-amber-700/90 dark:text-amber-300/90",
  },
};

export function InfoCallout({ icon: Icon, title, accent = "primary", children }: InfoCalloutProps) {
  const s = accentStyles[accent];
  return (
    <div className={`flex items-start gap-3 border rounded-xl p-4 ${s.container}`}>
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${s.icon}`} aria-hidden="true" />
      <div className="text-sm">
        <p className={`font-semibold mb-0.5 ${s.title}`}>{title}</p>
        <p className={`leading-relaxed ${s.body}`}>{children}</p>
      </div>
    </div>
  );
}
