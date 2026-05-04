// build-og-image.mjs — Renders public/icons/og-image.png by loading
// scripts/og-image.html in headless Chrome (via puppeteer-core +
// the user's local Chrome install) and screenshotting the 1200 × 630
// stage. The HTML mounts the same Grainient shader the live app uses,
// so the OG card carries the real backdrop instead of a faked-static
// approximation.
//
// ─── Usage ──────────────────────────────────────────────────────
//
//   node scripts/build-og-image.mjs
//
// On first run the Open Graph PNG is regenerated in ~5 s (warm Chrome
// + warm esm.sh cache). Cold runs may take ~10 s while ogl downloads.
//
// puppeteer-core is bundle-only: it doesn't ship Chromium itself, so
// we pass the path to /Applications/Google Chrome.app. If Chrome lives
// elsewhere set CHROME_PATH=/path/to/chrome to override.
//
// ─── Reusing this script in other Cloak apps ────────────────────
//
// This script is brand-agnostic — it just screenshots whatever
// `scripts/og-image.html` renders. To port to CloakIMG / CloakResume:
//
//   1. Copy this file + scripts/og-image.html into the target repo
//      (preserving the same path).
//   2. Add `puppeteer-core` as a devDependency:
//        vp add -D puppeteer-core   (or `pnpm add -D puppeteer-core`)
//   3. Edit scripts/og-image.html — see the "Reusing in other Cloak
//      apps" docblock at the top of that file for the exact swaps
//      (palette, foreground SVG, motion params).
//   4. Run `node scripts/build-og-image.mjs`. The output lands at
//      public/icons/og-image.png — the path expected by the
//      <meta og:image> tag in each Cloak app's index.html.
//
// Nothing in this driver is brand-specific; everything that varies
// between apps lives in og-image.html.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import puppeteer from "puppeteer-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = resolve(__dirname, "og-image.html");
const OUT_PATH = resolve(__dirname, "..", "public", "icons", "og-image.png");

const DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromePath = process.env.CHROME_PATH || DEFAULT_CHROME;

if (!existsSync(chromePath)) {
  console.error(`Chrome not found at ${chromePath}.`);
  console.error("Set CHROME_PATH=/absolute/path/to/chrome and re-run.");
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: chromePath,
  // "shell" headless mode disables WebGL on modern Chrome. The new
  // headless ("headless: 'new'" in Puppeteer 21+, true by default in
  // 22+) keeps Chrome's full graphics stack and can run WebGL2 via
  // SwiftShader (software ANGLE backend) without a display.
  headless: true,
  // The OG card is rendered at 1200 × 630 so the viewport matches the
  // stage. deviceScaleFactor: 2 gives a 2× pixel-density screenshot,
  // which is what social cards downsample from for crisp text.
  defaultViewport: { width: 1200, height: 630, deviceScaleFactor: 2 },
  args: [
    // ANGLE → SwiftShader is the only WebGL backend that works in
    // headless Chrome on macOS without a real GPU surface. The
    // unsafe-swiftshader flag opts back into SwiftShader after Chrome
    // started restricting it for security; for a local build script
    // that's fine.
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
  ],
});

try {
  const page = await browser.newPage();
  // Surface page-side errors so a broken HTML/shader doesn't just look
  // like a silent timeout. Console warnings (the SwiftShader GPU-stall
  // chatter is expected and noisy) are intentionally not forwarded.
  page.on("pageerror", (err) => console.error(`[page error] ${err.message}`));
  page.on("requestfailed", (req) =>
    console.error(`[req failed] ${req.url()} — ${req.failure()?.errorText ?? "?"}`),
  );
  await page.goto(`file://${HTML_PATH}`, { waitUntil: "networkidle0" });

  // Wait for the Grainient module to finish its first render and set
  // the readiness flag. 5 s budget is generous — esm.sh fetches `ogl`
  // on cold cache; warm runs complete in ~200 ms.
  await page.waitForFunction(() => window.__grainientReady === true, { timeout: 5000 });

  // One extra animation frame so the canvas pixels are guaranteed
  // present in the compositor before we capture.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );

  const stage = await page.$("#stage");
  if (!stage) throw new Error("Stage element missing");

  await stage.screenshot({ path: OUT_PATH, type: "png", omitBackground: false });
  console.log(`Wrote ${OUT_PATH}`);
} finally {
  await browser.close();
}
