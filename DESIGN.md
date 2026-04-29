---
name: CloakPDF — Ocean Blue
description: >-
  A privacy-first PDF toolkit that feels calm, modern, and trustworthy.
  Glassy chrome floats over a slow-drifting aurora; every interactive
  surface uses a single ocean-blue accent so the home screen reads as
  one quiet system rather than a colour-coded grid. Light and dark
  themes share identical structure, swapping only surface tones and
  blend modes.
mode: light-and-dark
colors:
  # ── Primary — "Ocean Blue" scale derived from #2563EB ─────────
  primary-50:  "#eff4ff"   # page tints, badge backgrounds
  primary-100: "#dbeafe"   # icon flap, primary tints
  primary-200: "#bfdbfe"   # spinner track, light borders
  primary-300: "#93c5fd"   # focus borders (light)
  primary-400: "#60a5fa"   # focus rings (dark mode), accent text
  primary-500: "#3b82f6"   # interactive accents, gradient stop
  primary-600: "#2563eb"   # default CTA, focus border, brand
  primary-700: "#1d4ed8"   # CTA hover, gradient deep stop, brand wordmark accent
  primary-800: "#1e40af"
  primary-900: "#1e3a8a"
  primary:        "{colors.primary-600}"
  primary-hover:  "{colors.primary-700}"
  primary-light:  "{colors.primary-50}"
  accent:         "#1d4ed8"

  # ── Neutrals — Slate ──────────────────────────────────────────
  slate-50:  "#f8fafc"     # gradient start (page bg)
  slate-100: "#f1f5f9"     # hover backgrounds, icon tile bg
  slate-200: "#e2e8f0"     # default border, dividers
  slate-300: "#cbd5e1"     # separator dots, faint text
  slate-400: "#94a3b8"     # placeholder, muted icons
  slate-500: "#64748b"     # body / secondary text
  slate-600: "#475569"     # medium-emphasis icons
  slate-700: "#334155"
  slate-800: "#1e293b"     # headings, high-emphasis text
  slate-900: "#0f172a"     # dark-mode page bg

  # ── Light surfaces & text ─────────────────────────────────────
  surface:        "#ffffff"
  surface-glass:  "rgba(255,255,255,0.80)"   # header / sticky chrome
  surface-card:   "rgba(255,255,255,0.65)"   # bento footer cards
  surface-alt:    "#f0f4fa"
  page-bg:        "#f0f4fa"
  border:         "#e2e8f0"
  border-soft:    "rgba(226,232,240,0.70)"
  text:           "#1e293b"
  text-muted:     "#64748b"

  # ── Dark surfaces & text ──────────────────────────────────────
  dark-bg:           "#060912"   # body solid (deep navy-black)
  dark-page-bg:      "#0f172a"   # page gradient endpoint
  dark-surface:      "#1e293b"   # cards, header, footer
  dark-surface-alt:  "#334155"   # hover, icon tile bg
  dark-border:       "#334155"
  dark-border-soft:  "rgba(255,255,255,0.10)"
  dark-text:         "#f1f5f9"
  dark-text-muted:   "#94a3b8"

  # ── Status ────────────────────────────────────────────────────
  danger:        "#ef4444"
  danger-bg:     "#fef2f2"      # red-50
  danger-border: "#fecaca"      # red-200
  danger-text:   "#b91c1c"      # red-700
  warning:       "#f59e0b"      # amber-500
  warning-bg:    "#fffbeb"      # amber-50
  warning-border:"#fde68a"      # amber-200
  warning-text:  "#92400e"      # amber-800
  success:       "#22c55e"

  # ── Aurora — six-blob ambient palette (drifting backdrop) ─────
  aurora-blue:    "#2563eb"
  aurora-violet:  "#7c3aed"
  aurora-pink:    "#db2777"
  aurora-orange:  "#ea580c"
  aurora-cyan:    "#0891b2"
  aurora-emerald: "#059669"

  # ── "Why CloakPDF" feature accents (one chip per feature) ─────
  feature-emerald: "#059669"    # No sign-up
  feature-violet:  "#7c3aed"    # No tracking
  feature-teal:    "#0d9488"    # Local-first
  feature-cyan:    "#0891b2"    # Works offline
  feature-orange:  "#ea580c"    # Installable
  feature-yellow:  "#ca8a04"    # All-screens
  feature-pink:    "#db2777"    # 35+ tools
  feature-indigo:  "#4f46e5"    # Light & dark
  feature-slate:   "#475569"    # Open source

  # ── Spotlight glow used by ToolCard / WorkflowHero / DropZone ─
  glow-primary:    "rgba(37,99,235,0.16)"
  glow-strong:     "rgba(37,99,235,0.18)"
  focus-ring:      "rgba(37,99,235,0.18)"

  # ── Canvas / drawing primitives ───────────────────────────────
  canvas-bg:       "#ffffff"
  canvas-border:   "#e2e8f0"
  canvas-label:    "#64748b"
  canvas-redact:   "rgba(0,0,0,0.85)"
  canvas-redact-stroke: "#ff4444"
  canvas-diff:     "rgba(239,68,68,0.71)"

  # ── Brand colour-picker presets (signature / watermark) ───────
  preset-black: "#1e293b"
  preset-grey:  "#64748b"
  preset-blue:  "#1d4ed8"
  preset-red:   "#dc2626"

gradients:
  page-light: >-
    radial-gradient(ellipse at 20% 0%, rgba(37,99,235,0.08), transparent 55%),
    radial-gradient(ellipse at 80% 100%, rgba(37,99,235,0.05), transparent 55%),
    linear-gradient(180deg, #fafbfc 0%, #f1f5f9 100%)
  page-dark: >-
    radial-gradient(ellipse at 20% 0%, rgba(59,130,246,0.18), transparent 55%),
    radial-gradient(ellipse at 80% 100%, rgba(37,99,235,0.10), transparent 55%),
    linear-gradient(180deg, #0f172a 0%, #060912 100%)
  brand-shield: "linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)"
  spotlight: >-
    radial-gradient(320px circle at <x>px <y>px,
    rgba(37,99,235,0.16), transparent 70%)

typography:
  fonts:
    sans: >-
      "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI",
      Roboto, sans-serif
    serif: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif
    mono: >-
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      "Liberation Mono", monospace
  smoothing:
    webkit: antialiased
    moz: grayscale
  hero:
    fontFamily: "Inter"
    fontSize: "clamp(34px, 5vw, 58px)"
    fontWeight: "600"
    lineHeight: "1.05"
    letterSpacing: "-0.03em"
    notes: >-
      Italic phrase ("stay on your device") swaps to system serif,
      400 weight, primary-600/400, to feel editorial against the
      geometric sans.
  display:
    fontFamily: "Inter"
    fontSize: "clamp(24px, 3.4vw, 36px)"
    fontWeight: "600"
    lineHeight: "1.15"
    letterSpacing: "-0.02em"
  headline-lg:
    fontFamily: "Inter"
    fontSize: "26px"
    fontWeight: "600"
    lineHeight: "1.2"
    letterSpacing: "-0.02em"
  headline-md:
    fontFamily: "Inter"
    fontSize: "22px"
    fontWeight: "600"
    lineHeight: "1.2"
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter"
    fontSize: "17px"
    fontWeight: "600"
    lineHeight: "1.3"
    letterSpacing: "-0.02em"
  card-title:
    fontFamily: "Inter"
    fontSize: "15px"
    fontWeight: "600"
    lineHeight: "1.35"
    letterSpacing: "-0.005em"
  body-lg:
    fontFamily: "Inter"
    fontSize: "17px"
    fontWeight: "400"
    lineHeight: "1.55"
  body:
    fontFamily: "Inter"
    fontSize: "15px"
    fontWeight: "400"
    lineHeight: "1.55"
  body-sm:
    fontFamily: "Inter"
    fontSize: "13px"
    fontWeight: "400"
    lineHeight: "1.55"
  caption:
    fontFamily: "Inter"
    fontSize: "12.5px"
    fontWeight: "500"
    lineHeight: "1.5"
  eyebrow:
    fontFamily: "Inter"
    fontSize: "11px"
    fontWeight: "600"
    lineHeight: "1.0"
    letterSpacing: "0.12em"
    textTransform: "uppercase"
  micro-label:
    fontFamily: "Inter"
    fontSize: "10px"
    fontWeight: "600"
    lineHeight: "1.0"
    letterSpacing: "0.16em"
    textTransform: "uppercase"
  kbd:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo"
    fontSize: "11px"
    fontWeight: "500"
    fontFeatureSettings: '"tnum"'
  version-tag:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo"
    fontSize: "10px"
    fontFeatureSettings: '"tnum"'

spacing:
  base: 4px
  px:   1px
  0_5:  2px
  1:    4px
  1_5:  6px
  2:    8px
  2_5:  10px
  3:    12px
  3_5:  14px
  4:    16px
  5:    20px
  6:    24px
  7:    28px
  8:    32px
  10:   40px
  12:   48px
  14:   56px
  16:   64px
  container: 1152px        # max-w-6xl, the main content frame
  gutter: 16px             # standard grid gap between cards
  gutter-lg: 24px          # gap between hero columns
  section-y: 48px          # space-y-12 between tool categories
  page-x: 16px             # phone padding (px-4)
  page-x-lg: 24px          # tablet+ padding (sm:px-6)

radii:
  none: "0"
  sm:   "0.5rem"   # 8px  — small badges, hover chips
  md:   "0.75rem"  # 12px — kbd outlines, ghost buttons
  lg:   "0.75rem"  # 12px — icon-tile interior
  xl:   "1rem"     # 16px — large icon tiles, action buttons
  "2xl": "1rem"    # 16px — tool cards, search bar, modals
  pill: "9999px"   # eyebrow chips, kbd background, step circles

elevation:
  flat: "none"
  card-rest:    "0 0 0 1px rgba(15,23,42,0.06)"
  card-hover:   "0 4px 12px -2px rgba(15,23,42,0.08), 0 2px 4px -2px rgba(15,23,42,0.04)"
  search-focus: "0 4px 12px -2px rgba(37,99,235,0.10), 0 0 0 1px rgba(37,99,235,0.15)"
  modal:        "0 25px 50px -12px rgba(15,23,42,0.25)"
  cta-primary:  "0 1px 2px rgba(37,99,235,0.30)"
  cta-danger:   "0 1px 2px rgba(239,68,68,0.30)"

backdrop-blur:
  header: "24px"   # backdrop-blur-xl on sticky header
  modal:  "14px"   # confirm-dialog scrim
  card:   "12px"   # bento footer translucent cards
  search: "4px"    # subtle blur behind the search shell

motion:
  duration:
    instant: "120ms"   # fade-in, hover colour shifts
    fast:    "150ms"   # popover-in, hover transitions
    base:    "200ms"   # button + card transitions
    slow:    "350ms"   # scale-in / slide-up-in
    slower:  "450ms"   # fade-in-up hero entry
  easing:
    standard:  "ease-out"
    smooth:    "cubic-bezier(0.22, 1, 0.36, 1)"   # slide-up-in
    overshoot: "cubic-bezier(0.34, 1.56, 0.64, 1)" # scale-in modal
  keyframes:
    fade-in:        "opacity 0 → 1, 120ms ease-out"
    fade-in-up:     "opacity 0 → 1 + translateY(12px → 0), 450ms ease-out"
    scale-in:       "opacity 0 → 1 + scale(0.82 → 1), 350ms overshoot"
    popover-in:     "opacity 0 → 1 + translateY(-6px → 0) + scale(0.97 → 1), 150ms ease-out"
    slide-up-in:    "opacity 0 → 1 + translateY(24px → 0), 350ms smooth"
    focus-ring-pulse: "ring 0 → 10px rgba(37,99,235,0.35 → 0)"
    error-pulse:    "ring 0 → 8px rgba(239,68,68,0.45 → 0), 2.5s infinite"
    warning-pulse:  "ring 0 → 8px rgba(245,158,11,0.45 → 0), 2.5s infinite"
    aurora-morph:   "border-radius blob mutation, 17–22s ease-in-out infinite"
    aurora-flow:    "translate(±60vw, ±70vh) + rotate(±290°) + scale(0.8–1.3), 44–62s linear infinite"
    aurora-breathe: "opacity ×0.7 → ×1.3, 10–15s ease-in-out infinite"
  reduced-motion: >-
    Aurora animations halt; popover/fade/slide/error/warning pulses
    drop to instant. Layout transitions still resolve in ≤200ms.
  hover-lift:    "translateY(-2px) on cards / CTAs"
  hover-shift-x: "translateX(2px) on card titles + chevrons"

effects:
  aurora:
    blob-count: 6
    blob-blur:
      desktop: "60px"
      mobile:  "36px"
    blob-opacity-base: "0.08"
    blob-opacity-range: "0.056 – 0.104"
    blend-mode-light: "multiply"
    blend-mode-dark:  "screen"
    grain-opacity-light: "0.045"
    grain-opacity-dark:  "0.08"
    grain-blend-light: "multiply"
    grain-blend-dark:  "overlay"
    mobile-mask: >-
      vertical alpha mask fades blobs to transparent across the
      bottom 200px so iOS Safari samples the slate page-bg
      (not the blob hue) for its URL-bar tint.
  spotlight:
    radius: "320px"     # ToolCard
    radius-hero: "420px" # WorkflowHero
    radius-drop: "300px" # FileDropZone
    color: "{colors.glow-primary}"
    falloff: "transparent at 70%"
    triggers: ["mousemove", "touchstart", "touchmove"]
  glass:
    header-bg: "rgba(255,255,255,0.80)"
    header-bg-dark: "rgba(30,41,59,0.80)"
    modal-scrim-light: "rgba(15,23,42,0.30)"
    modal-scrim-dark:  "rgba(0,0,0,0.50)"
    bento-card-bg: "rgba(255,255,255,0.65)"
    bento-card-bg-dark: "rgba(30,41,59,0.60)"
  scrollbar-thin:
    width: "8px"
    radius: "9999px"
    thumb-light: "rgba(100,116,139,0.30)"
    thumb-dark:  "rgba(148,163,184,0.30)"
    track: "transparent"

iconography:
  library: "lucide-react"
  default-stroke: "2"
  search-stroke:  "2.25"
  size-sm: "16px"   # inline glyphs
  size-md: "20px"   # card icons, button icons
  size-lg: "24px"   # tool-page header icons
  tile-size: "44px" # 11×11 in 4px grid; rounded-xl, slate-100 bg
  tile-hover: "primary-50 bg / primary-600 fg + scale(1.05) + -1px lift"
  brand-mark: "shield + folded-corner document with redaction lines"

components:
  button-primary:
    backgroundColor: "{colors.primary-600}"
    backgroundColorHover: "{colors.primary-700}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    fontWeight: "500"
    rounded: "{radii.xl}"
    padding: "12px 32px"
    minWidth: "220px"
    trailingIcon: "ArrowRight (continue) | Download (terminal) | none"
    disabled: "opacity 0.5, cursor not-allowed"
  button-danger:
    backgroundColor: "{colors.danger}"
    backgroundColorHover: "#b91c1c"
    textColor: "#ffffff"
    rounded: "{radii.lg}"
    shadow: "{elevation.cta-danger}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.slate-600}"
    hoverBg: "rgba(15,23,42,0.04)"
    rounded: "{radii.xl}"
    padding: "8px"
  reset-button:
    backgroundColor: "transparent"
    border: "1px solid {colors.slate-200}"
    textColor: "{colors.slate-500}"
    rounded: "{radii.lg}"
  search-bar:
    backgroundColor: "{colors.surface-glass}"
    backdropBlur: "{backdrop-blur.search}"
    border: "1px solid {colors.slate-200}"
    borderFocus: "1px solid {colors.primary-300}"
    rounded: "{radii.2xl}"
    height: "56px"
    leadingIcon: "Search · slate-700 · 20px"
    trailingShortcut: "kbd ⌘K / CtrlK · slate-500 · 11px tabular"
    glow: "soft primary-500/20 outer halo on focus"
  tool-card:
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.slate-200}"
    borderHover: "1px solid {colors.primary-300}"
    rounded: "{radii.2xl}"
    padding: "24px 20px"
    iconTile:
      size: "44px"
      bg: "{colors.slate-100}"
      bgHover: "{colors.primary-50}"
      fg: "{colors.slate-700}"
      fgHover: "{colors.primary-600}"
      rounded: "{radii.lg}"
    title: "{typography.card-title}"
    body:  "{typography.body-sm}"
    hover: "translateY(-2px) + shadow-md + spotlight glow + chevron slide-in"
  workflow-hero-card:
    extends: "tool-card"
    layout: "horizontal"
    eyebrow: "WORKFLOWS"
    badge: "NEW (primary-50 pill, primary-600 text)"
    glow-radius: "420px"
  feature-item:
    layout: "icon + title + description, gap-3.5"
    iconTile: "40px rounded-lg, color-mix(<feature> 14%, transparent)"
    title: "14.5px / 600 / slate-800"
    body:  "13.5px / 400 / slate-500"
  file-drop-zone:
    backgroundColor: "{colors.surface}"
    border: "2px dashed {colors.slate-200}"
    borderActive: "2px dashed {colors.primary-400}"
    rounded: "{radii.2xl}"
    icon: "FileUp · primary-tinted"
    spotlightRadius: "300px"
  alert-error:
    backgroundColor: "{colors.danger-bg}"
    border: "1px solid {colors.danger-border}"
    textColor: "{colors.danger-text}"
    rounded: "{radii.xl}"
    padding: "16px"
    animation: "error-pulse 2.5s infinite"
  callout-info:
    backgroundColor: "{colors.primary-50}"
    border: "1px solid {colors.primary-200}"
    titleColor: "#1e3a8a"
    bodyColor:  "#1d4ed8"
    iconColor:  "{colors.primary-600}"
    rounded: "{radii.xl}"
  callout-warning:
    backgroundColor: "{colors.warning-bg}"
    border: "1px solid {colors.warning-border}"
    iconColor: "#d97706"
    rounded: "{radii.xl}"
    animation: "warning-pulse 2.5s infinite"
  modal:
    surface: "rgba(255,255,255,0.85)"
    backdropBlur: "{backdrop-blur.modal}"
    scrim: "{effects.glass.modal-scrim-light}"
    border: "1px solid rgba(226,232,240,0.80)"
    rounded: "{radii.2xl}"
    shadow: "{elevation.modal}"
    animation: "scale-in 350ms overshoot"
  header:
    height: "auto, py-2.5"
    surface: "{colors.surface-glass}"
    backdropBlur: "{backdrop-blur.header}"
    borderBottom: "1px solid rgba(226,232,240,0.70)"
    sticky: true
    z-index: 50
    contents: "logo + wordmark · privacy chip · GitHub link · optional back arrow"
  footer-bento:
    layout: "12-col grid; 7 / 5 split (How-it-works · Cloakyard)"
    cardSurface: "{effects.glass.bento-card-bg}"
    backdropBlur: "{backdrop-blur.card}"
    accentBlob: "primary-500/15 blurred radial in card corner"
    rounded: "{radii.2xl}"
    homeOnly: true
  step-circle:
    size: "28px"
    bg: "{colors.primary-50}"
    border: "1px solid #dbeafe"
    fg: "{colors.primary-600}"
    rounded: "{radii.pill}"
    typography: "12px / 600 / tabular"
  badge-new:
    backgroundColor: "{colors.primary-50}"
    border: "1px solid {colors.primary-200}"
    textColor: "{colors.primary-600}"
    rounded: "{radii.pill}"
    padding: "2px 8px"
    typography: "{typography.micro-label}"
  kbd:
    backgroundColor: "{colors.slate-50}"
    border: "1px solid {colors.slate-200}"
    textColor: "{colors.slate-500}"
    rounded: "{radii.md}"
    typography: "{typography.kbd}"
    padding: "4px 8px"
  loading-spinner:
    track: "{colors.primary-200}"
    head:  "{colors.primary-600}"
    size:  "32px"
    width: "3px"

breakpoints:
  sm: "640px"
  md: "768px"
  lg: "1024px"
  xl: "1280px"
  "2xl": "1536px"
  container-max: "1152px"

grid:
  hero: "12-col, 7 / 5 split (lg+); single column below"
  tools: "1 / 2 / 3 columns at sm / md / lg breakpoints"
  features: "1 / 2 / 3 columns at sm / md / lg breakpoints"
  bento-footer: "12-col, 7 / 5 split (sm+); stacks below"

a11y:
  focus-ring: "2px primary-600 outline + rgba(37,99,235,0.18) glow"
  reduced-motion: "honoured for fade/slide/scale/aurora/error+warning pulses"
  contrast: >-
    Slate-500 on white passes AA for body sizes; slate-800 on white
    and primary-600 on primary-50 both pass AA for headings.
  keyboard: "⌘K / CtrlK focuses search; Esc clears; Enter confirms modal"
  scheme: "@media (prefers-color-scheme) drives the dark variant"
---

```

# CloakPDF — Ocean Blue

CloakPDF is a privacy-first toolbox for editing, merging, signing,
redacting, and converting PDFs entirely in the browser. The design
system has to communicate two things at the same time: **calm
confidence** ("nothing leaves your device") and **technical
breadth** (35+ tools without feeling like a control panel). Ocean
Blue is the load-bearing visual idea — a single accent doing the
work that lesser systems split across category colours.

## Brand & Voice

The product personality is **quiet, modern, and deliberate**. The
hero pairs a tight geometric sans with one editorial italic clause
("*stay on your device*") to make the privacy promise feel
hand-set rather than templated. The wordmark renders the "PDF"
suffix in primary-600 against a slate-900 "Cloak" — same family,
different ink — so the brand reads as a single word with a coloured
emphasis rather than a logo+tag.

The shield-and-document logo carries a vertical primary-500 →
primary-700 gradient. Three short redacted bars sit on the page
inside the shield: that's the whole privacy thesis in one mark.

## Look & Feel

The page never sits on a flat colour. A six-blob **aurora** drifts
beneath all chrome — blue, violet, pink, orange, cyan, emerald —
each blob blurred to 60px on desktop, 36px on mobile, breathing
between 5.6 % and 10.4 % opacity. Light mode mixes the aurora into
the background with `multiply`; dark mode flips to `screen` so the
blobs glow rather than tint. A static SVG fractal-noise grain sits
over the blobs at 4–8 % opacity — kills the "CSS gradient" tell and
gives surfaces a faint paper texture.

The aurora is the only place the system uses the full six-colour
palette. Everything *interactive* — buttons, focus rings, hover
borders, spotlight glows, the workflow badge — collapses to a single
ocean-blue accent. The contrast between the multi-coloured ambient
backdrop and the monochromatic UI is the design's signature move:
the colour energy lives behind the glass, not on the controls.

A vertical alpha mask fades the aurora to transparent across the
bottom 200 px on mobile so iOS Safari samples the slate page-bg
(not a blob hue) for its URL-bar tint. This is the kind of
invisible discipline the product runs on.

## Colour

The primary scale is anchored at **#2563EB** (primary-600) and
spans ten steps from the near-white #EFF4FF (primary-50) to a deep
#1E3A8A (primary-900). The neutral spine is **slate** — slate-500
for body copy, slate-800 for headings, slate-200 for borders,
slate-100 for icon tiles. Body text never uses pure black; the
deepest readable colour is slate-800.

- **Primary 600** — default CTAs, focus borders, brand emphasis,
  numbered step circles, "Why CloakPDF" eyebrows.
- **Primary 50 / 100** — soft tints behind icon tiles on hover, the
  "NEW" badge, info callouts, kbd backgrounds.
- **Slate 100 / 200** — resting icon tile bg and card border. These
  appear on every card and are the structural mortar of the system.
- **Status colours** — red-50/red-700 for `AlertBox` (the only
  red surface), amber-50/amber-700 for `InfoCallout` warnings.
  Info / success collapse to primary tints — there is no green
  surface anywhere in the UI except the literal Lucide check
  glyph.

The "**Why CloakPDF**" feature grid is the one place per-feature
colour is allowed: nine 40 px icon chips each at
`color-mix(<hue> 14%, transparent)` — emerald, violet, teal, cyan,
orange, yellow, pink, indigo, slate. They appear *once*, low on
the home page, after the entire monochromatic tool grid has
already established the calm tone.

Dark mode keeps the same structural decisions and swaps surfaces
for slate-900 family + dark-text. Borders shift from solid slate to
10 % white. Primary tints become `primary-900/30` washes; primary
text becomes primary-400 to maintain AA contrast.

## Typography

The system runs on **Inter Variable** (self-hosted, weights 100-900)
with the platform sans stack as fallback. One serif accent is
permitted — a single italic phrase in the hero — and uses the
default `font-serif` system stack so it inherits the user's
operating-system serif rather than shipping another font.

Hierarchy:

- **Hero (34–58 px / 600 / -0.03em / 1.05)** — the only place
  size goes above 30 px. Animated in via `fade-in-up` 80 ms
  staggered after the page paints.
- **Section headline (22–26 px / 600 / -0.02em / 1.2)** — used
  once per category; always paired with an 11 px uppercase eyebrow
  in primary-600 above it.
- **Card title (15 px / 600 / -0.005em)** and **body (13–15.5 px
  / 400 / 1.55)** — the working pair across every tool card,
  feature row, modal, and footer block.
- **Eyebrows (11 px / 600 / 0.12em / uppercase)** and **micro-labels
  (10 px / 600 / 0.16em / uppercase)** — used for "WORKFLOWS",
  "Part of", "How it works", and the version chip.
- **Tabular numerals** (`font-feature-settings: "tnum"`) on every
  kbd, version tag, step circle, and tool count so digits never
  jiggle as content updates.

Antialiasing is on (`-webkit-font-smoothing: antialiased`) so the
geometric sans stays crisp against the blurred aurora.

## Spacing & Rhythm

The grid is a **4 px base** with a strong cadence on multiples
of 4: `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`. The container caps at
`max-w-6xl` (1152 px) and uses `px-4` on phone, `sm:px-6` on
tablet+. Vertical section rhythm is `space-y-12` to `space-y-14`
between tool categories — generous, never crowded.

Inside cards, the icon tile is followed by a `mb-2` flush, then
the title, then the body, with no hairline divider; the system
relies on whitespace and the soft slate-200 outer border to
contain the block. Hero columns use a 7 / 5 lg-grid split so the
headline gets visual primacy and the workflow promo card balances
the right edge.

## Shape Language

Three radii do almost all the work:

- **`rounded-2xl` (16 px)** on tool cards, the workflow hero card,
  the search bar, the file drop zone, modal surfaces, and primary
  CTAs. This is the "page" radius — it carries the soft, modern
  silhouette.
- **`rounded-xl` (12 px)** on icon tiles and ghost buttons.
- **`rounded-full`** on eyebrow chips, the "NEW" pill, the step
  circles in the footer, and the kbd background.

Cards never have inner dividers; sections never have hairline
rules. Borders are always 1 px slate-200 and become primary-300 on
hover — the colour shift is the affordance.

## Elevation & Depth

The system layers in three planes:

1. **Aurora + grain** — z-index 0/1, fixed, drifts under
   everything else.
2. **Page chrome** — sticky header at z-50, footer, and
   the centred main column. Header uses
   `bg-white/80 backdrop-blur-xl` so the aurora reads through it
   as a frosted band.
3. **Surfaces & overlays** — cards (white, 1 px slate border, no
   shadow at rest), modals (white/85 + 14 px backdrop-blur, scaled
   in via the overshoot easing).

Resting cards have **no shadow** — only a 1 px border. On hover
they lift 2 px (`-translate-y-0.5`), gain a `shadow-md`, swap the
border to primary-300, and reveal a 320 px cursor-tracking
spotlight glow at `rgba(37,99,235,0.16)`. On touch, the same glow
is anchored to the touch point. The chevron in the bottom-right
slides in with `translate-x-1` opacity from 0 → 1. These four
movements run on a single 200 ms ease so the card "wakes up" as a
unit.

## Motion

Motion is **calm, layered, and short** by default. The home page
has a fade-in-up choreography on first paint: hero h1 at 0 ms,
subhead at 80 ms, workflow card at 120 ms, search at 160 ms, then
each tool category at `index × 80 ms`. The cumulative effect is a
gentle cascade rather than a slam-dunk reveal.

Two **looping pulses** carry status:

- `error-pulse` — 2.5 s loop, red ring expanding from 0 → 8 px,
  used on the only true error surface (`AlertBox`).
- `warning-pulse` — same shape, amber, used on warning callouts.

Both honour `prefers-reduced-motion` and pause completely; aurora,
fade-in-up, scale-in, and popover-in animations also collapse to
instant under the same media query.

A scale-in modal entry uses the slight overshoot easing
`cubic-bezier(0.34, 1.56, 0.64, 1)` so confirmations feel
responsive without becoming bouncy. Slide-up overlays use the
smoother `cubic-bezier(0.22, 1, 0.36, 1)`.

## Iconography

All glyphs come from **Lucide** at default 2-weight stroke, except
the home-page search icon which uses 2.25 to read confidently
inside the chunky search bar. Standard sizes are 16 / 20 / 24 px,
each riding inside a slate-100 rounded-xl tile (40–48 px) which
swaps to a primary-50 / primary-600 wash on hover with a 1 px lift
and a 1.05× scale.

## Components

**Tool card** — the system's hero component. White surface, 1 px
slate-200 border, 16 px radius, 24 px / 20 px padding. Holds an
icon tile, a title, a one-line description, and a hidden chevron
that surfaces on hover. The cursor-tracking spotlight reads the
mouse position via `getBoundingClientRect` and paints a 320 px
radial gradient that follows; the same handler accepts touch
events so the effect works on phones and tablets.

**Workflow hero card** — same body as the tool card but laid out
horizontally, prefixed by an uppercase "WORKFLOWS" eyebrow and a
"NEW" pill in primary tints. The spotlight goes a touch larger
(420 px) to suit the wider footprint.

**Search bar** — 56 px tall, 16 px radius, white-90 surface with a
subtle backdrop blur. A leading slate-700 magnifier and a trailing
`kbd` showing ⌘K (Mac) or CtrlK (everywhere else). On focus, the
border deepens to primary-300, a soft `shadow-md` settles in, and
a wider primary-500/20 halo blooms behind the entire field.

**Header** — sticky, full-width, white-80 with `backdrop-blur-xl`
and a 70 %-opacity slate-200 hairline at the bottom. Holds: logo
mark + wordmark, a privacy chip ("100% Private · Open Source" on
desktop, collapses to "Private" on phones), and a 36 px GitHub
icon button. A back chevron appears at the start when the user is
inside a tool.

**Bento footer** — only renders on the home screen. A 7/5 grid
where the larger card teaches the three-step flow with primary-50
step circles, and the smaller card promotes the parent
**Cloakyard** family with a soft primary-500/10 corner blob and a
version chip in monospace. Tool pages collapse the bento to a slim
attribution row.

**Modal / ConfirmDialog** — portalled to `document.body`, a
slate-900/30 + 14 px-blur scrim, a white-85 surface with `scale-in`
overshoot on entry. Footer row sits in a slate-50/55 wash with a
hairline top border. The danger tone swaps the icon chip and CTA
to red while keeping the same shape.

**Action button** — primary-600 fill, primary-700 hover, 32 px
horizontal padding, 12 px vertical, 16 px radius, full-width on
phones and minimum 220 px on tablet+. Trailing icon adapts to
context: an arrow when continuing through a workflow step, a
download glyph on the terminal step or any single-tool button
labelled with "Download". Disabled drops opacity to 50 % and
cuts pointer events.

## Closing Notes

The single hardest decision in this system is *not* using
per-category colour. Every design that splits 35 tools by domain
ends up looking like a control panel; the unified ocean-blue
accent reads as one calm app instead. The aurora absorbs the
chromatic energy; the chrome stays monochromatic; the user's eye
follows hierarchy and motion, not hue.

Two invariants to preserve in any future revision:

1. **One accent.** Per-tool / per-category colour stays out of
   interactive surfaces. The only exception is the nine
   illustrative chips in the "Why CloakPDF" grid, which appear
   once and below the fold.
2. **Slate-200 borders, no resting shadow.** Cards earn elevation
   on hover, never at rest. Adding a default shadow would push
   the system from *quiet* to *busy* and break the bento footer's
   layered glass.
```
