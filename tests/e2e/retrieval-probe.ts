/**
 * Retrieval diagnostic — drives a real browser against the warm-cache
 * profile, sets the `cloakpdf:debug` localStorage flag, asks a handful
 * of questions, and dumps the per-retriever chunks (dense, sparse) plus
 * the fused result the LLM actually saw.
 *
 * The point is to answer one question quickly: when the assistant
 * hallucinates, is it because the retriever fed it the wrong chunks, or
 * because the model ignored the right ones?
 *
 *   pnpm exec tsx tests/e2e/retrieval-probe.ts
 *
 * Requirements:
 *   - dev server at http://localhost:5173 (`vp dev`)
 *   - PDF at tests/fixtures/sample.pdf
 *   - warm puppeteer profile at tests/.puppeteer-profile (run the
 *     full e2e once first to populate it, or set CHROME_PATH)
 *
 * Output is written to tests/retrieval-debug/<timestamp>.json and also
 * pretty-printed to stdout for at-a-glance review.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launch } from "puppeteer-core";

const FIXTURE_PATH = resolve(import.meta.dirname, "../fixtures/sample.pdf");
const DEV_URL = process.env.E2E_URL ?? "http://localhost:5173";
const CHROME_PATH =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const USER_DATA_DIR =
  process.env.E2E_USER_DATA_DIR ?? resolve(import.meta.dirname, "../.puppeteer-profile");
const OUTPUT_DIR = resolve(import.meta.dirname, "../retrieval-debug");

const QUESTIONS = [
  "What is this document about?",
  "What does the document discuss?",
  "Summarize the main responsibilities described in the document.",
  "What technologies or tools are mentioned in the document?",
];

interface HybridDebugRecord {
  query: string;
  dense: Array<{ chunkId: string; pageNumber: number; preview: string }>;
  sparse: Array<{ chunkId: string; pageNumber: number; preview: string }>;
}
interface RetrievalDebugRecord {
  question: string;
  hits: Array<{ chunkId: string; pageNumber: number; preview: string; length: number }>;
}

function bail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!existsSync(FIXTURE_PATH)) {
  bail(`No sample PDF at ${FIXTURE_PATH}.`);
}
if (!existsSync(CHROME_PATH)) {
  bail(`Chrome not found at ${CHROME_PATH}.`);
}

async function navigateToAskPdf(page: import("puppeteer-core").Page): Promise<void> {
  await page.goto(DEV_URL, { waitUntil: "networkidle2" });
  await page.goto(`${DEV_URL}/#/tools/ask-pdf`, { waitUntil: "networkidle2" }).catch(() => {});
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("a, button"));
    const target = cards.find((el) => el.textContent?.includes("Ask your PDF"));
    if (target instanceof HTMLElement) target.click();
  });
}

async function ensureComposerReady(page: import("puppeteer-core").Page): Promise<void> {
  const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 10_000 });
  if (!fileInput) bail("File input not found.");
  await (fileInput as { uploadFile: (...p: string[]) => Promise<void> }).uploadFile(FIXTURE_PATH);

  // Click any pending download/consent button — on a warm cache there
  // shouldn't be one, but we leave the click in for robustness.
  await page
    .waitForFunction(
      () => {
        const buttons = Array.from(document.querySelectorAll("button"));
        return buttons.some((b) => (b.textContent ?? "").trim().startsWith("Download model"));
      },
      { timeout: 5_000 },
    )
    .catch(() => undefined);
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const dl = buttons.find((b) => (b.textContent ?? "").trim().startsWith("Download model"));
    if (dl instanceof HTMLButtonElement) dl.click();
  });
  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return;
    const buttons = Array.from(dialog.querySelectorAll("button"));
    const dl = buttons.find((b) => (b.textContent ?? "").trim() === "Download model");
    if (dl instanceof HTMLButtonElement) dl.click();
  });

  await page.waitForFunction(
    () => {
      const composer = document.querySelector("textarea");
      return composer instanceof HTMLTextAreaElement && !composer.disabled;
    },
    { timeout: 10 * 60 * 1000 },
  );
}

async function askAndCapture(
  page: import("puppeteer-core").Page,
  question: string,
): Promise<{ reply: string }> {
  // Snapshot the bubble count BEFORE we send. Both user and assistant
  // turns render with `p.whitespace-pre-wrap`, so the count jumps by
  // ~2 per question: once when the user message renders, again when
  // the assistant's first token arrives. Without this snapshot the
  // wait below would fire on the user bubble and we'd capture the
  // user's own question text as the "reply".
  const priorBubbleCount = await page.evaluate(
    () => document.querySelectorAll("p.whitespace-pre-wrap").length,
  );

  await page.focus("textarea");
  // Clear any leftover text in the composer.
  await page.evaluate(() => {
    const ta = document.querySelector("textarea");
    if (ta instanceof HTMLTextAreaElement) ta.value = "";
  });
  await page.keyboard.type(question);
  await page.keyboard.press("Enter");

  // Wait for two new bubbles (user msg + assistant msg) AND the
  // assistant's streaming caret to clear AND non-empty content. The
  // `prev + 2` guard is what stops us from capturing the user bubble
  // as the assistant reply.
  await page.waitForFunction(
    (prev) => {
      const bubbles = document.querySelectorAll("p.whitespace-pre-wrap");
      if (bubbles.length < prev + 2) return false;
      const lastBubble = bubbles[bubbles.length - 1];
      const stillStreaming = lastBubble.querySelector(".animate-pulse");
      return stillStreaming === null && (lastBubble.textContent ?? "").trim().length > 0;
    },
    { timeout: 5 * 60 * 1000 },
    priorBubbleCount,
  );

  const reply = await page.evaluate(() => {
    const bubbles = document.querySelectorAll("p.whitespace-pre-wrap");
    return bubbles[bubbles.length - 1]?.textContent?.trim() ?? "";
  });
  return { reply };
}

async function main() {
  console.log(`→ Launching Chrome (profile: ${USER_DATA_DIR})…`);
  const browser = await launch({
    executablePath: CHROME_PATH,
    userDataDir: USER_DATA_DIR,
    headless: false,
    defaultViewport: { width: 1280, height: 900 },
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60_000);

    page.on("console", (msg) => {
      const t = msg.type();
      if (t === "error" || t === "warn") console.log(`[browser ${t}]`, msg.text());
    });
    page.on("pageerror", (err) => {
      console.log("[browser pageerror]", err instanceof Error ? err.message : String(err));
    });

    // Set the debug flag *before* the app boots so the retrieve hook
    // captures every query.
    await page.goto(DEV_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.setItem("cloakpdf:debug", "1"));

    await navigateToAskPdf(page);
    await ensureComposerReady(page);

    const results: Array<{
      question: string;
      reply: string;
      fused: RetrievalDebugRecord | undefined;
      perRetriever: HybridDebugRecord | undefined;
    }> = [];

    for (const question of QUESTIONS) {
      console.log(`\n→ Q: ${question}`);

      // Wipe debug buffers so each question's capture is isolated.
      await page.evaluate(() => {
        const w = window as unknown as {
          __cloakpdfRetrievals?: unknown[];
          __cloakpdfHybridDebug?: unknown[];
        };
        w.__cloakpdfRetrievals = [];
        w.__cloakpdfHybridDebug = [];
      });

      const { reply } = await askAndCapture(page, question);

      const captured = await page.evaluate(() => {
        const w = window as unknown as {
          __cloakpdfRetrievals?: RetrievalDebugRecord[];
          __cloakpdfHybridDebug?: HybridDebugRecord[];
        };
        return {
          fused: w.__cloakpdfRetrievals?.[0],
          perRetriever: w.__cloakpdfHybridDebug?.[0],
        };
      });

      results.push({ question, reply, ...captured });

      console.log(
        `  reply: ${reply.slice(0, 160).replace(/\n/g, " ⏎ ")}${reply.length > 160 ? "…" : ""}`,
      );
      if (captured.perRetriever) {
        console.log("  dense top-5:");
        for (const h of captured.perRetriever.dense.slice(0, 5)) {
          console.log(
            `    p${h.pageNumber} ${h.chunkId}: ${h.preview.slice(0, 100).replace(/\n/g, " ")}`,
          );
        }
        console.log("  sparse (BM25) top-5:");
        for (const h of captured.perRetriever.sparse.slice(0, 5)) {
          console.log(
            `    p${h.pageNumber} ${h.chunkId}: ${h.preview.slice(0, 100).replace(/\n/g, " ")}`,
          );
        }
      }
      if (captured.fused) {
        console.log("  fused (fed to LLM):");
        for (const h of captured.fused.hits) {
          console.log(
            `    p${h.pageNumber} ${h.chunkId} (${h.length}ch): ${h.preview.slice(0, 100).replace(/\n/g, " ")}`,
          );
        }
      }
    }

    if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outPath = resolve(OUTPUT_DIR, `${stamp}.json`);
    writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log(`\n✓ Wrote diagnostic to ${outPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
