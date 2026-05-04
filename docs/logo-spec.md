# Cloak Family — Brand Logo Spec

A reusable specification for the shield-based logo used across the
Cloak family of apps (CloakIMG, CloakPDF, CloakResume, CloakYard, …).
The shield is the constant — it carries the family identity. Each
brand customises three things: the **background gradient**, the
**inner glyph**, and the **wordmark suffix** (e.g. `IMG`, `PDF`,
`Resume`).

This spec is self-contained — drop it (and the SVG template at the
end) into any Cloak repo and you can produce a launcher-quality logo
in minutes.

---

## 1. Anatomy

```
┌─────────────────────────┐
│   ░░░░░ background ░░░  │  ← full-bleed gradient (brand colour)
│         ▼ shield        │
│      ┌─◢◢◢◢◢◢─┐         │
│      │   ☼   │          │  ← inner glyph (brand-specific)
│      │  /\/\ │          │
│      └──────┘           │
│                         │
└─────────────────────────┘
```

Three layers, painted in this order:

1. **Background** — full-bleed rectangle filled with the brand
   gradient. Critical for maskable PWA icons: the OS launcher mask
   crops the corners, so anything transparent at the edge becomes
   wasted real estate.
2. **Bloom** — a subtle off-centre radial highlight (white at low
   opacity, fading to transparent) that lifts the gradient and adds a
   soft "lit-from-above" feel.
3. **Shield + inner glyph** — the constant Cloak silhouette plus a
   brand-specific glyph that lives inside it.

---

## 2. Coordinate system

- **viewBox**: `0 0 144 144` (legacy; matches older Cloak assets so
  paths stay portable). Renders to any size — set
  `width="100%" height="100%"` on the root `<svg>`.
- **Centre**: `(72, 72)`.
- **Shield path** (canonical, do not edit):

  ```
  M72,30 L38,44 L38,76
  C38,93.333 49.333,107.333 72,118
  C94.667,107.333 106,93.333 106,76
  L106,44 L72,30 Z
  ```

  Bounds in raw form: `x: 38–106`, `y: 30–118`.

- **Shield scale**: `1.1` around `(72, 72)`. Achieved with a single
  transform — do not edit the path:

  ```xml
  <g transform="translate(72 72) scale(1.1) translate(-72 -72)">
    …shield + inner glyph here…
  </g>
  ```

  This puts the shield bounds at:
  - `y: 25.8 → 122.6` (≈ 18 % top / 15 % bottom margin)
  - `x: 34.6 → 109.4` (≈ 24 % side margin)

  Comfortably inside the maskable safe zone (see §6) without feeling
  small. Don't push above 1.15 — the shield's tip starts to clip on
  circular launcher masks.

---

## 3. Brand colour slots

Each brand fills these slots. Pick warm gradients (lighter →
darker) so the bloom highlight reads naturally.

| Slot            | Format          | Notes                                          |
| --------------- | --------------- | ---------------------------------------------- |
| `bg-from`       | `rgb(R,G,B)`    | Top stop of the background gradient (lighter). |
| `bg-to`         | `rgb(R,G,B)`    | Bottom stop (darker, ~30 % luminance below).   |
| `bloom-color`   | `white`         | Constant — keep white for a sun-like lift.     |
| `bloom-cx/cy`   | `(72, 55)`      | Default — slightly above centre.               |
| `shield-fill`   | `white`, `0.18` | Constant across all brands.                    |
| `shield-stroke` | `white`, `0.55` | Constant. Width `3`.                           |
| `glyph-color`   | `white`         | Constant. Use opacity to layer if needed.      |

### Reference palettes

| Brand       | `bg-from`         | `bg-to`          | Notes                                                                         |
| ----------- | ----------------- | ---------------- | ----------------------------------------------------------------------------- |
| CloakIMG    | `rgb(251,146,60)` | `rgb(194,65,12)` | Sunset coral                                                                  |
| CloakPDF    | `rgb(59,130,246)` | `rgb(29,78,216)` | Ocean blue (Tailwind blue-500 → blue-700) — matches the app's `--brand`.      |
| CloakResume | _TBD_             | _TBD_            | Existing brand uses ocean blue — match the app's `--brand`.                   |
| CloakYard   | _TBD_             | _TBD_            | Use the existing multi-stop green→indigo→orange if matching the current logo. |

When picking new gradients: stay inside one hue family (don't cross
from warm to cool within a single mark), keep ≥ 30 % luminance gap
between the stops, and verify the white shield + glyph still hit
≥ 4.5:1 contrast against the midpoint colour.

---

## 4. Inner glyph

The glyph is the only piece that visually distinguishes one Cloak
app from another. It lives **inside the shield silhouette**, clipped
to the shield path so any overshoot is hidden.

Constraints:

- **Stroke-only or filled-white silhouettes** — no extra colour.
  Keeps the family coherent; the gradient does the colour work.
- **Stroke width** ≈ `5` (in raw 144 coords; the parent transform
  scales it). `stroke-linecap="round"` and `stroke-linejoin="round"`
  on every stroked path — sharp corners read as harsh at small icon
  sizes.
- **Stay above the shield's chin** — keep glyph elements inside the
  region `y: 40–105` so the shield's bottom point and shoulders read
  cleanly.
- **One concept per glyph.** Pictograms only. Avoid letters or fine
  detail — they vanish at 32 px.

### Existing glyphs (for reference)

| Brand       | Glyph                                                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| CloakIMG    | Sun (filled circle) + mountain peaks (zig-zag stroke).                                                            |
| CloakPDF    | Three horizontal "redacted" lines (decreasing in length and opacity), evoking a partially-redacted document page. |
| CloakResume | _Suggested_: Lined "card" silhouette with a tag/ribbon.                                                           |
| CloakYard   | _Suggested_: Stacked layers / boxes silhouette.                                                                   |

Glyph paths are clipped to the shield via `clip-path="url(#shieldClip)"`.
The clip element re-uses the shield path:

```xml
<clipPath id="shieldClip">
  <path d="…same shield path as #shield…"/>
</clipPath>
```

---

## 5. SVG template

Drop this into `public/icons/logo.svg` (or your project's equivalent),
fill in the colour stops, and replace the inner-glyph block.

```xml
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="100%" height="100%" viewBox="0 0 144 144"
     role="img" aria-label="<BRAND>"
     style="fill-rule:evenodd;clip-rule:evenodd;">
    <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="<BG_FROM>"/>
            <stop offset="1" stop-color="<BG_TO>"/>
        </linearGradient>
        <radialGradient id="bloom" gradientUnits="userSpaceOnUse" cx="72" cy="55" r="100">
            <stop offset="0" stop-color="white" stop-opacity="0.3"/>
            <stop offset="1" stop-color="white" stop-opacity="0"/>
        </radialGradient>
        <!-- Canonical Cloak shield path. Do not edit. -->
        <path id="shield" d="M72,30L38,44L38,76C38,93.333 49.333,107.333 72,118C94.667,107.333 106,93.333 106,76L106,44L72,30Z"/>
        <clipPath id="shieldClip">
            <path d="M72,30L38,44L38,76C38,93.333 49.333,107.333 72,118C94.667,107.333 106,93.333 106,76L106,44L72,30Z"/>
        </clipPath>
    </defs>

    <!-- Full-bleed background — keeps the OS mask from cropping into the brand. -->
    <rect width="144" height="144" fill="url(#bg)"/>
    <rect width="144" height="144" fill="url(#bloom)"/>

    <!-- Shield + inner glyph, scaled 1.1x around (72,72). -->
    <g transform="translate(72 72) scale(1.1) translate(-72 -72)">
        <use href="#shield" fill="white" fill-opacity="0.18"/>
        <use href="#shield" fill="none" stroke="white" stroke-opacity="0.55" stroke-width="3"/>
        <g clip-path="url(#shieldClip)">
            <!-- ───── Inner glyph block ───── -->
            <!-- Replace this with the brand's glyph. Authored in raw 144-coord
                 space. Stays inside y: 40–105 to clear the shield chin. -->
            <!-- e.g. CloakIMG: sun + mountains -->
            <circle cx="81" cy="53" r="5" fill="white"/>
            <g transform="matrix(0.962963,0,0,0.928571,1.703704,4.571429)">
                <path d="M46,92L60,70L72,84L86,64L100,92"
                      fill="none" stroke="white" stroke-width="5"
                      stroke-linecap="round" stroke-linejoin="round"/>
            </g>
            <!-- ───── /Inner glyph block ───── -->
        </g>
    </g>
</svg>
```

---

## 6. Maskable safe zone

PWA launchers (Android adaptive icons, iOS home-screen, Chrome
desktop install, etc.) overlay their own mask shape — circle on
some, squircle on others, rounded square on others. The W3C
maskable-icon spec defines a **safe zone**:

- The whole canvas is the **icon zone** (must be filled, no
  transparent edges). Our full-bleed background `<rect>` covers this.
- The central **80 %** of the canvas is the **safe zone** —
  everything important must fit inside it. With our `scale(1.1)`
  shield, the bounds (`y: 25.8–122.6`, `x: 34.6–109.4`) sit
  comfortably inside the 80 % circle inscribed at canvas centre.

Do not push the shield scale above ~1.15 if you want it to survive
all launcher masks intact.

---

## 7. PWA asset generation

The SVG is the master. Render PNGs at the four standard sizes plus
Apple's home-screen size. `rsvg-convert` is the simplest pipeline
(`brew install librsvg` on macOS):

```bash
cd public/icons
rsvg-convert -w 64  -h 64  logo.svg -o pwa-64x64.png
rsvg-convert -w 192 -h 192 logo.svg -o pwa-192x192.png
rsvg-convert -w 512 -h 512 logo.svg -o pwa-512x512.png
rsvg-convert -w 512 -h 512 logo.svg -o maskable-icon-512x512.png
rsvg-convert -w 180 -h 180 logo.svg -o apple-touch-icon.png
```

Or, if the project uses `@vite-pwa/assets-generator` (CloakIMG does):

```bash
npx pwa-assets-generator --preset minimal-2023 public/icons/logo.svg
mv public/icons/apple-touch-icon-180x180.png public/icons/apple-touch-icon.png
```

### Webmanifest entries

The `pwa-512x512.png` and `maskable-icon-512x512.png` come from the
**same source** intentionally — the full-bleed background means the
"any" purpose icon is already maskable-safe, and shipping it twice
lets the manifest declare both purposes:

```json
{
  "icons": [
    { "src": "icons/pwa-64x64.png", "sizes": "64x64", "type": "image/png" },
    { "src": "icons/pwa-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/pwa-512x512.png", "sizes": "512x512", "type": "image/png" },
    {
      "src": "icons/maskable-icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

### Favicon

The `favicon.svg` (browser tab) is **not** the same as `logo.svg`.
Browsers don't apply a launcher mask to the tab favicon, so the
inset-circle treatment (with breathing room around the circle) reads
better there. Keep both files; only `logo.svg` needs to be full-bleed.

---

## 8. Visual checklist

Before shipping a new brand's logo, eyeball it at every target size
and on every common mask shape:

- [ ] **32 px** — favicon size. Glyph still legible? No mush?
- [ ] **180 px circle mask** — inner glyph fully visible, shield tip
      clear of the edge.
- [ ] **512 px squircle mask** — corners of the gradient cropped, but
      no shield edge clipped.
- [ ] **Light + dark** OS themes — gradient still reads (saturated
      gradients lose contrast on dark wallpapers).
- [ ] **Glyph contrast** ≥ 4.5:1 against the gradient midpoint colour.
- [ ] **Adjacent to other Cloak apps** — does it sit in the family?
      The shield + bloom should make this automatic; if it doesn't,
      something's drifted.
