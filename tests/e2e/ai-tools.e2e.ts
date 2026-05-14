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

async function main() {
  console.log("→ Launching Chrome…");
  const browser = await launch({
    executablePath: CHROME_PATH,
    // Headed so the user can watch the download progress dialog —
    // unattended CI usage would flip this to true.
    headless: false,
    defaultViewport: { width: 1280, height: 900 },
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60_000);

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

    // The gate may auto-load if the model is already cached. If not,
    // click the "Download model" button. Either path lands us on a
    // ready composer.
    console.log("→ Waiting for model to load (first run downloads ~530 MB)…");
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
    await page.focus("textarea");
    await page.keyboard.type("What is this document about?");
    await page.keyboard.press("Enter");

    // Wait for the assistant turn's streaming indicator to clear.
    // We detect "done" by the absence of the .animate-pulse caret that
    // sits inside the in-flight assistant bubble.
    await page.waitForFunction(
      () => {
        const bubbles = document.querySelectorAll("p.whitespace-pre-wrap");
        if (bubbles.length < 2) return false;
        const lastBubble = bubbles[bubbles.length - 1];
        const stillStreaming = lastBubble.querySelector(".animate-pulse");
        return stillStreaming === null && (lastBubble.textContent ?? "").trim().length > 0;
      },
      { timeout: 5 * 60 * 1000 },
    );

    const reply = await page.evaluate(() => {
      const bubbles = document.querySelectorAll("p.whitespace-pre-wrap");
      return bubbles[bubbles.length - 1]?.textContent?.trim() ?? "";
    });

    console.log("\n──────── assistant reply ────────");
    console.log(reply);
    console.log("─────────────────────────────────\n");

    // Smoke assertions: the reply has content and isn't the degenerate
    // "!!!!!" token-loop failure mode we saw in the bad-quantization bug.
    if (!reply) bail("Assistant returned an empty reply.");
    if (/^[! ]{20,}$/.test(reply)) bail("Assistant returned a degenerate token loop.");

    console.log("✓ AI chat smoke test passed.");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
