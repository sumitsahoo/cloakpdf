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
/**
 * Unified primary glow color used for the cursor/touch spotlight on
 * FileDropZone and ToolCard. Per-category coloring was retired in
 * favour of a single, calmer accent — the keys remain so call-sites
 * keep working without edits, but every key resolves to the same value.
 */
export const categoryGlow = {
  organise: "rgba(37,99,235,0.18)",
  transform: "rgba(37,99,235,0.18)",
  annotate: "rgba(37,99,235,0.18)",
  security: "rgba(37,99,235,0.18)",
} as const;

/** Unified primary accent color (matches `categoryGlow` semantics). */
export const categoryAccent = {
  organise: "rgb(37,99,235)",
  transform: "rgb(37,99,235)",
  annotate: "rgb(37,99,235)",
  security: "rgb(37,99,235)",
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
  slate: {
    200: "#E2E8F0",
    500: "#64748B",
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

/** Focus-ring shadow used on interactive canvas/input elements. */
export const focusRing = "rgba(37,99,235,0.18)" as const;

/** Preset colours shared by Signature & Watermark colour pickers. */
export const colorPresets = [
  { label: "Black", hex: "#1E293B" },
  { label: "Grey", hex: "#64748B" },
  { label: "Blue", hex: "#1D4ED8" },
  { label: "Red", hex: "#DC2626" },
] as const;

/** Canvas rendering colours for tools that draw on an HTML5 canvas. */
export const canvas = {
  /** Background fill for generated sheets/images */
  background: "#FFFFFF",
  /** Light border around thumbnails / cells */
  border: "#E2E8F0",
  /** Label text colour */
  label: "#64748B",
  /** Redaction box fill */
  redactFill: "rgba(0,0,0,0.85)",
  /** Redaction box stroke (red — intentionally distinct from theme) */
  redactStroke: "#FF4444",
  /** Pixel-diff highlight for ComparePdf (RGBA channels 0–255) */
  diffHighlight: { r: 239, g: 68, b: 68, a: 180 },
} as const;
