/**
 * End-to-end smoke test for the AI tools.
 *
 * This is the only test that can answer "does the model actually
 * work?" — everything else runs in Node, with the LLM mocked. Here we
 * drive a real browser, let it download the Qwen weights, and assert
 * the chat tool produces a non-degenerate reply.
 *
 * ## Requirements
 *
 *   - Chrome or Chromium installed locally (puppeteer-core is in
 *     devDependencies; the full puppeteer package is NOT, so we don't
 *     bundle our own browser).
 *   - The dev server reachable at http://localhost:5173. Start it with
 *     `vp dev` in another terminal before running this script.
 *   - A PDF dropped at `tests/fixtures/sample.pdf` (see the README in
 *     that folder).
 *
 * ## Run it
 *
 *   pnpm test:e2e
 *
 * The first run downloads ~530 MB of model weights into the browser's
 * CacheStorage and may take several minutes. Subsequent runs reuse
 * the cache and complete in a few seconds.
 *
 * ## Caveats
 *
 *   - This is a *smoke* test — it asserts the model loaded and
 *     produced *some* output, not that the output is correct. Output
 *     quality is a human-judgement call and lives outside automated
 *     testing.
 *   - The tool now loads a single chat model and an embedder together;
 *     there is no tier picker to bypass.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { launch } from "puppeteer-core";

const FIXTURE_PATH = resolve(import.meta.dirname, "../fixtures/sample.pdf");
const DEV_URL = process.env.E2E_URL ?? "http://localhost:5173";
// puppeteer-core needs an explicit browser binary. Default to the
// stock macOS Chrome path; override with CHROME_PATH=/path/to/chrome
// when running on Linux/Windows or with a different channel.
const CHROME_PATH =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function bail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!existsSync(FIXTURE_PATH)) {
  bail(
    `No sample PDF at ${FIXTURE_PATH}. See tests/fixtures/README.md — drop any short text-based PDF there as sample.pdf.`,
  );
}

if (!existsSync(CHROME_PATH)) {
  bail(
    `Chrome binary not found at ${CHROME_PATH}. Set CHROME_PATH=/path/to/chrome to point at your install.`,
  );
}

/**
 * Persistent profile dir so a second `pnpm test:e2e` run lands on a
 * warm cache (CacheStorage + localStorage flags + IndexedDB). That's
 * the exact scenario where "stuck at Preparing" used to manifest.
 *
 *   - `E2E_FRESH=1 pnpm test:e2e`   → wipe profile, exercise cold path.
 *   - `pnpm test:e2e` (default)     → reuse profile, exercise warm path.
 */
const USER_DATA_DIR =
  process.env.E2E_USER_DATA_DIR ?? resolve(import.meta.dirname, "../.puppeteer-profile");

async function main() {
  if (process.env.E2E_FRESH === "1") {
    const { rm } = await import("node:fs/promises");
    await rm(USER_DATA_DIR, { recursive: true, force: true });
    console.log("→ Cleared persistent profile (E2E_FRESH=1).");
  }
  console.log(`→ Launching Chrome (profile: ${USER_DATA_DIR})…`);
  const browser = await launch({
    executablePath: CHROME_PATH,
    userDataDir: USER_DATA_DIR,
    // Headed so the user can watch the download progress dialog —
    // unattended CI usage would flip this to true.
    headless: false,
    defaultViewport: { width: 1280, height: 900 },
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60_000);

    // Surface browser-side errors to the Node test runner. Without
    // this, a runtime exception in the React tree (e.g. a bad
    // dynamic import) is invisible — the test just times out waiting
    // for a composer that never appears.
    page.on("console", (msg) => {
      const t = msg.type();
      if (t === "error" || t === "warn") {
        console.log(`[browser ${t}]`, msg.text());
      }
    });
    page.on("pageerror", (err) => {
      console.log("[browser pageerror]", err instanceof Error ? err.message : String(err));
    });
    page.on("requestfailed", (req) => {
      console.log("[browser requestfailed]", req.url(), req.failure()?.errorText);
    });

    await page.goto(DEV_URL, { waitUntil: "networkidle2" });

    console.log("→ Opening Ask PDF…");
    await page.goto(`${DEV_URL}/#/tools/ask-pdf`, { waitUntil: "networkidle2" }).catch(() => {
      // App may not use hash routing — fall back to the tool grid.
    });

    // Find the "Ask your PDF" card and click it if the hash-route
    // didn't take us straight in. We match the visible card title.
    const cardClicked = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll("a, button"));
      const target = cards.find((el) => el.textContent?.includes("Ask your PDF"));
      if (target instanceof HTMLElement) {
        target.click();
        return true;
      }
      return false;
    });
    if (!cardClicked) {
      console.warn("⚠ Couldn't auto-navigate to Ask PDF — open it manually in the browser window.");
    }

    // Upload the fixture. The drop zone renders an <input type="file">.
    console.log("→ Uploading fixture PDF…");
    const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 10_000 });
    if (!fileInput) bail("File input not found on the page.");
    await (fileInput as { uploadFile: (...p: string[]) => Promise<void> }).uploadFile(FIXTURE_PATH);

    // Click the gate's "Download model" button. On a first-run profile
    // (no localStorage cache flag) the gate sits at "Selected … Download
    // model" until the user clicks. On a returning profile the gate
    // auto-loads and the button is gone — we treat its absence as
    // "already started" and move on.
    console.log("→ Clicking the gate's Download button if present…");
    await page
      .waitForFunction(
        () => {
          const buttons = Array.from(document.querySelectorAll("button"));
          return buttons.some((b) => (b.textContent ?? "").trim().startsWith("Download model"));
        },
        { timeout: 10_000 },
      )
      .catch(() => undefined);
    const gateClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const dl = buttons.find((b) => (b.textContent ?? "").trim().startsWith("Download model"));
      if (dl instanceof HTMLButtonElement) {
        dl.click();
        return true;
      }
      return false;
    });
    console.log(gateClicked ? "  ✓ clicked gate Download" : "  · gate already past Download");

    // The consent dialog has its own "Download model" button. On first
    // use it pops up after the gate click; on returning profiles it's
    // skipped automatically. Wait briefly and click if present.
    await page
      .waitForFunction(
        () => {
          const dialog = document.querySelector('[role="dialog"]');
          if (!dialog) return false;
          const buttons = Array.from(dialog.querySelectorAll("button"));
          return buttons.some((b) => (b.textContent ?? "").trim() === "Download model");
        },
        { timeout: 8_000 },
      )
      .catch(() => undefined);
    const consentClicked = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return false;
      const buttons = Array.from(dialog.querySelectorAll("button"));
      const dl = buttons.find((b) => (b.textContent ?? "").trim() === "Download model");
      if (dl instanceof HTMLButtonElement) {
        dl.click();
        return true;
      }
      return false;
    });
    console.log(consentClicked ? "  ✓ clicked consent Download" : "  · no consent dialog");

    console.log("→ Waiting for model to load + index (first run downloads ~275 MB)…");
    await page
      .waitForFunction(
        () => {
          const composer = document.querySelector("textarea");
          return composer instanceof HTMLTextAreaElement && !composer.disabled;
        },
        { timeout: 10 * 60 * 1000 }, // 10 minutes for cold-cache first run
      )
      .catch(() => bail("Composer never enabled — model load timed out or failed."));

    console.log("→ Asking a question…");
    // Snapshot the bubble count BEFORE we send. Each turn renders a
    // wrapper element with `data-bubble="user|assistant"`; the count
    // increments once on user-send and again when the assistant
    // appears. We wait for `prev + 2` so we don't accidentally capture
    // the user's own message as the assistant reply. The data
    // attribute is a stable test hook — switching the inner rendering
    // (e.g. plain `<p>` → react-markdown) doesn't change it.
    const priorBubbleCount = await page.evaluate(
      () => document.querySelectorAll("[data-bubble]").length,
    );
    await page.focus("textarea");
    await page.keyboard.type("What is this document about?");
    await page.keyboard.press("Enter");

    // Wait for the assistant turn's streaming to finish. We detect
    // "done" by the bubble's `data-streaming` attribute flipping to
    // "false" — the markdown rewrite means `.animate-pulse` is no
    // longer reliably inside the last `<p>` and a class-name probe
    // would silently fall through.
    await page.waitForFunction(
      (prev) => {
        const bubbles = document.querySelectorAll("[data-bubble]");
        if (bubbles.length < prev + 2) return false;
        const lastBubble = bubbles[bubbles.length - 1];
        if (lastBubble.getAttribute("data-streaming") === "true") return false;
        return (lastBubble.textContent ?? "").trim().length > 0;
      },
      { timeout: 5 * 60 * 1000 },
      priorBubbleCount,
    );

    const reply = await page.evaluate(() => {
      const bubbles = document.querySelectorAll('[data-bubble="assistant"]');
      return bubbles[bubbles.length - 1]?.textContent?.trim() ?? "";
    });

    console.log("\n──────── assistant reply ────────");
    console.log(reply);
    console.log("─────────────────────────────────\n");

    // ── Warm-cache pass ──────────────────────────────────────────
    // Reload the same page. localStorage now has the "model marked
    // ready" flags from the first pass; CacheStorage has the weights.
    // This is the exact scenario the user reported getting stuck on
    // ("Preparing…" forever). The fix is the symmetric auto-load in
    // useRagModels — both models start loading from disk without any
    // button click. We assert the composer comes back online.
    console.log("\n→ Reloading to simulate warm-cache return visit…");
    await page.reload({ waitUntil: "networkidle2" });
    const cardClickedAgain = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll("a, button"));
      const target = cards.find((el) => el.textContent?.includes("Ask your PDF"));
      if (target instanceof HTMLElement) {
        target.click();
        return true;
      }
      return false;
    });
    if (!cardClickedAgain) {
      console.warn("⚠ Couldn't re-navigate to Ask PDF after reload.");
    }
    console.log("→ Re-uploading fixture…");
    const fileInput2 = await page.waitForSelector('input[type="file"]', { timeout: 10_000 });
    if (!fileInput2) bail("File input not found after reload.");
    await (fileInput2 as { uploadFile: (...p: string[]) => Promise<void> }).uploadFile(
      FIXTURE_PATH,
    );
    console.log("→ Waiting for warm-cache auto-load to enable composer (no clicks)…");
    await page
      .waitForFunction(
        () => {
          const composer = document.querySelector("textarea");
          return composer instanceof HTMLTextAreaElement && !composer.disabled;
        },
        { timeout: 90_000 }, // warm cache: at most ~minute to rehydrate + index
      )
      .catch(() =>
        bail(
          "Warm-cache composer never enabled — the 'Preparing…' stuck-state regression has returned.",
        ),
      );
    console.log("  ✓ composer enabled on warm-cache path");

    // Drive an actual question through the warm-cache path. The
    // earlier symptom-only check just verifies the composer enables;
    // here we prove the full retrieve → generate pipeline still works
    // after the page reload that wiped in-memory pipelines.
    console.log("→ Asking a question on the warm-cache path…");
    const priorWarmBubbleCount = await page.evaluate(
      () => document.querySelectorAll("[data-bubble]").length,
    );
    await page.focus("textarea");
    await page.keyboard.type("What does the document discuss?");
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      (prev) => {
        const bubbles = document.querySelectorAll("[data-bubble]");
        if (bubbles.length < prev + 2) return false;
        const lastBubble = bubbles[bubbles.length - 1];
        if (lastBubble.getAttribute("data-streaming") === "true") return false;
        return (lastBubble.textContent ?? "").trim().length > 0;
      },
      { timeout: 5 * 60 * 1000 },
      priorWarmBubbleCount,
    );
    const warmReply = await page.evaluate(() => {
      const bubbles = document.querySelectorAll('[data-bubble="assistant"]');
      return bubbles[bubbles.length - 1]?.textContent?.trim() ?? "";
    });
    console.log("\n──────── warm-cache assistant reply ────────");
    console.log(warmReply);
    console.log("────────────────────────────────────────────\n");
    if (!warmReply) bail("Warm-cache: assistant returned an empty reply.");
    if (/^[! ]{20,}$/.test(warmReply)) bail("Warm-cache: degenerate token loop.");
    const warmLines = warmReply.split("\n").map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim());
    const warmCounts = new Map<string, number>();
    for (const line of warmLines) {
      if (line.length < 8) continue;
      warmCounts.set(line, (warmCounts.get(line) ?? 0) + 1);
    }
    const warmValues = [...warmCounts.values()];
    const warmWorst = warmValues.length === 0 ? 0 : Math.max(...warmValues);
    if (warmWorst >= 5) {
      bail(`Warm-cache: assistant looped — same line ${warmWorst}× in the reply.`);
    }
    console.log("  ✓ warm-cache reply non-empty, no loop");

    // Smoke assertions tuned to the failure modes we've actually hit:
    //
    //   - Empty reply (model didn't speak).
    //   - Single-token blast like "!!!!!!" — broken quantization.
    //   - **Paraphrased loop** — same line repeated 5+ times with only
    //     a numbered prefix changing. Caught the SmolLM2 "1. An API
    //     related to X / 2. An API related to X / …" failure that
    //     slipped past the simpler heuristics.
    if (!reply) bail("Assistant returned an empty reply.");
    if (/^[! ]{20,}$/.test(reply)) bail("Assistant returned a degenerate token loop.");
    const lines = reply.split("\n").map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim());
    const lineCounts = new Map<string, number>();
    for (const line of lines) {
      if (line.length < 8) continue;
      lineCounts.set(line, (lineCounts.get(line) ?? 0) + 1);
    }
    const counts = [...lineCounts.values()];
    const worstRepeat = counts.length === 0 ? 0 : Math.max(...counts);
    if (worstRepeat >= 5) {
      bail(`Assistant looped — same line repeated ${worstRepeat}× in the reply.`);
    }

    console.log("✓ AI chat smoke test passed.");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
