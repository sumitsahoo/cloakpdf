---
name: CloakPDF
tagline: PDF tools that stay on your device.
mood: [calm, trustworthy, modern, glassy, quiet, generous]
inspiration:
  - "Apple's marketing pages — generous whitespace, large semibold display type, italic serif accent words"
  - "Linear / Vercel landing pages — sticky glassy chrome, soft tinted backgrounds, restrained UI ornamentation"
  - "Nordic productivity apps — slate neutrals, single high-quality accent colour, almost no chrome"
  - "Aurora / liquid-glass page backdrops — slow-drifting blurred colour blobs that read as ambient light, not pattern"

# ──────────────────────────────────────────────────────────────────
# Color tokens — light mode is the canonical palette. Every dark
# token has a `.dark` counterpart used under prefers-color-scheme:
# dark. Hex strings are the source of truth; rgba() values appear
# only where transparency is part of the surface (glow/glass).
# ──────────────────────────────────────────────────────────────────
color:
  # Primary scale ("Ocean Blue") — derived from #2563EB.
  primary:
    "50":  "#EFF4FF"
    "100": "#DBEAFE"
    "200": "#BFDBFE"
    "300": "#93C5FD"
    "400": "#60A5FA"
    "500": "#3B82F6"
    "600": "#2563EB"  # canonical primary — CTAs, focus, accent links
    "700": "#1D4ED8"  # hover / pressed
    "800": "#1E40AF"
    "900": "#1E3A8A"

  # Neutral scale (slate). Headings sit at 800, body at 500.
  neutral:
    "50":  "#F8FAFC"
    "100": "#F1F5F9"
    "200": "#E2E8F0"
    "300": "#CBD5E1"
    "400": "#94A3B8"
    "500": "#64748B"  # body / secondary text
    "600": "#475569"
    "700": "#334155"
    "800": "#1E293B"  # headings / high-emphasis text
    "900": "#0F172A"

  # Semantic surfaces & text (light mode).
  surface:
    base:        "#FFFFFF"
    sunken:      "#F0F4FA"            # alt surface (cards-on-cards)
    glass:       "rgba(255,255,255,0.80)"  # glassy header / dialog
    glass-soft:  "rgba(255,255,255,0.65)"  # bento footer cards
    border:      "#E2E8F0"
    border-soft: "rgba(226,232,240,0.70)"

  text:
    strong:  "#0F172A"   # display headlines
    default: "#1E293B"   # headings, prose
    muted:   "#64748B"   # body / secondary
    faint:   "#94A3B8"   # placeholders, disabled
    accent:  "#2563EB"   # links, accent words, kbd hint
    invert:  "#FFFFFF"

  status:
    danger:        "#EF4444"
    danger-tint:   "#FEE2E2"
    warning:       "#F59E0B"
    warning-tint:  "#FEF3C7"
    success:       "#22C55E"
    success-tint:  "#DCFCE7"

  # Page backdrop — two faint radial tints over a cool linear base.
  # Calibrated so iOS Safari's URL-bar sample zone never saturates.
  page-bg:
    layer-1: "radial-gradient(ellipse at 20% 0%, rgba(37,99,235,0.08), transparent 55%)"
    layer-2: "radial-gradient(ellipse at 80% 100%, rgba(37,99,235,0.05), transparent 55%)"
    base:    "linear-gradient(180deg, #FAFBFC 0%, #F1F5F9 100%)"

  # Spotlight glow used by interactive cards (FileDropZone, ToolCard,
  # WorkflowHeroCard). Cursor-tracking radial-gradient.
  glow:
    primary-soft:   "rgba(37,99,235,0.16)"
    primary-strong: "rgba(37,99,235,0.18)"
    focus-ring:     "rgba(37,99,235,0.18)"

  # Aurora — six animated blurred blobs that drift across the page.
  aurora:
    palette:
      - "#2563EB"  # blue (primary)
      - "#7C3AED"  # violet
      - "#DB2777"  # pink
      - "#EA580C"  # orange
      - "#0891B2"  # cyan
      - "#059669"  # emerald
    blend-light: multiply
    blend-dark:  screen
    base-opacity: 0.08
    grain-opacity-light: 0.045
    grain-opacity-dark:  0.080

  # Feature-pill accents on the "Why CloakPDF" grid. Each pill mixes a
  # 14% tint of its hex into transparent for the icon background, with
  # the same hex (slightly desaturated in dark) as the icon foreground.
  feature-pills:
    no-signup:    { bg-mix: "#059669", fg-light: "#059669", fg-dark: "#34D399" }
    no-tracking:  { bg-mix: "#7C3AED", fg-light: "#7C3AED", fg-dark: "#A78BFA" }
    local-first:  { bg-mix: "#0D9488", fg-light: "#0D9488", fg-dark: "#5EEAD4" }
    offline:      { bg-mix: "#0891B2", fg-light: "#0891B2", fg-dark: "#22D3EE" }
    pwa:          { bg-mix: "#EA580C", fg-light: "#EA580C", fg-dark: "#FDBA74" }
    multi-device: { bg-mix: "#EAB308", fg-light: "#CA8A04", fg-dark: "#FACC15" }
    breadth:      { bg-mix: "#DB2777", fg-light: "#DB2777", fg-dark: "#F472B6" }
    theming:      { bg-mix: "#4F46E5", fg-light: "#4F46E5", fg-dark: "#A5B4FC" }
    open-source:  { bg-mix: "#475569", fg-light: "#475569", fg-dark: "#CBD5E1" }

  # Dark-mode tokens. Applied via prefers-color-scheme: dark.
  dark:
    surface:
      base:        "#1E293B"
      sunken:      "#334155"
      page:        "#0F172A"
      page-bottom: "#060912"
      glass:       "rgba(30,41,59,0.80)"
      glass-soft:  "rgba(30,41,59,0.60)"
      border:      "#334155"
      border-soft: "rgba(255,255,255,0.10)"
    text:
      strong:  "#FFFFFF"
      default: "#F1F5F9"
      muted:   "#94A3B8"
      faint:   "#64748B"
      accent:  "#60A5FA"
    page-bg:
      layer-1: "radial-gradient(ellipse at 20% 0%, rgba(59,130,246,0.18), transparent 55%)"
      layer-2: "radial-gradient(ellipse at 80% 100%, rgba(37,99,235,0.10), transparent 55%)"
      base:    "linear-gradient(180deg, #0F172A 0%, #060912 100%)"

# ──────────────────────────────────────────────────────────────────
# Typography
# ──────────────────────────────────────────────────────────────────
typography:
  font-family:
    sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    serif-accent: "ui-serif, Georgia, 'Times New Roman', serif"  # used italic for accent words in display headlines
    mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace"

  # Inter is shipped as a single variable file (weights 100–900) plus
  # an italic variable file. We use four weights; the file supports
  # any value if the design needs to drift.
  font-weight:
    regular:  400
    medium:   500
    semibold: 600  # default for headings, buttons, badges

  # Display headlines have intentionally tight tracking and line-height.
  letter-spacing:
    display: "-0.03em"  # hero h1
    h2:      "-0.02em"
    h3:      "-0.015em"
    body:    "-0.005em"  # tool card titles, list item titles
    label:   "0.12em"    # uppercase eyebrows / category eyebrows
    eyebrow: "0.16em"    # uppercase "How it works" / "Part of"

  line-height:
    display: 1.05
    h2:      1.15
    h3:      1.20
    snug:    1.30
    body:    1.55
    relaxed: 1.625

  # Type scale. Hero scales fluidly across breakpoints — values are
  # the explicit pixel sizes used in the codebase rather than a theory
  # ladder, because the design intentionally picks half-step sizes.
  scale:
    hero:           { sm: 34px, md: 44px, lg: 52px, xl: 58px, weight: semibold, tracking: display }
    section-h2:     { sm: 22px, md: 26px, weight: semibold, tracking: h2 }
    why-h2:         { sm: 24px, md: 30px, lg: 36px, weight: semibold, tracking: h2 }
    tool-title:     { size: 15px, weight: semibold, tracking: body }
    tool-page-h1:   { size: 24px, weight: semibold, tracking: h3 }   # "text-2xl"
    body-lead:      { sm: 15px, md: 16.5px, lg: 17px, line: body }
    body:           { size: 14px, line: relaxed }
    body-tight:     { size: 13px, line: snug }
    caption:        { size: 12.5px, line: snug }
    eyebrow:        { size: 11px, weight: semibold, transform: uppercase, tracking: label }
    eyebrow-mini:   { size: 10px, weight: medium,   transform: uppercase, tracking: eyebrow }
    kbd:            { size: 11px, weight: medium, family: mono, features: tabular-nums }

  # Italic serif accent in display headlines — a single phrase is
  # swapped to italic Georgia-class serif and tinted primary. Used as
  # a deliberate punctuation device, not decoration; appears once per
  # screen at most.
  display-accent:
    family: serif-accent
    style:  italic
    weight: regular
    color:  "color.primary.600"

# ──────────────────────────────────────────────────────────────────
# Spacing — based on a 4 px grid (Tailwind default). Listed sizes
# are the ones actually used in this codebase; anything in between is
# allowed but rare.
# ──────────────────────────────────────────────────────────────────
spacing:
  unit: 4px
  scale:
    "0.5": 2px
    "1":   4px
    "1.5": 6px
    "2":   8px
    "2.5": 10px
    "3":   12px
    "3.5": 14px
    "4":   16px
    "5":   20px
    "6":   24px
    "8":   32px
    "10":  40px
    "12":  48px
    "14":  56px
    "16":  64px
    "20":  80px

  layout:
    page-max:    1152px   # max-w-6xl content frame
    search-max:  768px    # max-w-3xl
    prose-max:   560px    # max-w-140 (custom) for marketing prose
    gutter-sm:   16px     # px-4
    gutter-md:   24px     # px-6
    section-y:   48px     # py-12 between major sections
    hero-y-top:  { sm: 24px, md: 40px, lg: 56px }   # pt-6 → pt-14
    hero-y-bot:  { sm: 40px, md: 48px }             # pb-10 → pb-12

# ──────────────────────────────────────────────────────────────────
# Radii — heavy use of three values: lg for inputs/badges, xl for
# buttons/icon tiles, 2xl for cards/dialogs/search-bar. Pills are
# fully rounded.
# ──────────────────────────────────────────────────────────────────
radius:
  none: 0
  sm:   2px
  md:   6px      # small popovers, hex preview, kbd
  lg:   8px      # inputs, secondary buttons, page thumbnails
  xl:   12px     # primary buttons, icon tiles, header back-button
  "2xl": 16px    # tool cards, hero card, search bar, dialogs, footer bento
  pill: 9999px   # category badges, "New" pill, file-size chip, focus dot

# ──────────────────────────────────────────────────────────────────
# Borders & strokes
# ──────────────────────────────────────────────────────────────────
border:
  width:
    hairline: 1px         # default for cards, inputs, dividers
    medium:   2px         # selected thumbnail, drop-zone dashed border
    thick:    3px         # spinner stroke

  style:
    solid:  solid
    dashed: dashed        # FileDropZone idle state

  color:
    default: "color.surface.border"            # #E2E8F0
    soft:    "color.surface.border-soft"       # rgba(226,232,240,0.70)
    strong:  "color.neutral.300"               # #CBD5E1 — hover
    accent:  "color.primary.300"               # focus / hover-on-card
    accent-strong: "color.primary.500"

# ──────────────────────────────────────────────────────────────────
# Elevation — a small ladder. Most surfaces sit at level-0 (no
# shadow) or level-1 (hairline shadow + border). Hover lifts cards
# from level-1 to level-2. Modals and popovers jump to level-3+.
# ──────────────────────────────────────────────────────────────────
elevation:
  level-0:
    shadow: "none"
    use:    "Page background, ambient surfaces, glass header"

  level-1:
    shadow: "0 1px 2px 0 rgba(15,23,42,0.05)"          # shadow-sm
    use:    "Tool cards at rest, search bar, info chips"

  level-2:
    shadow: "0 4px 6px -1px rgba(15,23,42,0.10), 0 2px 4px -2px rgba(15,23,42,0.06)"  # shadow-md
    use:    "Cards on hover, focused search, color-picker popover trigger"

  level-3:
    shadow: "0 10px 15px -3px rgba(15,23,42,0.10), 0 4px 6px -4px rgba(15,23,42,0.05)"  # shadow-lg
    use:    "Color-picker popover, dropdown menus"

  level-4:
    shadow: "0 20px 25px -5px rgba(15,23,42,0.10), 0 8px 10px -6px rgba(15,23,42,0.04)"  # shadow-xl
    use:    "Drag-overlay thumbnails"

  level-5:
    shadow: "0 25px 50px -12px rgba(15,23,42,0.25)"   # shadow-2xl
    use:    "Confirm dialog, modal sheets"

  # Confirmation buttons carry a tiny tinted shadow so the affordance
  # reads even on a glassy surface.
  tinted:
    primary-cta: "0 1px 2px 0 rgba(59,130,246,0.30)"   # shadow-primary-500/30
    danger-cta:  "0 1px 2px 0 rgba(239,68,68,0.30)"    # shadow-red-500/30

# ──────────────────────────────────────────────────────────────────
# Effects — glass, blur, and the cursor-tracking spotlight glow.
# ──────────────────────────────────────────────────────────────────
effect:
  blur:
    xs: 4px
    sm: 8px
    md: 12px
    lg: 16px      # glassy header & dialog (backdrop-blur-xl)
    xl: 24px
    aurora-mobile: 36px
    aurora-desktop: 60px
    dialog-backdrop: 14px

  glass:
    light:
      background: "rgba(255,255,255,0.80)"
      backdrop:   "blur(16px)"
      border:     "1px solid rgba(226,232,240,0.70)"
    dark:
      background: "rgba(30,41,59,0.80)"
      backdrop:   "blur(16px)"
      border:     "1px solid rgba(255,255,255,0.10)"

  spotlight:
    # Cursor / touch tracking radial gradient painted inside cards.
    # Radius scales by card size: 300 px for FileDropZone, 320 px for
    # ToolCard, 420 px for the wider WorkflowHeroCard.
    geometry: "radial-gradient(<radius> circle at <cursorX>px <cursorY>px, <glow>, transparent 70%)"
    radius:
      drop-zone:   300px
      tool-card:   320px
      hero-card:   420px
    color: "color.glow.primary-soft"   # rgba(37,99,235,0.16)
    fade-duration: 300ms

  grain:
    # Inline SVG fractalNoise tiled over the aurora at low opacity.
    # Kills the "CSS gradient" tell, adds a faint tactile texture.
    tile: 240px
    opacity-light: 0.045
    opacity-dark:  0.080
    blend-light:   multiply
    blend-dark:    overlay

# ──────────────────────────────────────────────────────────────────
# Motion
# ──────────────────────────────────────────────────────────────────
motion:
  # All interactive transitions land in this 150–300 ms band.
  # Anything longer is reserved for ambient (aurora) animation.
  duration:
    instant:   0ms
    fast:      120ms     # fade-in for popovers / overlays
    snappy:    150ms     # link colour change, hover tints
    standard:  200ms     # transforms, border-color, shadow
    smooth:    300ms     # opacity / spotlight glow fades
    enter:     350ms     # scale-in, slide-up-in
    fade-up:   450ms     # animate-fade-in-up (hero entry)
    pulse:     2500ms    # error/warning attention pulse loop
    aurora-flow:    "44s–62s"   # per-blob horizontal drift
    aurora-morph:   "17s–22s"   # per-blob border-radius morph
    aurora-breathe: "10s–15s"   # per-blob opacity oscillation

  easing:
    standard: "cubic-bezier(0.4, 0, 0.2, 1)"      # default ease
    out:      "cubic-bezier(0, 0, 0.2, 1)"        # ease-out — entry
    in-out:   "cubic-bezier(0.4, 0, 0.6, 1)"      # ease-in-out
    spring:   "cubic-bezier(0.34, 1.56, 0.64, 1)" # scale-in (slight overshoot)
    soft:     "cubic-bezier(0.22, 1, 0.36, 1)"    # slide-up-in (decelerate)
    linear:   "linear"                             # aurora flow only

  keyframes:
    fade-in-up:
      duration: 450ms
      easing:   out
      from:     "opacity:0; translateY(12px)"
      to:       "opacity:1; translateY(0)"
      use:      "Hero copy, section headers, tool grid sections, search bar"

    scale-in:
      duration: 350ms
      easing:   spring
      from:     "opacity:0; scale(0.82)"
      to:       "opacity:1; scale(1)"
      use:      "Confirm dialog card"

    popover-in:
      duration: 150ms
      easing:   out
      from:     "opacity:0; translateY(-6px) scale(0.97)"
      to:       "opacity:1; translateY(0) scale(1)"
      use:      "Dropdowns / popovers anchored below their trigger"

    popover-in-above:
      duration: 150ms
      easing:   out
      from:     "opacity:0; translateY(6px) scale(0.97)"
      to:       "opacity:1; translateY(0) scale(1)"
      use:      "Popovers anchored above their trigger"

    fade-in:
      duration: 120ms
      easing:   out
      use:      "Modal backdrop, transient hints"

    slide-up-in:
      duration: 350ms
      easing:   soft
      from:     "opacity:0; translateY(24px)"
      to:       "opacity:1; translateY(0)"
      use:      "Tool result panel reveal"

    error-pulse-ring:
      duration: 2500ms
      iteration: infinite
      stops:
        "0%":   "box-shadow: 0 0 0 0 rgba(239,68,68,0.45)"
        "60%":  "box-shadow: 0 0 0 8px rgba(239,68,68,0)"
        "100%": "box-shadow: 0 0 0 8px rgba(239,68,68,0)"
      use:      "AlertBox — keeps failures from being missed"

    warning-pulse-ring:
      duration: 2500ms
      iteration: infinite
      stops:
        "0%":   "box-shadow: 0 0 0 0 rgba(245,158,11,0.45)"
        "60%":  "box-shadow: 0 0 0 8px rgba(245,158,11,0)"
        "100%": "box-shadow: 0 0 0 8px rgba(245,158,11,0)"
      use:      "InfoCallout accent='warning'"

    focus-ring-pulse:
      duration: 1000ms
      iteration: 1
      stops:
        "0%":   "box-shadow: 0 0 0 0 rgba(37,99,235,0.35)"
        "100%": "box-shadow: 0 0 0 10px rgba(37,99,235,0)"

  reduced-motion:
    # Honors prefers-reduced-motion. Aurora freezes; popovers/fades
    # collapse to instant; pulses go static.
    aurora:           paused
    popover-in:       none
    fade-in:          none
    slide-up-in:      none
    error-pulse:      none
    warning-pulse:    none

  # Hover affordances on cards. Lift, brighten the icon tile, slide
  # title / chevron a half-pixel right.
  hover:
    card-translate-y: -2px
    title-translate-x: 0.5px
    chevron-translate-x: 0.5px
    icon-scale: 1.05
    icon-translate-y: -1px

# ──────────────────────────────────────────────────────────────────
# Iconography
# ──────────────────────────────────────────────────────────────────
icon:
  family: "lucide-react"
  default-stroke-width: 2
  thin-stroke-width: 1.5     # FileDropZone hero icon
  bold-stroke-width: 2.25    # search lens
  size:
    xs: 12px       # ArrowUpRight in pill links
    sm: 14px       # status row glyphs
    md: 16px       # button trailing icons, alert glyphs
    lg: 20px       # tool-card icon, header chips
    xl: 24px       # tool-page header icon
    hero: 32px     # FileDropZone large icon
  tile:
    size:    44px         # tool-card / hero-card icon tile (w-11 h-11)
    radius:  "radius.xl"  # 12px
    bg-rest: "color.neutral.100"
    bg-hover: "color.primary.50"
    fg-rest: "color.neutral.700"
    fg-hover: "color.primary.600"

# ──────────────────────────────────────────────────────────────────
# Component recipes — succinct token references, not exhaustive CSS.
# ──────────────────────────────────────────────────────────────────
component:
  page-shell:
    background:  "page-bg gradient (radials over slate linear base)"
    aurora:      "AuroraBackground component painted at z-index:0"
    grain:       "fractal-noise SVG tile at z-index:1, opacity 0.045 (light) / 0.08 (dark)"
    max-width:   "layout.page-max"
    safe-area:   "padding-bottom: env(safe-area-inset-bottom)"

  header:
    sticky:      true
    height:      "≈52 px (py-2.5 + content)"
    surface:     "effect.glass.light"
    border:      "1px hairline bottom, color.surface.border-soft"
    z-index:     50
    contents:    [optional-back-button, logo+wordmark, privacy-chip, github-link]

  brand-wordmark:
    text:    "Cloak[PDF]"
    weight:  semibold
    tracking: "-0.02em"
    color:   "color.text.default; the 'PDF' suffix uses color.primary.600"
    logo:    "32 px shield-glyph SVG with subtle drop-shadow"

  hero:
    layout:   "lg: 12-col grid, 7/5 split; mobile: stacked"
    headline:
      type:    "typography.scale.hero"
      accent-phrase: "italic serif, primary-600"
    subhead:
      type:    "typography.scale.body-lead"
      color:   "color.text.muted"
      max-width: 32rem
    entry:    "animate-fade-in-up, staggered 0/80/120 ms"

  workflow-hero-card:
    surface:  "color.surface.base"
    radius:   "radius.2xl"
    border:   "1px hairline color.surface.border"
    padding:  "20–24 px"
    icon:     "icon.tile"
    eyebrow:  "WORKFLOWS · NEW pill"
    body:     "headline 15–16 px semibold + 12.5–13 px muted prose"
    glow:     "effect.spotlight (radius hero-card, glow.primary-soft)"
    hover:    "lift -2 px, primary-300 border, level-2 shadow"

  search-bar:
    surface:    "rgba(255,255,255,0.90) + backdrop-blur-sm"
    radius:     "radius.2xl"
    border:     "1px hairline color.surface.border"
    leading:    "Search lens icon in a 40 px clear tile"
    trailing:   "kbd hint (⌘K / CtrlK) when empty; X-button when active"
    focus:      "border → primary-300, level-2 shadow, soft primary blur halo"
    width:      "layout.search-max"

  tool-card:
    surface:    "color.surface.base"
    radius:     "radius.2xl"
    border:     "1px hairline color.surface.border → primary-300 on hover"
    padding:    "20 px (sm: 24 px)"
    structure:  "icon tile · 8 px gap · title · 13 px muted description · trailing chevron (hidden until hover)"
    glow:       "effect.spotlight (radius tool-card, glow.primary-soft)"
    motion:     "lift -2 px (200 ms), icon scale 1.05 + tint primary, chevron slides in"

  category-section:
    eyebrow:    "11 px uppercase semibold primary-600 + ‘· N’ count in muted tone"
    title:      "typography.scale.section-h2"
    grid:       "1 / 2 / 3 columns at sm/md/lg, 16 px gap"

  why-grid:
    title:      "typography.scale.why-h2 (centered)"
    items:      "9 multi-coloured feature pills (3 × 3 grid)"
    pill:       "40 px square rounded-lg, fg+bg drawn from color.feature-pills"
    body:       "13.5 px muted prose"

  bento-footer:
    layout:    "12-col grid; 7/5 split; only on home"
    surface:   "color.surface.glass-soft + backdrop-blur-md"
    border:    "1px hairline color.surface.border-soft"
    radius:    "radius.2xl"
    decor:     "soft primary blur disc (160 px) tucked into one corner per card"
    rows:      "How-it-works (3-step ordered list with numbered chips) + Cloakyard family promo with explore link + version chip"

  primary-button:
    surface:    "color.primary.600 → primary.700 on hover"
    text:       "color.text.invert"
    weight:     medium
    padding:    "12 px y · 32 px x"
    radius:     "radius.xl"
    width:      "full on mobile; min 220 px on desktop, sm:w-auto"
    trailing:   "ArrowRight (workflow continue) | Download (final/standalone) | none"
    motion:     "transition-colors only (no scale/lift)"

  destructive-button:
    surface:    "color.status.danger → red-700 on hover"
    other:      "matches primary-button geometry"
    shadow:     "elevation.tinted.danger-cta"

  ghost-button:
    surface:    "color.surface.base"
    border:     "1px hairline color.surface.border → neutral-300 on hover"
    text:       "color.text.default"
    radius:     "radius.lg"

  reset-link:
    surface:    "transparent"
    style:      "Undo2 glyph + 'Reset' text, 14 px muted, hover → neutral-700"

  drop-zone:
    surface:    "rgba(255,255,255,0.70)"
    border:     "2 px dashed color.neutral.300 → primary.300 on hover"
    radius:     "radius.xl"
    padding:    "40 px"
    icon-tile:  "64 px rounded-2xl, neutral-100 fill, FileUp glyph"
    drag-over:  "border-primary-400, bg-primary-50/80, 1.005 scale"
    glow:       "effect.spotlight (radius drop-zone)"

  thumbnail:
    aspect:     "3:4"
    radius:     "radius.lg"
    border:     "2 px hairline color.surface.border"
    selected:   "border primary-500 + 2 px primary-200 ring"
    badge:      "‘Page N’ in 12 px white text on bottom-fade gradient"

  page-thumbnail-grid:
    gap:        "16 px"
    columns:    "auto-fit, 120–160 px tracks"
    drag:       "elevation.level-4 floating overlay during drag"

  alert-box:
    role:       "error only"
    surface:    "bg-red-50, border-red-200"
    text:       "red-700"
    radius:     "radius.xl"
    motion:     "motion.keyframes.error-pulse-ring"

  info-callout:
    role:       "info / success / warning"
    surface:    "primary-50 (info/success) | amber-50 (warning) + matching border-200"
    radius:     "radius.xl"
    structure:  "icon (5 px) + optional bold title + body, 14 px relaxed"
    motion:     "warning-pulse-ring on warning"

  badge-pill:
    radius:    "radius.pill"
    type:      "typography.scale.eyebrow-mini"
    surface:   "primary-50 with primary-200 border (NEW); neutral-100 with neutral-200 border (file-size chip / version chip)"

  kbd-hint:
    radius:    "radius.md"
    surface:   "neutral-50 with neutral-200 border"
    type:      "typography.scale.kbd"

  progress-bar:
    height:    8 px
    track:     "color.neutral.200"
    fill:      "color.primary.600"
    radius:    "radius.pill"
    label:     "left text + tabular-nums ‘current / total’ on the right"
    motion:    "width transition 300 ms"

  spinner:
    size:      32 px (small: 24 px)
    track:     "color.primary.200"
    head:      "color.primary.600"
    width:     3 px (small: 2 px)
    motion:    "rotate 750 ms linear infinite"

  slider:
    track:     full-width range input, primary-600 accent
    label:     "13 px medium left, primary-tinted pill with tabular-nums on the right"

  checkbox:
    size:      16 px
    accent:    "color.primary.600"
    label:     "13 px medium + optional 12 px faint description"

  color-picker:
    presets:   "4 swatch buttons (Black/Grey/Blue/Red) sized 24/20 px circles, primary-500 ring on selected"
    custom:    "Conic-gradient swatch with ‘+’ that opens a popover (256 px wide, level-3 shadow): SV gradient area, hue range, hex input"

  dialog:
    portal:    "createPortal(document.body)"
    backdrop:  "bg-slate-900/30 + 14 px blur"
    surface:   "rgba(255,255,255,0.85) + backdrop-blur-xl"
    radius:    "radius.2xl"
    shadow:    "elevation.level-5"
    width:     "max-w-md"
    structure: "icon disc · title + description · close-X · footer with Cancel + Confirm buttons on a slate-50/55 strip"
    motion:    "fade-in for backdrop, scale-in (spring) for card"

  scrollbar:
    thumb-light: "rgba(100,116,139,0.30)"
    thumb-dark:  "rgba(148,163,184,0.30)"
    track:       transparent
    width:       8 px
    radius:      "radius.pill"
    scope:       "modal/card overflow only — never the document"

# ──────────────────────────────────────────────────────────────────
# Layout & breakpoints
# ──────────────────────────────────────────────────────────────────
breakpoint:
  sm: 640px
  md: 768px
  lg: 1024px
  xl: 1280px

z-index:
  aurora:      0
  grain:       1
  page-shell:  10
  header:      50
  popover:     50
  dialog:      200

# ──────────────────────────────────────────────────────────────────
# Accessibility & input
# ──────────────────────────────────────────────────────────────────
accessibility:
  focus-ring:
    color:   "color.primary.400"
    width:   2 px
    offset:  2 px
    rule:    "All interactive elements expose a focus-visible ring; cards and thumbnails use ring + offset; inputs swap to a primary-300 border."
  contrast:
    body:     "color.text.muted on color.surface.base ≥ 4.6:1"
    headings: "color.text.default on color.surface.base ≥ 14:1"
  reduced-motion: "Aurora pauses; popovers / fades collapse to instant; pulses freeze."
  hit-targets: "≥ 36 px tap area on mobile (touch-action: manipulation, 6 px chrome on icon buttons)"
---

# Look & feel

CloakPDF is a privacy-first toolkit. The visual language is built around that
promise: it should feel calm, technical, and personal — never enterprise,
never noisy. The whole product reads like a single quiet page that occasionally
slides aside to reveal a focused workspace.

The page wears its character in the backdrop. Two faint blue radials sit over a
cool slate gradient (`#FAFBFC → #F1F5F9`); on top of that, six large, slowly
drifting blurred colour blobs — the **aurora** — orbit just below the chrome.
The aurora uses a `multiply` blend in light mode and `screen` in dark, so the
same colours register as warm tints on white and as glowing nebulae on near-black.
A static fractal-noise grain (`<feTurbulence>` SVG, ~4–8% opacity) is dusted on top
to break the "CSS gradient" tell and add a faint tactile texture. On mobile the
two smallest blobs drop out and the blur radius shrinks from 60 px to 36 px —
fullscreen blur is the single most expensive paint on phone GPUs, and the bottom
edge of the aurora is masked off with a vertical alpha gradient so iOS Safari's
URL-bar sample zone never picks up a saturated tint.

# Typography

Inter Variable is the only typeface; we ship `100–900` from a single woff2 plus
a separate italic file. We use four weights (400 / 500 / 600 / 600 again, since
that's the heaviest we want) and lean on Inter's tabular-nums for any
counts — `12 / 35`, `v1.4.2`, percentages — so numbers don't shimmer as they
update.

The display voice is ordinary semibold sans **with one italic serif accent
phrase** per screen. On the home page the hero reads **"PDF tools that
_stay on your device_."** — sans for the framing, italic Georgia-class serif in
`primary-600` for the promise. The accent never repeats inside a screen; it's
the punctuation that tells the reader what the page is _about_.

Headings use tight tracking (`-0.03em` for the hero, `-0.02em` for section
titles, `-0.015em` for tool-page H1s). Body copy is `slate-500` (`#64748B`) at
13–17 px with a generous `1.55` leading. Eyebrows are 10–11 px, `uppercase`,
`tracking-[0.12em]`, painted in `primary-600` for sections and `slate-400` for
quieter labels ("Part of", "How it works"). Keyboard hints (`⌘K`) sit in a
slate-50 chip with a hairline border, in monospace tabular nums.

# Color

The palette is deliberately small. **Primary** is "Ocean Blue" — a `#2563EB`
scale used for every CTA, link, focus ring, eyebrow, and accent phrase.
**Slate** is the only neutral; headings sit at slate-800, body at slate-500,
borders at slate-200. Errors are red, warnings amber, success green; those
three are the entire status palette. Per-category accent colours (organise /
transform / annotate / security) existed in an earlier iteration and have been
**explicitly retired** in favour of a single calmer accent — the `categoryGlow`
and `categoryAccent` maps still exist for call-site stability but every key
now resolves to the same primary blue value.

The single place colour gets _playful_ is the "Why CloakPDF" feature grid:
nine pills, each with its own hue (emerald, violet, teal, cyan, orange, yellow,
pink, indigo, slate). Each pill mixes its hex into transparent at 14% for the
icon background and uses the same hex (slightly desaturated for dark mode)
as the icon foreground. Read at 40 px, the row scans like a confetti band
without ever breaking the otherwise-monochrome page.

# Surfaces & glass

Three surface treatments cover almost everything:

- **Solid white card** — tool cards, hero card, dialog content. `1 px` slate-200
  hairline border, no shadow at rest, `shadow-md` on hover. Radius `1rem`.
- **Glassy bar** — header and dialog backdrop. `rgba(255,255,255,0.80)` with a
  16 px backdrop-blur and a hairline bottom border. The dialog backdrop adds a
  `slate-900/30` dim under the blur.
- **Glassy bento** — footer cards. `rgba(255,255,255,0.65)` with a 12 px blur
  and a soft 70%-opacity border, so the aurora can read _through_ the gutter
  between them.

In dark mode the white sources swap to `#1E293B` and the borders pick up a
white-alpha (`rgba(255,255,255,0.10)`) line that mimics liquid-glass edges.

# Shape & rhythm

Three radii do almost all the work: `12 px` for buttons and icon tiles,
`16 px` for cards / dialogs / search-bar / footer bento, and `9999 px` for
pills (badges, the "NEW" tag, the file-size chip, the focus indicator).
Inputs and small surfaces use `8 px`. We rarely use a `2 px` (`rounded-sm`)
radius — when we do it's an artefact (a `<kbd>` could trade its `6 px` for
that, but nothing else).

The page frame is `max-w-6xl` (1152 px) with 16 / 24 px gutters; marketing
prose narrows to `max-w-lg` (32 rem) and the search bar sits in `max-w-3xl`
(48 rem). The home grid is 1 / 2 / 3 columns at sm / md / lg with a `16 px`
gap; categories are separated by `48–56 px` of vertical air. The hero never
fully spans — the right rail (workflow card) anchors it at desktop sizes, and
when the search field has a query the hero's right column collapses but the
left column keeps its width so the page doesn't reflow as the user types.

# Motion

All interactive transitions live in a `150 / 200 / 300 ms` band: 150 ms for
colour swaps, 200 ms for transforms / borders / shadows, 300 ms for opacity
fades and the spotlight glow. Anything longer is reserved for entrance
choreography (`fade-in-up` 450 ms with `ease-out`) or for the ambient aurora
(per-blob loops of 17–62 s with negative phase offsets so the composite never
visibly repeats).

Hover affordances on cards are _small_: a `−2 px` lift, a `1.05` icon scale, a
half-pixel slide right on the title and chevron, and a tint shift from
slate-100 to primary-50 on the icon tile. The chevron in the bottom-right
fades + slides in only on hover; on touch devices the same `:active` rules
fire so the same affordance plays under a finger. We do **not** scale buttons
on hover — only `transition-colors` — to keep the CTA feeling solid and
land-able.

The signature interaction is the **cursor-tracking spotlight**. ToolCard,
WorkflowHeroCard, and FileDropZone each paint a radial-gradient halo in
`rgba(37,99,235,0.16)` at the cursor (or first touch) position, fading in
over 300 ms and following the pointer 1:1 (the radius scales by card size —
300 px on the dropzone, 320 px on tool cards, 420 px on the wider hero card).
On touch devices the same halo lights up at `touchstart` so the surface still
feels _alive_ under a finger.

Two ambient loops earn their motion budget:

- The **aurora** drifts continuously — six blobs morphing border-radius and
  translating across the viewport on independent 17–62 s clocks. It pauses
  entirely under `prefers-reduced-motion`.
- A **continuous pulse-ring** sits on `AlertBox` (red) and warning-tone
  `InfoCallout` (amber). The ring expands from 0 to 8 px in the first 60% of
  a 2.5 s loop, then holds at zero for 40% — a _breath_ between attention
  beats so the message reads as urgent rather than frantic. Also pauses
  under reduced-motion.

# Iconography

Every glyph comes from `lucide-react`, drawn at the default `2 px` stroke.
Two exceptions: the `FileDropZone` hero icon thins out to `1.5 px` to read as
"empty / waiting", and the search lens bumps to `2.25 px` so it holds its
weight at 20 px next to a 16 px input.

Icons live inside a 44 px **icon tile**: `12 px` radius, slate-100 fill,
slate-700 glyph at rest. On hover (`group-hover:`) the tile crossfades to
`primary-50` with a `primary-600` glyph and lifts `1 px`. This single
"icon-in-a-pillow" motif appears on every card, the workflow hero, the
header back-button, and the empty-state — it's the closest thing CloakPDF
has to a brand mark beyond the wordmark.

# Tone

The product voice is plain-spoken and slightly dry. Eyebrows are
domain-flat ("Workflows", "How it works", "Part of") rather than punchy
marketing. Tool descriptions are single-sentence imperatives ("Combine
multiple PDF files into one document"). Buttons say what they do
("Apply Signature & Download", "Process PDF") and never invent verbs.
The italic serif accent is the only place the tone _softens_; everywhere
else the copy is short and accurate.

# Dark mode

Dark mode is `prefers-color-scheme: dark` only — there is no toggle. The
page shifts to `#0F172A → #060912` (with the aurora swapping to `screen`
blend so the blobs glow rather than tint), surfaces become `#1E293B`,
borders pick up a white-alpha edge, and primary text is `slate-100`. Every
component recipe carries its dark counterpart inline; the only dark-only
custom token is `--aurora-blend: screen`. The grain layer doubles its
opacity in dark mode (4.5% → 8%) and switches to `overlay` blend to retain
texture on the deeper backdrop.

# Accessibility

Focus is always visible: form controls move to a `primary-300` border with a
soft outer halo; cards and thumbnails get a `2 px` `primary-500` ring with
`2 px` offset; the search input adds a soft primary blur. Touch targets are
≥ 36 px on mobile and `touch-action: manipulation` is set on every
spotlight-tracking surface so the browser doesn't double-tap-zoom on
deliberate taps. All ambient motion (aurora, attention pulses, popover
fades) collapses to static under `prefers-reduced-motion: reduce`.

# Anti-patterns

What CloakPDF deliberately avoids:

- **Per-feature accent colours.** Every tool used to have its own hue
  (organise/blue, transform/violet, annotate/emerald, security/amber).
  Pulled in favour of a single calmer accent — kept the per-category
  metadata so call-sites don't need edits, but every key resolves to
  primary blue.
- **Heavy shadows or glassmorphism beyond the header / dialog / footer
  bento.** Most surfaces are flat with a hairline border; lift comes
  from `transform`, not `box-shadow`.
- **Scaling buttons on hover.** CTAs only `transition-colors`. We don't
  want the button to feel like it's escaping the cursor.
- **Decorative iconography.** Icons either occupy a 44 px tile or sit
  inline with text at the same height as the cap. There are no purely
  ornamental glyphs.
- **More than one display-italic phrase per screen.** The serif accent is a
  punctuation device; using it twice dilutes it to a font choice.
- **Document-level scrollbar styling.** Only modal / card overflow areas
  get the thin slate scrollbar; the page itself uses the browser's
  default so users can find their orientation in long tools.
