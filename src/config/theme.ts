/**
 * Centralized color palette for CloakPDF — "Ocean Blue" theme.
 *
 * The primary scale is derived from #2563EB.
 * Use Tailwind classes (`primary-500`, `primary-600`, …) in markup — they are
 * registered via `@theme` in index.css.  Import from here only when you need
 * raw hex values (e.g. inline SVG fills).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COLOR OVERVIEW
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PRIMARY (blue — #2563EB scale)
 *   primary-50  #EFF4FF   page tints, badge backgrounds
 *   primary-200 #BFDBFE   spinner track, light borders
 *   primary-300 #93C5FD   focus borders (dark mode)
 *   primary-400 #60A5FA   focus rings (/50 opacity), search icon active
 *   primary-500 #3B82F6   interactive accents
 *   primary-600 #2563EB   spinner head, focus borders (light), CTAs
 *   primary-700 #1D4ED8   gradient accent, privacy badge text
 *   primary-800 #1E40AF   —
 *   primary-900 #1E3A8A   —
 *
 * NEUTRALS (slate)
 *   slate-50  #F8FAFC   gradient start (page bg)
 *   slate-100 #F1F5F9   hover backgrounds, icon backgrounds
 *   slate-200 #E2E8F0   borders, dividers
 *   slate-300 #CBD5E1   separator dots, faint text
 *   slate-400 #94A3B8   placeholder text, muted icons
 *   slate-500 #64748B   body / secondary text
 *   slate-600 #475569   medium-emphasis text, icons
 *   slate-800 #1E293B   headings, high-emphasis text
 *
 * BASE
 *   white / white-85 / white-50   surfaces, header, footer
 *
 * CATEGORY ACCENTS (icon bg / icon color)
 *   Organise  — blue-50   / blue-600    (dark: blue-900/30  / blue-400)
 *   Transform — violet-50 / violet-600  (dark: violet-900/30/ violet-400)
 *   Annotate  — emerald-50/ emerald-600 (dark: emerald-900/30/emerald-400)
 *   Security  — amber-50  / amber-600   (dark: amber-900/30 / amber-400)
 *
 * CATEGORY GLOW (spotlight rgba, used in FileDropZone / ToolCard)
 *   Organise  rgba(37,99,235,0.18)    — blue
 *   Transform rgba(124,58,237,0.18)   — violet
 *   Annotate  rgba(16,185,129,0.18)   — emerald
 *   Security  rgba(245,158,11,0.18)   — amber
 *
 * DARK MODE SURFACES (custom Tailwind tokens)
 *   dark-bg            page background
 *   dark-surface       cards, header, footer
 *   dark-surface-alt   hover states
 *   dark-border        borders, dividers
 *   dark-text          primary text
 *   dark-text-muted    secondary / placeholder text
 *
 * SEMANTIC (exported as `colors`)
 *   accent      #1D4ED8   deep blue for gradients
 *   pageBg      #F0F4FA   light page background
 *   surface     #FFFFFF   card surface
 *   accentTint  #EFF4FF   primary-50 alias
 *   headings    #1E293B   slate-800 alias
 *   body        #64748B   slate-500 alias
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
/** Spotlight glow color per tool category, used by FileDropZone and ToolCard. */
export const categoryGlow = {
  organise: "rgba(37,99,235,0.18)",
  transform: "rgba(124,58,237,0.18)",
  annotate: "rgba(16,185,129,0.18)",
  security: "rgba(245,158,11,0.18)",
} as const;

/** Solid accent color per tool category, used for icon tints in FileDropZone. */
export const categoryAccent = {
  organise: "rgb(37,99,235)",
  transform: "rgb(124,58,237)",
  annotate: "rgb(16,185,129)",
  security: "rgb(245,158,11)",
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
