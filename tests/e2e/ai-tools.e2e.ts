/**
 * End-to-end smoke test for the AI tools.
 *
 * This is the only test that can answer "does the model actually
 * work?" — everything else runs in Node, with the LLM mocked. Here
 * we drive a real browser, let it download the active chat tier's
 * weights (LFM2.5-1.2B-Instruct by default — see
 * {@link getDefaultChatVariant}), and assert the chat tool produces
 * a non-degenerate reply.
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
 * The first run downloads ~1.55 GB of model weights into the browser's
 * CacheStorage (chat ~1.2 GB + embed ~309 MB + rerank ~23 MB) and
 * may take several minutes. Subsequent runs reuse the cache and
 * complete in a few seconds.
 *
 * ## Caveats
 *
 *   - This is a *smoke* test — it asserts the model loaded and
 *     produced *some* output, not that the output is correct. Output
 *     quality is a human-judgement call and lives outside automated
 *     testing.
 *   - The tool ships a 3-tier chat picker (Compact / Balanced /
 *     Quality) but this test exercises only the default tier — the
 *     picker is a click-through in the gate, and clicking "Download
 *     model" without first picking another tier loads whatever is
 *     stored in localStorage (or the static default on a fresh
 *     profile). Override with `cloakpdf:chat-variant` in localStorage
 *     when you want to e2e a specific tier.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { launch } from "puppeteer-core";

const FIXTURE_PATH = resolve(import.meta.dirname, "../fixtures/sample.pdf");
const DEV_URL = process.env.E2E_URL ?? "http://localhost:5173";

/**
 * Optional chat-tier override. When set, we seed the picker's
 * localStorage key before page navigation so the test exercises a
 * specific tier (e.g. for cross-model comparison runs):
 *
 *   CHAT_VARIANT=lfm2-2.6b pnpm test:e2e
 *
 * Valid values are the `ChatVariantId` slugs in
 * `src/utils/ai-models.ts`. Unset → use whatever's already in
 * localStorage, or the static default for a fresh profile.
 */
const VALID_CHAT_VARIANTS = ["lfm2.5-1.2b", "lfm2-2.6b"] as const;
type ValidChatVariant = (typeof VALID_CHAT_VARIANTS)[number];
const CHAT_VARIANT_OVERRIDE: ValidChatVariant | null = (() => {
  const raw = process.env.CHAT_VARIANT;
  if (!raw) return null;
  if ((VALID_CHAT_VARIANTS as readonly string[]).includes(raw)) return raw as ValidChatVariant;
  console.error(`✗ Invalid CHAT_VARIANT="${raw}". Pick one of: ${VALID_CHAT_VARIANTS.join(", ")}.`);
  process.exit(1);
})();
// puppeteer-core needs an explicit browser binary. Default to the
// stock macOS Chrome path; override with CHROME_PATH=/path/to/chrome
// when running on Linux/Windows or with a different channel.
const CHROME_PATH =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function bail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/**
 * Returns the worst 4-gram repetition count in `text`, where a "4-gram"
 * is four consecutive whitespace-separated words.
 *
 * Catches the SmolLM2-1.7B "lexical ramp" loop the line-level check
 * misses: a single hallucinated paragraph in which each clause extends
 * the previous one by a token ("Teachers' Development Network - Kenya
 * - Africa - Asia - Europe - North America - South America …"). Each
 * clause is technically a distinct line and a distinct surface form,
 * so per-line dedup and `repetition_penalty` both let it through, but
 * a fixed 4-gram window inside the rolling text repeats dozens of
 * times. 4 is the smallest window that's specific enough to avoid
 * common short phrases ("the document does not") tripping the alarm.
 */
function worstNgramRepeat(text: string, n = 4): number {
  const words = text.toLowerCase().match(/\S+/g) ?? [];
  if (words.length < n) return 0;
  const counts = new Map<string, number>();
  let worst = 0;
  for (let i = 0; i <= words.length - n; i++) {
    const gram = words.slice(i, i + n).join(" ");
    const next = (counts.get(gram) ?? 0) + 1;
    counts.set(gram, next);
    if (next > worst) worst = next;
  }
  return worst;
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
    // The in-page progress-polling loop runs for up to 10 minutes
    // inside a single `evaluate()` call (it busy-polls for the
    // composer to enable). Puppeteer's default CDP `protocolTimeout`
    // is well under that, so cold-cache runs with three models to
    // download (chat ~1.2 GB + embed ~309 MB + rerank ~23 MB)
    // would `Runtime.callFunctionOn` time out before the page-side
    // loop even gets a chance. 15 min is comfortable headroom.
    protocolTimeout: 15 * 60_000,
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60_000);

    // Seed the chat-tier preference + any RAG feature flags *before*
    // any app script runs so the picker + graph boot with the
    // overrides applied. `evaluateOnNewDocument` fires before every
    // navigation in this page's lifetime, so the post-reload
    // warm-cache path is covered too.
    //
    // Flag wiring:
    //   - CHAT_VARIANT=...  → cloakpdf:chat-variant
    //   - RAG_NO_RERANK=1   → cloakpdf:rag-rerank = "0" (disables reranker)
    //   - RAG_NO_HYDE=1     → cloakpdf:rag-hyde   = "0" (disables HyDE)
    //
    // Each flag is independent; combining them isolates per-feature
    // contribution in cross-cut comparison runs.
    const lsSeeds: Array<[string, string]> = [];
    if (CHAT_VARIANT_OVERRIDE) lsSeeds.push(["cloakpdf:chat-variant", CHAT_VARIANT_OVERRIDE]);
    if (process.env.RAG_NO_RERANK === "1") lsSeeds.push(["cloakpdf:rag-rerank", "0"]);
    if (process.env.RAG_NO_HYDE === "1") lsSeeds.push(["cloakpdf:rag-hyde", "0"]);
    if (lsSeeds.length > 0) {
      await page.evaluateOnNewDocument((seeds) => {
        try {
          for (const [k, v] of seeds) localStorage.setItem(k, v);
        } catch {
          // Private mode / quota — the test will just exercise
          // whatever localStorage default applies.
        }
      }, lsSeeds);
      console.log(
        `→ localStorage seeds active: ${lsSeeds.map(([k, v]) => `${k}=${v}`).join(", ")}`,
      );
    }

    // Per-question timing so cross-tier comparison runs can be
    // collated. We append to this array on every measured question
    // and dump it as a single JSON line at the end so a wrapper
    // script can parse without parsing the prose log.
    const timings: Array<{ label: string; ms: number }> = [];
    const timed = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
      const t0 = Date.now();
      const out = await fn();
      const ms = Date.now() - t0;
      timings.push({ label, ms });
      console.log(`  ⏱ ${label}: ${ms} ms`);
      return out;
    };

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

    // Assert the Beta badge renders on the AI tool card before we
    // click into the tool. The badge tells users the feature is
    // functional but still maturing; a silent regression (badge gone)
    // would mis-set expectations. We require both "Ask your PDF" and
    // a sibling "Beta" pill inside the same button.
    const cardBetaOk = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const card = buttons.find((b) => b.textContent?.includes("Ask your PDF"));
      if (!card) return false;
      // Walk the card subtree for a "Beta" pill (case-sensitive, the
      // CSS does the visual uppercase).
      const spans = Array.from(card.querySelectorAll("span"));
      return spans.some((s) => (s.textContent ?? "").trim() === "Beta");
    });
    if (!cardBetaOk) bail("Beta badge missing on the Ask PDF card.");
    console.log("  ✓ Beta badge present on AI tool card");

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

    // Click the gate's "Download model" button. The gate is the
    // very first thing the user sees on Ask PDF — *before* the file
    // drop zone, which only renders once all three pipelines are
    // ready. On a first-run profile the gate sits at "Download
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
        { timeout: 30_000 },
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

    // Phase 1 — wait for models to finish loading. Signal: the file
    // drop zone (= `<input type="file">`) appears, which only mounts
    // once `rag.status === "ready"` per the gate's children-render
    // gate. On a cold first run this is the long pole (~1.55 GB
    // download); on a warm-cache return visit it's seconds.
    //
    // While we poll, also record every distinct value of the
    // ProgressBar's `<current>/<total>` counter (the only
    // `.tabular-nums` element in the dialog) so we can assert
    // progress visibly advanced — the React 18 batching bug used to
    // make the bar snap from 0 → done with no intermediate states.
    console.log("→ Waiting for models to load (first run downloads ~1.55 GB)…");
    const modelLoadOutcome = await page.evaluate(async () => {
      const states = new Set<string>();
      const startedAt = Date.now();
      while (Date.now() - startedAt < 10 * 60_000) {
        const counter = document.querySelector(".tabular-nums");
        if (counter) {
          const s = (counter.textContent ?? "").trim();
          if (s) states.add(s);
        }
        const fileInput = document.querySelector('input[type="file"]');
        if (fileInput) return { states: [...states], modelsReady: true };
        await new Promise((r) => setTimeout(r, 150));
      }
      return { states: [...states], modelsReady: false };
    });
    if (!modelLoadOutcome.modelsReady) {
      bail("Models never finished loading — file drop zone never appeared.");
    }
    console.log(
      `  ✓ models loaded; download-progress recorded ${modelLoadOutcome.states.length} distinct states`,
    );

    // Phase 2 — upload the fixture now that the drop zone is live.
    // 10 s timeout because the input is already in the DOM at this
    // point (we just confirmed it via the polling loop above).
    console.log("→ Uploading fixture PDF…");
    const fileInput = await page
      .waitForSelector('input[type="file"]', { timeout: 10_000 })
      .catch(async () => {
        const dump = await page.evaluate(() => ({
          url: location.href,
          bodyText: (document.body.textContent ?? "").slice(0, 500),
          tagCounts: {
            buttons: document.querySelectorAll("button").length,
            inputs: document.querySelectorAll("input").length,
            cards: document.querySelectorAll("[data-bubble], [role='dialog'], main").length,
          },
        }));
        bail(
          `File input not found post-models-ready. Page state: ${JSON.stringify(dump, null, 2)}`,
        );
      });
    if (!fileInput) bail("File input not found on the page.");
    await (fileInput as { uploadFile: (...p: string[]) => Promise<void> }).uploadFile(FIXTURE_PATH);

    // Phase 3 — wait for indexing to finish (signal: composer enables).
    // The indexing card has its own `.tabular-nums` counter so we
    // continue to harvest progress states here.
    console.log("→ Waiting for indexing to finish…");
    const progressOutcome = await page.evaluate(async () => {
      const states = new Set<string>();
      const startedAt = Date.now();
      while (Date.now() - startedAt < 5 * 60_000) {
        const counter = document.querySelector(".tabular-nums");
        if (counter) {
          const s = (counter.textContent ?? "").trim();
          if (s) states.add(s);
        }
        const textarea = document.querySelector("textarea");
        if (textarea instanceof HTMLTextAreaElement && !textarea.disabled) {
          return { states: [...states], composerEnabled: true };
        }
        await new Promise((r) => setTimeout(r, 150));
      }
      return { states: [...states], composerEnabled: false };
    });
    if (!progressOutcome.composerEnabled) {
      bail("Composer never enabled — indexing failed or stalled.");
    }
    // Combine download-phase + index-phase states for the progress-
    // advances regression check below.
    const combinedStates = new Set([...modelLoadOutcome.states, ...progressOutcome.states]);
    console.log(
      `  ✓ composer enabled; progress recorded ${combinedStates.size} distinct states (${[...combinedStates].slice(0, 6).join(", ")}${combinedStates.size > 6 ? "…" : ""})`,
    );
    // The progress-advances assertion only makes sense on the cold
    // path. On a warm cache (IndexedDB has the indexed vectors, model
    // weights are in CacheStorage) the composer enables in well under
    // a second and no progress dialog ever renders — zero distinct
    // states is the correct outcome. We use the gate click as the
    // cold-path signal: if we never clicked "Download model", the
    // model was already cached, so we skip the React-batching check.
    if (!gateClicked && !consentClicked) {
      console.log("  · skipping progress-advances check (warm cache — no progress dialog)");
    } else if (combinedStates.size < 3) {
      // The React-batching regression check is meant to catch a UI
      // regression on the canonical default-tier load. Cross-tier
      // comparison runs (CHAT_VARIANT_OVERRIDE set) are about
      // measuring inference quality + latency across variants —
      // not the cold-load progress UX. Soften to a warning so a
      // single weird progress sample doesn't abort a multi-tier
      // comparison.
      const msg = `Progress did not visibly advance — only ${combinedStates.size} distinct state(s) observed: ${[...combinedStates].join(", ")}.`;
      if (CHAT_VARIANT_OVERRIDE) {
        console.warn(`  ⚠ ${msg} (warned: CHAT_VARIANT comparison run, not bailing)`);
      } else {
        bail(`${msg} Indicates the React-batching regression has returned.`);
      }
    }

    console.log("→ Asking a question…");
    // Snapshot the bubble count BEFORE we send. Each turn renders a
    // wrapper element with `data-bubble="user|assistant"`; the count
    // increments once on user-send and again when the assistant
    // appears. We wait for `prev + 2` so we don't accidentally capture
    // the user's own message as the assistant reply. The data
    // attribute is a stable test hook — switching the inner rendering
    // (e.g. plain `<p>` → react-markdown) doesn't change it.
    const reply = await timed("question-cold-overview", async () => {
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

      return await page.evaluate(() => {
        const bubbles = document.querySelectorAll('[data-bubble="assistant"]');
        return bubbles[bubbles.length - 1]?.textContent?.trim() ?? "";
      });
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
    // On the warm-cache return visit, the file drop zone doesn't
    // render until `rag.status === "ready"` — i.e. until both
    // AiModelGate's chat auto-load AND useRagModels' all-three
    // auto-load have re-hydrated pipelines from CacheStorage. That
    // takes a few seconds (init cost, not network). Bump the
    // selector timeout to 90 s so we don't false-fail on slower
    // disks.
    console.log("→ Waiting for warm-cache auto-load + file drop zone (no clicks)…");
    const fileInput2 = await page
      .waitForSelector('input[type="file"]', { timeout: 90_000 })
      .catch(() =>
        bail(
          "Warm-cache file input never appeared — auto-load stalled before rag.status reached 'ready'.",
        ),
      );
    if (!fileInput2) bail("File input not found after reload.");
    console.log("→ Re-uploading fixture…");
    await (fileInput2 as { uploadFile: (...p: string[]) => Promise<void> }).uploadFile(
      FIXTURE_PATH,
    );
    console.log("→ Waiting for composer to enable (warm-cache index also re-hydrates from IDB)…");
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
    const warmReply = await timed("question-warm-overview", async () => {
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
      return await page.evaluate(() => {
        const bubbles = document.querySelectorAll('[data-bubble="assistant"]');
        return bubbles[bubbles.length - 1]?.textContent?.trim() ?? "";
      });
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
    const warmNgramWorst = worstNgramRepeat(warmReply);
    if (warmNgramWorst >= 4) {
      bail(`Warm-cache: assistant looped — same 4-word window ${warmNgramWorst}× in the reply.`);
    }
    console.log("  ✓ warm-cache reply non-empty, no loop");

    // ── Verbatim extraction check ───────────────────────────────────
    // Real-world failure mode the user hit: "give me Sumit's phone"
    // returned a fabricated number. The fix is the verbatim-extraction
    // rule in the system prompt + the document anchor that always
    // includes the contact block. We now assert the model returns the
    // exact ground-truth phone string from page 1 of the fixture.
    //
    // Ground truth (from `tests/fixtures/sample.pdf`, page 1 contact
    // block): "+91-7899800899". If the e2e fixture is ever swapped
    // out, update these constants alongside the file.
    const GROUND_TRUTH = {
      phone: "+91-7899800899",
      email: "sumitsahoo1988@gmail.com",
      addressCity: "Pune",
      addressState: "Maharashtra",
      addressCountry: "India",
    };
    console.log("→ Asking an extraction question (phone)…");
    const phoneReply = await timed("question-phone-extraction", async () => {
      const priorExtractBubbleCount = await page.evaluate(
        () => document.querySelectorAll("[data-bubble]").length,
      );
      await page.focus("textarea");
      await page.keyboard.type("Give me Sumit's phone number.");
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
        priorExtractBubbleCount,
      );
      return await page.evaluate(() => {
        const bubbles = document.querySelectorAll('[data-bubble="assistant"]');
        return bubbles[bubbles.length - 1]?.textContent?.trim() ?? "";
      });
    });
    console.log("\n──────── phone extraction reply ────────");
    console.log(phoneReply);
    console.log("────────────────────────────────────────\n");
    // Normalise the reply: strip whitespace and parentheses so a
    // model that writes "(+91) 78998 00899" or "+91 7899800899" still
    // passes if all the digits and the country-code prefix are there.
    // We require the exact ground-truth string after light whitespace
    // collapse — that's still strict enough to fail on hallucinated
    // digits, which is the actual regression we're guarding against.
    const phoneReplyDigits = phoneReply.replace(/\s+/g, " ");
    if (!phoneReplyDigits.includes(GROUND_TRUTH.phone)) {
      // Also try just the digit run, in case the model dropped the
      // dash/punctuation. The verbatim rule prefers the exact form,
      // but the digits being correct is the safety-critical part.
      const digitsOnly = GROUND_TRUTH.phone.replace(/[^0-9]/g, "");
      const replyDigitsOnly = phoneReply.replace(/[^0-9]/g, "");
      if (!replyDigitsOnly.includes(digitsOnly)) {
        bail(
          `Phone extraction failed. Expected to find "${GROUND_TRUTH.phone}" (or digits ${digitsOnly}) in the reply. Got: ${phoneReply.slice(0, 240)}`,
        );
      }
      console.log(
        "  ⚠ phone digits present but exact format differed from ground truth — still acceptable",
      );
    } else {
      console.log(`  ✓ phone reply contains exact ground truth "${GROUND_TRUTH.phone}"`);
    }
    // Also sanity-check that we did not regress the email extraction
    // path. Email is structurally easier (no normalisation
    // ambiguity) so we just look for the literal address.
    console.log("→ Asking an extraction question (email)…");
    const emailReply = await timed("question-email-extraction", async () => {
      const priorEmailBubbleCount = await page.evaluate(
        () => document.querySelectorAll("[data-bubble]").length,
      );
      await page.focus("textarea");
      await page.keyboard.type("What is the email address in this document?");
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
        priorEmailBubbleCount,
      );
      return await page.evaluate(() => {
        const bubbles = document.querySelectorAll('[data-bubble="assistant"]');
        return bubbles[bubbles.length - 1]?.textContent?.trim() ?? "";
      });
    });
    console.log("\n──────── email extraction reply ────────");
    console.log(emailReply);
    console.log("────────────────────────────────────────\n");
    if (!emailReply.toLowerCase().includes(GROUND_TRUTH.email)) {
      bail(
        `Email extraction failed. Expected "${GROUND_TRUTH.email}" in the reply. Got: ${emailReply.slice(0, 240)}`,
      );
    }
    console.log(`  ✓ email reply contains exact ground truth "${GROUND_TRUTH.email}"`);

    // Address — multi-part value ("Pune, Maharashtra, India"). We
    // require all three components to appear in the reply because the
    // model might phrase the answer either as "Pune, Maharashtra,
    // India" or "Pune in Maharashtra, India" or list them separately.
    // What we are guarding against is the model dropping the country
    // ("just Pune") or fabricating one ("Hyderabad" — which IS in the
    // doc as a former workplace location, an easy confusion path).
    console.log("→ Asking an extraction question (address)…");
    const addressReply = await timed("question-address-extraction", async () => {
      const priorAddrBubbleCount = await page.evaluate(
        () => document.querySelectorAll("[data-bubble]").length,
      );
      await page.focus("textarea");
      await page.keyboard.type("Where is Sumit based? Give me the city, state, and country.");
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
        priorAddrBubbleCount,
      );
      return await page.evaluate(() => {
        const bubbles = document.querySelectorAll('[data-bubble="assistant"]');
        return bubbles[bubbles.length - 1]?.textContent?.trim() ?? "";
      });
    });
    console.log("\n──────── address extraction reply ────────");
    console.log(addressReply);
    console.log("──────────────────────────────────────────\n");
    const addrLower = addressReply.toLowerCase();
    const missingAddrParts: string[] = [];
    for (const part of [
      GROUND_TRUTH.addressCity,
      GROUND_TRUTH.addressState,
      GROUND_TRUTH.addressCountry,
    ]) {
      if (!addrLower.includes(part.toLowerCase())) missingAddrParts.push(part);
    }
    if (missingAddrParts.length > 0) {
      bail(
        `Address extraction failed. Missing component(s): ${missingAddrParts.join(", ")}. Got: ${addressReply.slice(0, 240)}`,
      );
    }
    console.log(
      `  ✓ address reply contains all three ground-truth components (${GROUND_TRUTH.addressCity}, ${GROUND_TRUTH.addressState}, ${GROUND_TRUTH.addressCountry})`,
    );

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
    const ngramWorst = worstNgramRepeat(reply);
    if (ngramWorst >= 4) {
      bail(`Assistant looped — same 4-word window appeared ${ngramWorst}× in the reply.`);
    }

    console.log("✓ AI chat smoke test passed.");

    // Structured summary on a single line so a wrapper script can
    // parse it across runs (we use it to build the cross-tier
    // comparison table). Replies are truncated to keep the line
    // size manageable but contain enough text to judge quality.
    const summary = {
      kind: "e2e-summary" as const,
      variant: CHAT_VARIANT_OVERRIDE ?? "(default)",
      timings,
      replies: {
        coldOverview: reply.slice(0, 600),
        warmOverview: warmReply.slice(0, 600),
        phone: phoneReply.slice(0, 200),
        email: emailReply.slice(0, 200),
        address: addressReply.slice(0, 200),
      },
    };
    console.log(`E2E_SUMMARY ${JSON.stringify(summary)}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
