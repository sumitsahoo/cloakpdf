---
name: CloakPDF — Ocean Blue
description: A calm, privacy-first PDF toolkit. Slate neutrals, a single Ocean-Blue accent, glass surfaces, and a slow drifting aurora backdrop conveying focus, trust, and craft.

tokens:
  color:
    # ── Primary scale — Ocean Blue (derived from #2563EB) ─────────
    primary:
      "50":  "#EFF4FF"   # tints, badge backgrounds
      "100": "#DBEAFE"   # pill backgrounds, slider track tint
      "200": "#BFDBFE"   # spinner track, soft borders
      "300": "#93C5FD"   # hover borders, focus borders (dark)
      "400": "#60A5FA"   # focus ring, drag-over accent
      "500": "#3B82F6"   # interactive accents
      "600": "#2563EB"   # CTA fill, links, primary text accent
      "700": "#1D4ED8"   # CTA hover, deep gradient accent
      "800": "#1E40AF"   # deep accent text on tints
      "900": "#1E3A8A"   # darkest blue (rarely used)

    # ── Slate neutrals (text, borders, muted surfaces) ────────────
    slate:
      "50":  "#F8FAFC"
      "100": "#F1F5F9"
      "200": "#E2E8F0"
      "300": "#CBD5E1"
      "400": "#94A3B8"
      "500": "#64748B"
      "600": "#475569"
      "700": "#334155"
      "800": "#1E293B"
      "900": "#0F172A"

    # ── Semantic — light theme ────────────────────────────────────
    semantic.light:
      page-bg-base:   "#F1F5F9"        # safe-area paint that iOS Safari samples
      page-bg-top:    "#FAFBFC"        # gradient start
      page-bg-bottom: "#F1F5F9"        # gradient stop
      surface:            "#FFFFFF"
      surface-glass:      "rgba(255,255,255,0.85)"   # header, modal, footer
      surface-glass-soft: "rgba(255,255,255,0.70)"   # empty-state cards
      surface-alt:        "#F0F4FA"
      border:             "#E2E8F0"
      border-soft:        "rgba(226,232,240,0.80)"
      divider:            "rgba(226,232,240,0.60)"
      text:               "#1E293B"
      text-muted:         "#64748B"
      text-subtle:        "#94A3B8"
      accent:             "#2563EB"
      accent-hover:       "#1D4ED8"
      accent-tint:        "#EFF4FF"

    # ── Semantic — dark theme (prefers-color-scheme: dark) ────────
    semantic.dark:
      page-bg-base:   "#060912"
      page-bg-top:    "#0F172A"
      page-bg-bottom: "#060912"
      surface:            "#1E293B"
      surface-glass:      "rgba(30,41,59,0.85)"
      surface-glass-soft: "rgba(30,41,59,0.70)"
      surface-alt:        "#334155"
      border:             "#334155"
      border-soft:        "rgba(51,65,85,0.80)"
      divider:            "rgba(51,65,85,0.60)"
      text:               "#F1F5F9"
      text-muted:         "#94A3B8"
      text-subtle:        "#64748B"
      accent:             "#3B82F6"
      accent-hover:       "#60A5FA"
      accent-tint:        "rgba(30,58,138,0.30)"   # primary-900 / 30

    # ── Status (universal, theme-resilient) ───────────────────────
    status:
      danger:          "#EF4444"
      danger-fill:     "#FEE2E2"   # red-100/50-ish
      danger-text:     "#B91C1C"
      success:         "#22C55E"
      success-text:    "#16A34A"
      warning:         "#F59E0B"
      warning-fill:    "#FEF3C7"
      warning-text:    "#92400E"
      info:            "#2563EB"   # alias of primary-600

    # ── Aurora palette (six drifting blobs in the backdrop) ───────
    aurora:
      "0": "#2563EB"   # ocean blue
      "1": "#7C3AED"   # violet
      "2": "#DB2777"   # pink
      "3": "#EA580C"   # orange
      "4": "#0891B2"   # cyan
      "5": "#059669"   # emerald
      blend-mode-light: multiply
      blend-mode-dark:  screen
      base-opacity:     0.12
      breathe-amplitude: 0.30   # ±30% of base-opacity
      blur-desktop:     "60px"
      blur-mobile:      "36px"

    # ── Backdrop gradient recipes (used at :root) ─────────────────
    backdrop:
      light: |
        radial-gradient(ellipse at 20% 0%,   rgba(37,99,235,0.08), transparent 55%),
        radial-gradient(ellipse at 80% 100%, rgba(37,99,235,0.05), transparent 55%),
        linear-gradient(180deg, #FAFBFC 0%, #F1F5F9 100%)
      dark: |
        radial-gradient(ellipse at 20% 0%,   rgba(59,130,246,0.18), transparent 55%),
        radial-gradient(ellipse at 80% 100%, rgba(37,99,235,0.10), transparent 55%),
        linear-gradient(180deg, #0F172A 0%, #060912 100%)

    # ── Spotlight glow (cursor / touch parallax on cards) ─────────
    spotlight:
      color: "rgba(37,99,235,0.16)"
      radius: "320px"        # ToolCard
      radius-large: "420px"  # WorkflowHeroCard
      radius-dropzone: "300px"
      shape: "radial-gradient(<radius> circle at <x> <y>, <color>, transparent 70%)"

    # ── Color-picker presets (signature, watermark) ───────────────
    presets:
      black: "#1E293B"
      grey:  "#64748B"
      blue:  "#1D4ED8"
      red:   "#DC2626"

  typography:
    font-family:
      sans: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      serif: "ui-serif, Georgia, 'Times New Roman', serif"   # used only for the italic hero accent
      mono: "ui-monospace, SFMono-Regular, Menlo, monospace"  # version pill, ⌘K kbd

    # Inter is loaded as a self-hosted variable font with axis 100–900.
    weights:
      regular:  400
      medium:   500
      semibold: 600
      bold:     700

    # Sizes are expressed in px since the app sets them explicitly.
    scale:
      eyebrow:        { size: "11px",   weight: 600, tracking: "0.12em",   transform: "uppercase" }
      eyebrow-strong: { size: "11px",   weight: 600, tracking: "0.14em",   transform: "uppercase" }   # "NEW" pill
      caption:        { size: "12px",   weight: 500, tracking: "0",        leading: "1.45" }
      caption-plus:   { size: "12.5px", weight: 500, tracking: "0",        leading: "1.45" }
      body-sm:        { size: "13px",   weight: 400, tracking: "0",        leading: "1.50" }
      body-sm-plus:   { size: "13.5px", weight: 400, tracking: "0",        leading: "1.55" }
      body:           { size: "14px",   weight: 400, tracking: "0",        leading: "1.55" }
      body-lg:        { size: "15.5px", weight: 400, tracking: "0",        leading: "1.55" }
      lead:           { size: "17px",   weight: 400, tracking: "0",        leading: "1.55" }
      lead-lg:        { size: "18px",   weight: 400, tracking: "0",        leading: "1.55" }
      tool-title:     { size: "15px",   weight: 600, tracking: "-0.005em", leading: "1.30" }
      h3:             { size: "20px",   weight: 600, tracking: "-0.015em", leading: "1.30" }
      h2:             { size: "22px",   weight: 600, tracking: "-0.02em",  leading: "1.20" }   # mobile
      h2-lg:          { size: "30px",   weight: 600, tracking: "-0.02em",  leading: "1.15" }   # desktop
      h2-xl:          { size: "36px",   weight: 600, tracking: "-0.02em",  leading: "1.15" }   # widest
      page-title:     { size: "24px",   weight: 600, tracking: "-0.015em", leading: "1.20" }   # tool / workflows page
      hero:           { size: "34px",   weight: 600, tracking: "-0.03em",  leading: "1.05" }   # mobile
      hero-md:        { size: "46px",   weight: 600, tracking: "-0.03em",  leading: "1.05" }
      hero-lg:        { size: "60px",   weight: 600, tracking: "-0.03em",  leading: "1.05" }
      hero-xl:        { size: "64px",   weight: 600, tracking: "-0.03em",  leading: "1.05" }
    italic-accent:
      font-family: serif
      style: italic
      weight: regular
      color: "{primary.600}"
      usage: "Reserved for the single emphasised phrase in the hero headline. One per page, never combined with bold."
    numerals:
      tabular: true   # version pills, page counts, slider values, kbd hints
    smoothing:
      webkit: antialiased
      moz: grayscale

  spacing:
    unit: "4px"   # base — Tailwind default
    scale:
      "0":  "0"
      "0.5":"2px"
      "1":  "4px"
      "1.5":"6px"
      "2":  "8px"
      "2.5":"10px"
      "3":  "12px"
      "3.5":"14px"
      "4":  "16px"
      "5":  "20px"
      "6":  "24px"
      "7":  "28px"
      "8":  "32px"
      "10": "40px"
      "12": "48px"
      "14": "56px"
      "16": "64px"
    layout:
      page-max-width:     "1152px"   # max-w-6xl — header / main / footer
      content-max-width:  "672px"    # max-w-2xl — search bar, hero card
      reading-max-width:  "560px"    # max-w-140 — supporting paragraphs
      page-px-mobile:     "16px"
      page-px-desktop:    "24px"
      page-py-main:       "32px"
      hero-pt-mobile:     "24px"
      hero-pt-desktop:    "56px"
      section-gap:        "48px"
      card-grid-gap:      "16px"
      card-padding-mobile:  "20px 24px"   # px-5 py-6
      card-padding-desktop: "24px"        # p-6
      dropzone-padding:     "40px"        # p-10

  radii:
    none:  "0"
    sm:    "6px"     # rounded-md — small chip / kbd hint
    md:    "8px"     # rounded-lg — toolbar buttons, list-row hover bg
    lg:    "12px"    # rounded-xl — primary buttons, callouts, dropzone, icon badges
    xl:    "16px"    # rounded-2xl — cards, modals, search bar
    pill:  "999px"   # rounded-full — value chips, step bullets, version pill, scrollbar thumb

  borders:
    width-default: "1px"
    width-emphasis: "2px"     # selected page thumbnails
    width-dashed:   "2px"     # dropzone & "Create workflow" card
    style-dashed:   "dashed"
    color-default:  "{semantic.light.border}"
    color-hover:    "{primary.300}"
    color-focus:    "{primary.400}"
    color-selected: "{primary.500}"

  elevation:
    # Subtle by default — the design relies on borders + glass blur, not heavy shadows.
    none: "none"
    sm:   "0 1px 2px rgba(15,23,42,0.06)"
    sm-tinted: "0 1px 2px rgba(241,245,249,0.50)"          # header, light cards
    md:   "0 4px 12px rgba(15,23,42,0.08)"                  # card hover
    lg:   "0 12px 32px rgba(15,23,42,0.12)"                 # popovers
    xl:   "0 24px 60px rgba(15,23,42,0.18)"                 # confirm dialog
    cta-tint: "0 1px 2px rgba(59,130,246,0.30)"             # primary CTA in modal
    cta-danger-tint: "0 1px 2px rgba(239,68,68,0.30)"

  blur:
    glass-header:   "12px"   # backdrop-blur-md on header / footer / pill bar
    glass-modal:    "14px"   # ConfirmDialog backdrop
    glass-card:     "8px"    # backdrop-blur-sm on glass surface cards
    glass-search:   "8px"    # search bar
    aurora-desktop: "60px"
    aurora-mobile:  "36px"

  motion:
    durations:
      instant: "120ms"   # fade-in
      fast:    "150ms"   # popovers, theme color swaps
      base:    "200ms"   # card hover, button color, ring transitions
      smooth:  "300ms"   # progress bar, spotlight opacity
      pop:     "350ms"   # scale-in modal
      hero:    "450ms"   # fade-in-up entrance
      pulse:   "2500ms"  # error / warning attention-ring loop
    easings:
      standard:   "cubic-bezier(0.4, 0, 0.2, 1)"        # ease-out default
      pop:        "cubic-bezier(0.34, 1.56, 0.64, 1)"   # scale-in (slight overshoot)
      linear:     "linear"
      ease-in-out: "cubic-bezier(0.42, 0, 0.58, 1)"     # aurora morphing
    keyframes:
      fade-in:        "opacity 0 → 1"
      fade-in-up:     "opacity 0 + translateY(12px) → opacity 1 + translateY(0)"
      scale-in:       "opacity 0 + scale(0.82) → opacity 1 + scale(1) (pop easing)"
      popover-in:     "opacity 0 + translateY(-6px) scale(0.97) → 1/0/1"
      popover-in-above:"opacity 0 + translateY(6px) scale(0.97) → 1/0/1"
      focus-ring-pulse:"box-shadow 0 0 0 0 rgba(37,99,235,0.35) → 0 0 0 10px rgba(37,99,235,0)"
      error-pulse-ring:"box-shadow ring of rgba(239,68,68,0.45) → transparent (0–60%, hold 60–100%)"
      warning-pulse-ring:"box-shadow ring of rgba(245,158,11,0.45) → transparent (0–60%, hold 60–100%)"
    stagger:
      hero-headline: "0ms"
      hero-subhead:  "80ms"
      hero-card:     "120ms"
      eyebrow:       "140ms"
      search:        "160ms"
      category-step: "80ms"   # added per category index
    hover-lift:
      translate-y: "-2px"     # -translate-y-0.5
      scale:       1.02       # used on icon badges (group-hover:scale-105)
    parallax-spotlight:
      enabled-on: ["ToolCard", "WorkflowHeroCard", "FileDropZone"]
      follows: "cursor + first touch point"
    reduced-motion:
      respects: true
      disables: ["aurora drift/morph/breathe", "popover-in", "fade-in", "error-pulse", "warning-pulse"]

  iconography:
    library: "lucide-react"
    stroke-default: 2
    stroke-light:   1.5     # FileDropZone — friendlier silhouette at large sizes
    stroke-bold:    2.5     # search field magnifier (when active)
    sizes:
      xs:  "12px"   # inline divider chevrons
      sm:  "14px"   # toolbar buttons
      md:  "16px"   # body buttons, callout icons
      base:"20px"   # tool card icon
      lg:  "24px"   # page-title icon, hero card icon
      xl:  "28px"   # empty-state icon
      hero:"32px"   # FileDropZone glyph
    badge:
      size: "44px"          # w-11 h-11
      radius: "12px"        # rounded-xl
      bg-rest:  "{slate.100}"
      fg-rest:  "{slate.700}"
      bg-hover: "{primary.50}"
      fg-hover: "{primary.600}"

  components:
    button-primary:
      bg: "{primary.600}"
      bg-hover: "{primary.700}"
      fg: "#FFFFFF"
      radius: "{radii.lg}"
      px: "32px"
      py: "12px"
      font: tool-title
      disabled-opacity: 0.5
      trailing-icon: "ArrowRight (continue) | Download (final workflow step) | none"
    button-secondary:
      bg: "{slate.100}"
      bg-hover: "{slate.200}"
      fg: "{slate.700}"
      radius: "{radii.md}"
      px: "12px"
      py: "6px"
      font: body-sm
    button-ghost:
      bg: "transparent"
      bg-hover: "{slate.100}"
      fg: "{slate.500}"
      fg-hover: "{slate.800}"
    card:
      surface: "{semantic.light.surface}"
      border: "1px solid {semantic.light.border}"
      radius: "{radii.xl}"
      padding: "20px 24px"
      hover: { lift: "-2px", border: "{primary.300}", shadow: "{elevation.md}", spotlight: true }
      transition: "border-color, box-shadow, transform 200ms standard"
    card-glass:
      surface: "{semantic.light.surface-glass-soft}"
      backdrop-blur: "{blur.glass-card}"
      border: "1px solid {semantic.light.border}"
      radius: "{radii.xl}"
    dropzone:
      bg-rest: "rgba(255,255,255,0.70)"
      bg-drag: "rgba(239,244,255,0.80)"
      border: "2px dashed {slate.300}"
      border-drag: "{primary.400}"
      radius: "{radii.lg}"
      padding: "40px"
      icon-badge:
        size: "64px"
        radius: "{radii.xl}"
        bg-rest: "{slate.100}"
        bg-drag: "{primary.100}"
    callout:
      radius: "{radii.lg}"
      padding: "16px"
      variants:
        info:    { bg: "{primary.50}",  border: "{primary.200}", icon: "{primary.600}",  text: "{primary.800}" }
        warning: { bg: "#FEF3C7",       border: "#FDE68A",       icon: "#D97706",        text: "#92400E", pulse: warning }
        error:   { bg: "#FEF2F2",       border: "#FECACA",       icon: "#DC2626",        text: "#B91C1C", pulse: error }
    pill-eyebrow:
      bg: "{primary.50}"
      border: "1px solid {primary.200}"
      fg: "{primary.600}"
      radius: "{radii.pill}"
      px: "8px"
      py: "2px"
      font: eyebrow-strong
    chip-value:
      bg: "{primary.100}"
      fg: "{primary.700}"
      radius: "{radii.pill}"
      px: "8px"
      py: "2px"
      font: caption
      tabular-nums: true
    kbd:
      bg: "{slate.50}"
      border: "1px solid {slate.200}"
      fg: "{slate.500}"
      radius: "{radii.sm}"
      px: "8px"
      py: "4px"
      font: { size: "11px", family: mono, weight: 500, tracking: "tight" }
    page-thumbnail:
      aspect: "3 / 4"
      radius: "{radii.md}"
      border: "2px solid {slate.200}"
      border-hover: "{primary.300}"
      border-selected: "{primary.500}"
      ring-selected: "2px {primary.200}"
      label-overlay: "linear-gradient(to top, rgba(0,0,0,0.50), transparent)"
    progress-bar:
      track: "{slate.200}"
      fill: "{primary.600}"
      height: "8px"
      radius: "{radii.pill}"
      transition: "width 300ms standard"
    confirm-dialog:
      surface: "{semantic.light.surface-glass}"
      backdrop: "rgba(15,23,42,0.30)"
      backdrop-blur: "{blur.glass-modal}"
      shadow: "{elevation.xl}"
      animation: scale-in
      radius: "{radii.xl}"
      max-width: "448px"
    header:
      surface: "{semantic.light.surface-glass}"
      backdrop-blur: "{blur.glass-header}"
      border-bottom: "1px solid {semantic.light.border-soft}"
      shadow: "{elevation.sm-tinted}"
      sticky: true
    footer:
      surface: "color-mix(in oklab, white 92%, transparent)"
      backdrop-blur: "{blur.glass-header}"
      border-top: "1px solid {semantic.light.divider}"
      safe-area-bottom: "env(safe-area-inset-bottom, 0px)"

  focus:
    visible-style: "ring"
    ring-color: "{primary.400}"
    ring-color-selected-thumbnail: "{primary.500}"
    ring-width: "2px"
    ring-offset: "2px"
    ring-translucent: "rgba(96,165,250,0.50)"   # primary-400/50

  scrollbar:
    width: "8px"
    thumb-light: "rgba(100,116,139,0.30)"
    thumb-dark:  "rgba(148,163,184,0.30)"
    track: "transparent"
    radius: "{radii.pill}"
    use: "Only inside surface containers (modals, glass cards) — never on the page itself."

  z-index:
    aurora: 0
    main: 10
    header: 50
    layout-shell: 150
    modal: 200

  breakpoints:
    sm:  "640px"
    md:  "768px"
    lg:  "1024px"
    xl:  "1280px"

  pwa:
    theme-color: "#2563EB"
    color-scheme: "light dark"
    safari-mask-color: "#2563EB"

design-references:
  - name: "Inter Variable"
    url:  "https://rsms.me/inter"
    note: "Self-hosted, OFL 1.1. Variable axis 100–900, with a separate italic file."
  - name: "Lucide icons"
    url:  "https://lucide.dev"
  - name: "CloakResume onboarding palette"
    note: "Aurora six-blob composition was lifted from CloakResume; blend tokens kept compatible."
---

# CloakPDF — Design

CloakPDF is a privacy-first PDF toolkit that runs entirely in the browser. The look has to match that promise: it should feel **calm, considered, and quietly modern** — not a busy SaaS dashboard, not a stripped-down utility. Every visual decision serves one of three goals: (1) signal trust, (2) keep the user oriented across 35+ tools, and (3) stay out of the way of the file the user actually came to work on.

## North-star feel

Imagine a clean white-paper notebook resting on a soft watercolour wash. The page itself is paper-quiet — slate text on near-white surface — and the only colour with personality is a single Ocean-Blue accent that follows the user's attention: hovered cards bloom faintly blue, the cursor casts a small blue spotlight, focused inputs glow blue. Behind everything, a slow-drifting **aurora** of six pastel blobs breathes underneath a multiply blend, the way light moves through frosted glass. It's a deliberately analogue mood for a deliberately on-device tool.

In dark mode the palette inverts to a cool deep-navy slate (`#060912` → `#0F172A`) and the aurora switches to a `screen` blend so the same blobs glow softly instead of tinting. Everything else — tracking, weights, radii — stays identical, which keeps the typography rhythm consistent across themes.

## Voice of colour

- **Ocean Blue (`#2563EB`)** is the only branded hue. It carries CTAs, links, focus, the logo's "PDF" wordmark, the eyebrow labels, and the cursor spotlight. We never use a second accent for "different categories" — the four tool categories share one accent, on purpose, so the home grid reads as one cohesive product instead of a parking lot of colour-coded tiles. This is a load-bearing decision: an earlier per-category palette was retired because it felt noisy; the muted single-accent version reads more modern and respects the privacy mood.
- **Slate neutrals** do all the heavy lifting for text, borders, dividers, and quiet surfaces. We use the full 50–800 ramp, never warm grey.
- **Status colours** (red / amber / green) are the _only_ exceptions to the single-accent rule. They stay loud on purpose — a failure should feel like a failure regardless of where you are in the app. Errors and warnings even pulse a soft outer ring (`error-pulse`, `warning-pulse`) so they can't be missed mid-task; the pulse respects `prefers-reduced-motion`.
- **The "Why CloakPDF" feature grid** breaks the single-accent rule deliberately, _once_ — each pillar (no sign-up, no tracking, local-first, offline, PWA, multi-device, 35+ tools, theming, open source) gets its own jewel-tone icon tinted via `color-mix(in oklab, …  14%, transparent)`. This is the only place the app shows its full hand of colour, and it's confined to one section near the bottom of the home page.
- The **aurora palette** (blue, violet, pink, orange, cyan, emerald) is an explicit nod to the CloakResume sibling product. It only ever appears as low-opacity backdrop blobs — never as a foreground colour.

## Typography

A single **Inter Variable** typeface (self-hosted, weights 100–900, separate italic file) does almost everything. Numerals are tabular wherever they communicate precision (version pill, page counts, slider readouts, kbd hints).

The hero headline is the loudest element in the product: 60–64px on desktop, semibold (600), with **negative letter-spacing of -0.03em** and tight 1.05 leading so it reads as a sentence rather than a banner. Inside it, exactly one phrase is set in **serif italic Ocean Blue** — _"stay on your device"_ on the home page — and that pattern is repeated nowhere else. The italic accent is the visual signature of the product; using it twice would dilute it.

Section eyebrows are a small uppercase 11px label, primary-tinted, with 0.12em tracking. They sit above each section's H2 to provide categorical context without competing for attention.

## Surfaces, glass and depth

The product avoids heavy shadows. Depth comes from three layers, in order:

1. **The aurora backdrop** sits at z=0 — fixed, blurred, drifting, and on mobile it's masked away from the bottom 200px so iOS Safari's URL-bar colour-sample never picks up a saturated blob.
2. **Glass surfaces** (`backdrop-blur` 8–14px on translucent white/85) sit on top: header, footer, search bar, modals, and the empty-state cards. The glass is what reveals the aurora as a soft tint rather than a foreground decoration.
3. **Solid cards** sit on top of the glass for everything that needs to read with crisp edges — tool cards, workflow cards, callouts, page thumbnails. These use a 1px slate-200 border and `rounded-2xl` corners.

Card hover is a small choreography: a -2px lift, a softer Ocean-Blue border, a `shadow-md` settle, and a **cursor-tracking spotlight glow** (a 320px radial gradient at `rgba(37,99,235,0.16)` that follows the pointer or the first touch point). On mobile the same spotlight ignites on `touchstart` so the gesture doesn't feel inert. This spotlight is the single most identity-defining micro-interaction in the product — it lives on `ToolCard`, `WorkflowHeroCard`, and `FileDropZone`.

## Motion

Motion is slow, soft, and used to introduce hierarchy rather than decorate.

- **Hero entrance** stages the home page top-down: headline (0ms) → subhead (80ms) → workflow card (120ms) → eyebrow (140ms) → search (160ms) → categories (80ms × index). Each piece does a 12px `translateY` + opacity over 450ms ease-out.
- **Modals** scale in from 0.82 with a slight overshoot (`cubic-bezier(0.34, 1.56, 0.64, 1)`) over 350ms so they feel like they "pop" into place.
- **Popovers** rise 6px with a faint scale-in over 150ms — fast enough to feel native.
- **Aurora blobs** morph (border-radius), drift across the viewport, and breathe (opacity ±30%) on independent loops of 10–62 seconds so the composite never visibly repeats.
- **Error and warning callouts** loop a 2.5s soft outer ring pulse to draw the eye without becoming frantic.
- Everything respects `prefers-reduced-motion`: aurora freezes, popovers and pulses cease.

## Layout & rhythm

A single content column with `max-w-6xl` (1152px) for the page shell and `max-w-2xl` (672px) for hero-tier elements (search bar, workflow card). Body paragraphs cap at `max-w-140` (~560px) so reading copy never stretches across a desktop monitor. Page horizontal padding is 16px on mobile and 24px on desktop.

Sections are spaced at 48–56px on desktop, 32–40px on mobile. Tool cards live in a 1/2/3-column grid with a 16px gap. Within a card, the icon badge → title → description sit in a tight 2-unit vertical stack with a chevron that slides in from the bottom-right corner on hover.

## Iconography

Lucide-react throughout, default 2-stroke, scaled in eight standard sizes from 12px (inline dividers) to 32px (FileDropZone hero glyph). Tool cards always use a **44px slate-100 rounded-xl badge** that fills with `primary-50` on hover and tints the icon to `primary-600` — this is how you tell at a glance whether a card is "live."

## Component conventions

- **Primary buttons** are pill-rectangles (`rounded-xl`, 32px horizontal padding, 12px vertical, semibold). They optionally trail an arrow (continue) or download glyph (final workflow step) so the button telegraphs what it'll do next.
- **Secondary / toolbar buttons** are `rounded-lg`, slate-100 fill, 13px medium label, used for Import / Export / Edit affordances.
- **Pills** (eyebrow labels with a `NEW` badge, value chips next to sliders, version chip in the footer) all use `rounded-full` with primary-50/primary-100 fills and primary-600/primary-700 text.
- **Drop zones** are 2px dashed slate-300 borders on a 70%-white glass surface, 40px padding, with a 64px icon badge that floats up 4px on hover and recolours to primary-50.
- **Page thumbnails** sit in 3:4 cards with a black-to-transparent gradient label overlay; selection promotes the border to `primary-500` with a 2px primary-200 ring.

## Accessibility & resilience

Focus rings are always visible (2px primary-400 with 2px offset) on interactive elements that don't otherwise visually shift. Dialogs trap focus, restore body scroll on close, and listen for Escape/Enter. Search supports ⌘K / Ctrl+K. The thin custom scrollbar is reserved for in-card overflow only — page-level scrollbars stay native so users keep their browser's expected affordances.

The colour system survives every theme: light, dark, drag-over, focus, error, warning. Dark mode is driven by `prefers-color-scheme` only — there is no manual toggle, by design.

## Things this design intentionally is _not_

- Not colour-coded by category. The single Ocean-Blue accent is load-bearing.
- Not glassmorphism-heavy. Glass is a backdrop technique; foreground content is always opaque.
- Not animated for delight on every action — only entrance, modal, hover spotlight, and the always-on aurora drift.
- Not loud about the brand. The wordmark is one element of one header; everything else is the work the user came to do.
