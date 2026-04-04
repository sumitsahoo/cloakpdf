/**
 * Centralized color palette for BytePDF — "Ocean Blue" theme.
 *
 * The primary scale is derived from #2563EB.
 * Use Tailwind classes (`primary-500`, `primary-600`, …) in markup — they are
 * registered via `@theme` in index.css.  Import from here only when you need
 * raw hex values (e.g. inline SVG fills).
 */
/** Spotlight glow color per tool category, used by FileDropZone and ToolCard. */
export const categoryGlow = {
  organise: "rgba(37,99,235,0.18)",
  transform: "rgba(124,58,237,0.18)",
  annotate: "rgba(16,185,129,0.18)",
  security: "rgba(245,158,11,0.18)",
} as const;

export const colors = {
  primary: {
    50: "#EFF4FF",
    100: "#DBEAFE",
    200: "#BFDBFE",
    300: "#93C5FD",
    400: "#60A5FA",
    500: "#3B82F6",
    600: "#2563EB",
    700: "#1D4ED8",
    800: "#1E40AF",
    900: "#1E3A8A",
  },
  /** Deeper blue for gradients */
  accent: "#1D4ED8",
  /** Semantic / surface colors */
  pageBg: "#F0F4FA",
  surface: "#FFFFFF",
  accentTint: "#EFF4FF",
  headings: "#1E293B",
  body: "#64748B",
} as const;
