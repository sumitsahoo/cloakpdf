# Open Graph Image — Build Pipeline

A reusable recipe for generating each Cloak app's Open Graph / Twitter
card PNG by screenshotting the **real** `Grainient` shader output
(rather than faking it with static SVG). The same two-file pipeline
drops into any Cloak repo (CloakIMG, CloakPDF, CloakResume,
CloakYard, …) — change four things per brand (palette, motion params,
tone-down opacity, foreground SVG), run one command, ship the PNG.

This spec is self-contained — drop it (and the two scripts referenced
below) into any Cloak repo, swap the brand bits, and you have a
production OG card in minutes.

---

## 1. Why a build script?

The page backdrop is a WebGL2 fragment shader (`<Grainient />`) that
warps three colour stops with a sine field and tops the result with
film grain. The shader is procedural — it cannot be expressed
declaratively in static SVG. Three options exist:

| Approach                              | Output fidelity | Trade-off                           |
| ------------------------------------- | --------------- | ----------------------------------- |
| Static SVG with `feTurbulence` grain  | Approximation   | Drifts from the live page.          |
| Hand-curated PNG export from the app  | Exact           | Tedious, easy to forget to refresh. |
| **Headless Chrome screenshot** (this) | Exact           | One command; reproducible; in CI.   |

The pipeline runs the same shader in headless Chrome at
`1200 × 630` (the dimensions Open Graph + Twitter cards expect),
pins shader time to a fixed value so renders are reproducible, and
saves the result alongside the brand's foreground SVG.

---

## 2. Files

```
scripts/
├── og-image.html        ← stage: Grainient backdrop + tone-down + foreground SVG
└── build-og-image.mjs   ← driver: launches Chrome, screenshots stage
public/icons/
└── og-image.png         ← output (committed)
```

The stage in `og-image.html` is three layered DOM elements:

| z-index | Element             | What it does                                                                |
| ------- | ------------------- | --------------------------------------------------------------------------- |
| 0       | `#grainient-host`   | Canvas; the live Grainient shader paints here.                              |
| 1       | `#tone-down`        | Flat white wash at fixed opacity. Softens the shader output for static use. |
| 2       | `#foreground` (SVG) | Brand mark, wordmark, tagline, feature tiles, footer cluster.               |

Header docblocks inside each script duplicate this spec at the file
level — keep them in sync if you change the recipe.

---

## 3. Prerequisites

- **Node** 18+ (the script uses top-level `await` and `node:` URL imports).
- **Google Chrome** installed locally. Default path is
  `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
  (macOS). Override with `CHROME_PATH=/absolute/path/to/chrome`.
- **`puppeteer-core` devDependency.** Bundle-only; doesn't ship Chromium
  itself — that's why we point it at the local Chrome:

  ```bash
  vp add -D puppeteer-core    # or `pnpm add -D puppeteer-core`
  ```

The `ogl` runtime dependency that the live `<Grainient />` component
already requires is **not** needed by the build script — `og-image.html`
imports `ogl` from `esm.sh` at render time. No Node-side WebGL stack
required.

---

## 4. Running the build

```bash
node scripts/build-og-image.mjs
```

Cold runs take ~10 s (Chrome launch + `esm.sh` cold-cache fetch of
`ogl`); warm runs complete in ~5 s. The script writes
`public/icons/og-image.png` — the path each Cloak app's
`<meta og:image>` already references in `index.html`.

Add an npm script if you want a shorter alias (optional):

```jsonc
// package.json
{
  "scripts": {
    "og:build": "node scripts/build-og-image.mjs",
  },
}
```

Then run with `vp run og:build`.

---

## 5. Porting to another Cloak app

The driver (`build-og-image.mjs`) is brand-agnostic. Everything
brand-specific lives in `og-image.html`. Four swaps:

### 5.1 Palette

Inside the `<script type="module">` block in `og-image.html`:

```js
// Mirror your app's GRAINIENT_LIGHT export.
const PALETTE = {
  color1: "#DBEAFE", // pale flank
  color2: "#3B82F6", // brand ribbon (the chromatic anchor)
  color3: "#EFF4FF", // lighter pale flank
};
```

Use the **light** palette regardless of the viewer's preference —
social platforms cache one PNG and most card surfaces composite it
on a light surface. If you've already standardised on
`GRAINIENT_LIGHT` in your `src/config/grainient.ts` (or
`src/constants/grainient.ts` for older projects), copy those exact
hex values across.

### 5.2 Motion params

Same script block, just below the palette:

```js
const PARAMS = {
  // ... defaults from <Grainient /> Props ...
  timeSpeed: 0.3, // ← your GRAINIENT_MOTION.timeSpeed
  warpSpeed: 3.0, // ← your GRAINIENT_MOTION.warpSpeed
  saturation: 0.3, // ← your GRAINIENT_MOTION.saturation
  // ... rest stay at Grainient defaults ...
};
```

**Mirror your live `<Grainient … />` mount-site exactly** — same
`timeSpeed`, `warpSpeed`, `saturation`, etc. **Don't** lower
`saturation` or `contrast` here to soften the OG card; that's what
the tone-down overlay (§5.3) is for. Keeping `PARAMS` in lockstep
with `GRAINIENT_MOTION` means a future change to the live config
lands in the OG card automatically without a separate calibration
pass.

### 5.3 Tone-down overlay

The static card needs to read on a wider range of host surfaces
(Slack, Twitter, link previews, embedded cards) than the live page,
so the shader output is dampened by a flat white wash sitting between
the canvas and the foreground SVG. Single CSS rule in `og-image.html`:

```css
#tone-down {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: #ffffff;
  opacity: 0.35; /* ← the only knob */
  pointer-events: none;
}
```

The `opacity` value is the per-brand dial. Adjust by feel:

| Opacity | Effect                                                     |
| ------- | ---------------------------------------------------------- |
| `0.20`  | Louder — ribbon stays vivid, more like the live page.      |
| `0.35`  | Balanced default — ribbon present but not dominant.        |
| `0.45`  | Quieter — ribbon barely tints the field.                   |
| `> 0.5` | Field washes toward grey; the brand colour is mostly gone. |

Brands with already-pale `color2` (e.g. blue-300 instead of blue-500)
typically don't need this layer — set `opacity: 0` or drop the
element entirely. Brands with vivid coral / saturated greens
typically want `opacity: 0.40`+ to keep the static card from
feeling shouty.

### 5.4 Foreground SVG

The `<svg id="foreground">` block contains the brand mark, wordmark,
tagline, feature tiles, "Part of Cloakyard" cluster, and URL chip.
Replace these per brand:

- **Brand mark** — paste your `favicon.svg` shapes inside the
  `<symbol id="brandmark" viewBox="0 0 144 144">` block. Keep the
  144-coord viewBox so the existing `<use width="96" height="96"/>`
  positioning still works.
- **Wordmark** — change `Cloak<tspan>PDF</tspan>` to your brand suffix.
  **Important:** keep the `Cloak` and `<tspan>` on a single line, or
  the formatter will break it across lines and SVG will render literal
  whitespace between the two words ("Cloak PDF" instead of "CloakPDF").
  A `<!-- prettier-ignore -->` comment above the `<text>` element
  prevents this.
- **Tagline + feature tiles** — replace the copy and the four
  Lucide-style icons inside each tile to reflect what your app does.
- **URL chip** — update the host (`pdf.cloakyard.com` →
  `<your-subdomain>.cloakyard.com`).

The viewBox stays `0 0 1200 630` regardless of brand.

---

## 6. How time-pinning makes renders reproducible

`og-image.html` sets `iTime = 12.0` once before screenshotting:

```js
program.uniforms.iTime.value = 12.0;
renderer.render({ scene: mesh });
```

The shader is deterministic for a given
`(iTime, iResolution, palette, params)` tuple, so re-running the
script always produces the same pixels. The committed
`og-image.png` only changes when you intentionally change palette,
params, or foreground content — no spurious git diffs from
animation-frame jitter.

If you want a different "frozen moment" of the gradient, change the
`iTime` value (any positive float works; values around 5–30 give the
most ribbon-like compositions).

---

## 7. Headless WebGL gotchas

The script passes a few non-obvious Chrome flags. Don't strip them
without understanding why:

| Flag                          | Why                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `--use-angle=swiftshader`     | Software ANGLE backend — only WebGL2 path that works in headless Chrome on macOS without a real GPU surface. |
| `--enable-unsafe-swiftshader` | Chrome restricts SwiftShader by default; this opts in for local builds.                                      |
| `--enable-webgl`              | Belt-and-suspenders; explicit even though it's default.                                                      |
| `--ignore-gpu-blocklist`      | SwiftShader is on Chrome's blocklist on some macOS versions.                                                 |

Headless mode is `headless: true` (the new headless, default in
Puppeteer 22+). The legacy "shell" headless mode disables WebGL
entirely.

You'll see a few `GPU stall due to ReadPixels` warnings during the
screenshot — that's SwiftShader being honest about a software readback
and is harmless for a one-shot render.

---

## 8. Visual checklist

Before committing a regenerated `og-image.png`:

- [ ] Brand mark, wordmark, tagline read sharply at 600 × 315 (the
      smallest size most platforms show).
- [ ] No literal whitespace inside compound wordmarks (the
      `Cloak<tspan>PDF</tspan>` foot-gun above).
- [ ] Backdrop reads as a softened version of the live page's
      Grainient — same ribbon direction, same grain density, but the
      brand colour shouldn't dominate. If it does, bump
      `#tone-down { opacity }` (§5.3); if the field looks washed out,
      drop it.
- [ ] No console errors during `node scripts/build-og-image.mjs` —
      `[page error]` lines indicate a broken HTML/shader, not a
      cosmetic issue.
- [ ] PNG file size is reasonable (< 1.5 MB). Anything larger usually
      means something went wrong with the canvas backing store.

---

## 9. CI integration (optional)

The script works in GitHub Actions runners that have Chrome
preinstalled (e.g. `ubuntu-latest`). Replace `CHROME_PATH` with the
runner's Chrome binary:

```yaml
- run: CHROME_PATH=$(which google-chrome) node scripts/build-og-image.mjs
- run: |
    if ! git diff --quiet public/icons/og-image.png; then
      echo "::warning::og-image.png is stale — re-run scripts/build-og-image.mjs locally and commit."
      exit 1
    fi
```

This catches drift between the live `<Grainient />` config and the
committed PNG without forcing the script to run on every PR.
