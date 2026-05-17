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

/**
 * Fixture selector. `FIXTURE=sample` (default) drives the short
 * résumé PDF with ground-truth contact extraction assertions
 * (phone / email / address). `FIXTURE=multipage` drives the
 * 33-page "Building Skills for Claude" guide with topical
 * retrieval assertions that exercise chunking + citations at
 * scale instead of pointwise extraction.
 *
 * The picker exists so the smoke test can cover both ends of the
 * spectrum (small + dense vs. large + topical) in a single
 * harness rather than maintaining a forked test per fixture.
 */
const FIXTURE_NAME = process.env.FIXTURE ?? "sample";
const FIXTURE_PATH = resolve(import.meta.dirname, `../fixtures/${FIXTURE_NAME}.pdf`);
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
    // Always reset the chat-variant pref to a deterministic baseline
    // (Quality / lfm2-2.6b) so a previous run's model-swap test
    // doesn't leak into this run's warm-cache extraction checks.
    // Without this, the swap step persists Compact and the next
    // invocation hits Compact's weaker extraction (e.g. it
    // hallucinates "Mumbai" for the address question that ground-
    // truths "Pune"). Quality is the tier the extraction assertions
    // are tuned against.
    //
    // Explicit CHAT_VARIANT env override still wins so cross-tier
    // comparison runs work the same way they always did.
    lsSeeds.push(["cloakpdf:chat-variant", CHAT_VARIANT_OVERRIDE ?? "lfm2-2.6b"]);
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
    const gateState = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const labels = buttons.map((b) => (b.textContent ?? "").trim().slice(0, 60));
      const dl = buttons.find((b) => (b.textContent ?? "").trim().startsWith("Download model"));
      const root = document.querySelector("[data-rag-status]") as HTMLElement | null;
      const ragStatus = root?.dataset.ragStatus ?? "(no AskPdf root found)";
      const chatStatus = root?.dataset.ragChatStatus ?? "(no AskPdf root found)";
      let clicked = false;
      if (dl instanceof HTMLButtonElement) {
        dl.click();
        clicked = true;
      }
      return { clicked, labels, ragStatus, chatStatus };
    });
    if (gateState.clicked) {
      console.log("  ✓ clicked gate Download");
      console.log("    [debug] visible buttons:", JSON.stringify(gateState.labels));
      console.log(
        `    [debug] rag.status="${gateState.ragStatus}" chat.status="${gateState.chatStatus}"`,
      );
    } else {
      console.log("  · gate already past Download (no Download model button found)");
    }
    const gateClicked = gateState.clicked;

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
      // Match the system-prompt's "what is this document?" handler
      // wording exactly — it has a directive branch ("identify the
      // type from structure") that anchors the model on document
      // identification, much less prone to drift than the prior
      // "what is this about?" framing which the model sometimes
      // treated as a generic "give me a topic" prompt and answered
      // from training data instead of the retrieved excerpts.
      await page.keyboard.type("What is this document and what is its main subject?");
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

    // No-flash assertion. The fix here is the synchronous willAutoLoad
    // derivation in useRagModels: on a warm-cache return visit the
    // rollup must report "loading" from the very first paint, not
    // "idle". If the bug regresses, the gate flashes "Download model"
    // for the duration of the warm-load before reverting to children.
    // We poll for the first stable state and fail if the visible gate
    // button is "Download model" rather than "Loading model…" (or
    // nothing, if init was instant and children mounted immediately).
    await page
      .waitForFunction(
        () => {
          const buttons = Array.from(document.querySelectorAll("button"));
          const hasGateButton = buttons.some((b) => {
            const t = (b.textContent ?? "").trim();
            return t.startsWith("Download model") || t.startsWith("Loading model");
          });
          const hasFileInput = !!document.querySelector('input[type="file"]');
          return hasGateButton || hasFileInput;
        },
        { timeout: 30_000 },
      )
      .catch(() => bail("Warm-cache: gate / file input never rendered within 30s of reload."));
    const gateLabel = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const labels = buttons.map((b) => (b.textContent ?? "").trim());
      if (labels.some((t) => t.startsWith("Download model"))) return "Download model";
      if (labels.some((t) => t.startsWith("Loading model"))) return "Loading model";
      return "(none — children already mounted)";
    });
    if (gateLabel === "Download model") {
      bail(
        "Warm-cache flash regression: gate shows 'Download model' instead of 'Loading model…' — useRagModels.willAutoLoad derivation is broken.",
      );
    }
    console.log(`  ✓ warm gate label: "${gateLabel}" (no Download flash)`);

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
      // Same directive phrasing as the cold pass — see the comment
      // above the cold-question type call for the rationale.
      await page.keyboard.type("What is this document and what is its main subject?");
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
    // Topic-relevance assertion. The structural checks above pass on
    // *any* coherent prose, including completely off-topic replies
    // (we hit a French art-and-inventions monologue on one run that
    // was non-empty and non-loopy but unrelated to the fixture). The
    // weak content check below catches that class of failure
    // without being so strict that natural phrasing variation
    // (sometimes "Sumit Sahoo", sometimes just "this résumé") fails.
    //
    // Each fixture nominates a small set of keywords that any honest
    // overview MUST mention; at least one must appear. Off-topic
    // generations (wrong document subject, wrong language) fall
    // through this gate; legitimate paraphrases pass.
    const warmTopicKeywords =
      FIXTURE_NAME === "sample"
        ? ["sumit", "enterprise", "architect", "résumé", "resume", "cv"]
        : FIXTURE_NAME === "multipage"
          ? ["claude", "skill", "skills"]
          : [];
    if (warmTopicKeywords.length > 0) {
      const warmLower = warmReply.toLowerCase();
      const matched = warmTopicKeywords.find((kw) => warmLower.includes(kw));
      if (!matched) {
        bail(
          `Warm-cache overview is off-topic. Expected at least one of [${warmTopicKeywords.join(", ")}]. Got: ${warmReply.slice(0, 240)}`,
        );
      }
    }
    console.log("  ✓ warm-cache reply non-empty, no loop, on-topic");

    // ── Fixture-specific accuracy checks ────────────────────────────
    // The cold + warm overview questions above are fixture-agnostic
    // (we only assert structural sanity — non-empty, no degenerate
    // loop). Here we run *content* assertions that depend on what's
    // actually in the chosen PDF.
    //
    // Each fixture-specific block:
    //
    //   - returns the per-question replies (kept in scope so the
    //     post-test E2E_SUMMARY can include them);
    //   - bails on any assertion failure with a message naming the
    //     specific ground-truth string that was missing — so a
    //     regression run that fails reads as "phone digits wrong"
    //     instead of "test 5 returned non-empty string but…";
    //   - uses the {@link askAndCapture} helper to keep the
    //     "type into composer → wait for streaming to finish → read
    //     last assistant bubble" pattern in one place instead of
    //     copy-pasted at every question site.

    /** Send `question` and resolve with the assistant's reply text. */
    async function askAndCapture(question: string, label: string): Promise<string> {
      return timed(label, async () => {
        const prior = await page.evaluate(() => document.querySelectorAll("[data-bubble]").length);
        await page.focus("textarea");
        await page.keyboard.type(question);
        await page.keyboard.press("Enter");
        await page.waitForFunction(
          (prev) => {
            const bubbles = document.querySelectorAll("[data-bubble]");
            if (bubbles.length < prev + 2) return false;
            const last = bubbles[bubbles.length - 1];
            if (last.getAttribute("data-streaming") === "true") return false;
            return (last.textContent ?? "").trim().length > 0;
          },
          { timeout: 5 * 60 * 1000 },
          prior,
        );
        return await page.evaluate(() => {
          const bubbles = document.querySelectorAll('[data-bubble="assistant"]');
          return bubbles[bubbles.length - 1]?.textContent?.trim() ?? "";
        });
      });
    }

    /** Holds the per-fixture reply texts so the final summary can include them. */
    const fixtureReplies: Record<string, string> = {};

    if (FIXTURE_NAME === "sample") {
      // Sample PDF: a short résumé. Strict verbatim extraction — phone,
      // email, and full address — is the exact regression class the
      // user previously hit ("fabricated phone digits"), so we keep
      // these checks tight.
      //
      // Ground truth (from `tests/fixtures/sample.pdf`, page 1 contact
      // block). If the file is swapped, update these constants.
      const GROUND_TRUTH = {
        phone: "+91-7899800899",
        email: "sumitsahoo1988@gmail.com",
        addressCity: "Pune",
        addressState: "Maharashtra",
        addressCountry: "India",
      };

      console.log("→ Asking an extraction question (phone)…");
      const phoneReply = await askAndCapture(
        "Give me Sumit's phone number.",
        "question-phone-extraction",
      );
      console.log("\n──────── phone extraction reply ────────");
      console.log(phoneReply);
      console.log("────────────────────────────────────────\n");
      const phoneReplyDigits = phoneReply.replace(/\s+/g, " ");
      if (!phoneReplyDigits.includes(GROUND_TRUTH.phone)) {
        // Also accept a digit-run match if the model dropped the
        // dashes — the verbatim rule prefers the exact form, but the
        // digits being correct is the safety-critical part.
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
      fixtureReplies.phone = phoneReply;

      console.log("→ Asking an extraction question (email)…");
      const emailReply = await askAndCapture(
        "What is the email address in this document?",
        "question-email-extraction",
      );
      console.log("\n──────── email extraction reply ────────");
      console.log(emailReply);
      console.log("────────────────────────────────────────\n");
      if (!emailReply.toLowerCase().includes(GROUND_TRUTH.email)) {
        bail(
          `Email extraction failed. Expected "${GROUND_TRUTH.email}" in the reply. Got: ${emailReply.slice(0, 240)}`,
        );
      }
      console.log(`  ✓ email reply contains exact ground truth "${GROUND_TRUTH.email}"`);
      fixtureReplies.email = emailReply;

      // Address — multi-part value. Require all three components to
      // appear because the model might phrase it many ways
      // ("Pune, Maharashtra, India" / "Pune in Maharashtra, India" /
      // listed separately). What we guard against is dropping the
      // country ("just Pune") or fabricating one ("Hyderabad" — which
      // *is* in the doc as a former workplace, an easy confusion).
      console.log("→ Asking an extraction question (address)…");
      const addressReply = await askAndCapture(
        "Where is Sumit based? Give me the city, state, and country.",
        "question-address-extraction",
      );
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
      fixtureReplies.address = addressReply;
    } else if (FIXTURE_NAME === "multipage") {
      // Multipage PDF: "The Complete Guide to Building Skills for
      // Claude" — 33 pages, table of contents on page 2, content
      // spread across labelled sections (Introduction p3, Fundamentals
      // p4, Planning and design p7, Testing and iteration p14,
      // Distribution and sharing p18, Patterns and troubleshooting
      // p21, Resources and references p28).
      //
      // The assertions here are deliberately looser than the sample
      // fixture's verbatim extraction — they prove the model is
      // pulling content from the document (not hallucinating
      // generics) and that retrieval reaches *past page 1* into the
      // section content. They don't require exact strings, because
      // a topical doc has many valid phrasings.
      //
      // What we want to *fail* on: a reply that names totally
      // unrelated entities (the "University of South Carolina"
      // hallucination shape we hit earlier on the address question)
      // or one that talks about nothing the document actually
      // covers.

      console.log("→ Asking a topic question…");
      const topicReply = await askAndCapture(
        "What is this document about? Answer in one sentence.",
        "question-multipage-topic",
      );
      console.log("\n──────── topic reply ────────");
      console.log(topicReply);
      console.log("─────────────────────────────\n");
      const topicLower = topicReply.toLowerCase();
      // Either word alone is too weak (could appear in hallucinated
      // generics about AI). Require *both* the agent name and the
      // doc's subject to appear in the same reply.
      if (!topicLower.includes("claude") || !topicLower.includes("skill")) {
        bail(
          `Topic question failed. Expected the reply to mention both "Claude" and "skill". Got: ${topicReply.slice(0, 240)}`,
        );
      }
      console.log(`  ✓ topic reply mentions both "Claude" and "skill"`);
      fixtureReplies.topic = topicReply;

      console.log("→ Asking the skill-definition question…");
      const definitionReply = await askAndCapture(
        "According to this document, what is a Skill?",
        "question-multipage-definition",
      );
      console.log("\n──────── skill definition reply ────────");
      console.log(definitionReply);
      console.log("────────────────────────────────────────\n");
      // The document defines a Skill as: "a set of instructions –
      // packaged as a simple folder – that teaches Claude how to
      // handle specific tasks or workflows", and elsewhere describes
      // the on-disk structure (SKILL.md + YAML front matter +
      // optional scripts/references/assets dirs).
      //
      // We accept any *one* of: the salient nouns ("instructions",
      // "folder"), the verb cues ("teach" / "instructs" / "guides"),
      // task/workflow language, or the on-disk-structure terms
      // ("SKILL.md" / "YAML" / "scripts" / "references" / "assets").
      // The earlier "needs 2 hits" gate kept rejecting valid replies
      // that described the file structure but didn't repeat the
      // dictionary noun ("A Skill is a folder containing a SKILL.md
      // file with YAML front matter…" was a real, correct reply
      // that failed). One signal is enough — the topic-question
      // gate already pinned that the answer is on-topic for Claude
      // skills.
      const defLower = definitionReply.toLowerCase();
      const defHits = [
        /instruction/.test(defLower) ? "instructions" : null,
        /folder/.test(defLower) ? "folder" : null,
        /directory|directories/.test(defLower) ? "directory" : null,
        /\btask|workflow/.test(defLower) ? "task/workflow" : null,
        /teach|guide|instruct/.test(defLower) ? "teach/guide/instruct" : null,
        /skill\.md|skill_md|yaml/.test(defLower) ? "skill.md/yaml" : null,
        /scripts?\/|references?\/|assets?\//.test(defLower) ? "scripts/references/assets" : null,
      ].filter((s): s is string => s !== null);
      if (defHits.length < 1) {
        bail(
          `Skill-definition question failed. Reply doesn't paraphrase the doc's definition (needs at least one of: instructions / folder / directory / task / workflow / teach / guide / instruct / SKILL.md / YAML / scripts/references/assets). Got: ${definitionReply.slice(0, 240)}`,
        );
      }
      console.log(`  ✓ definition reply paraphrases the doc (hits: ${defHits.join(", ")})`);
      fixtureReplies.definition = definitionReply;

      console.log("→ Asking the section-enumeration question…");
      const sectionsReply = await askAndCapture(
        "Name three sections from this document's table of contents.",
        "question-multipage-sections",
      );
      console.log("\n──────── sections reply ────────");
      console.log(sectionsReply);
      console.log("────────────────────────────────\n");
      // Table of contents (page 2): Introduction, Fundamentals,
      // Planning and design, Testing and iteration, Distribution and
      // sharing, Patterns and troubleshooting, Resources and
      // references. We require ≥1 hit — the assertion's job is to
      // catch a reply that completely invents section names; one
      // accurate ToC mention proves the model is reading the doc
      // and isn't free-wheeling. Asking for ≥2 turned out to be
      // brittle: the model sometimes paraphrases ("Chapter 1
      // Fundamentals" + sub-items) instead of listing top-level
      // sections, and a strict ≥2 rejects that as a "miss" when
      // the substantive answer is still grounded.
      const sectionsLower = sectionsReply.toLowerCase();
      const expectedSections = [
        "introduction",
        "fundamentals",
        "planning",
        "testing",
        "distribution",
        "patterns",
        "resources",
      ];
      const sectionHits = expectedSections.filter((s) => sectionsLower.includes(s));
      if (sectionHits.length < 1) {
        bail(
          `Section-enumeration question failed. Expected at least one of [${expectedSections.join(", ")}]. Got: ${sectionsReply.slice(0, 240)}`,
        );
      }
      console.log(
        `  ✓ sections reply names ${sectionHits.length} expected section(s): [${sectionHits.join(", ")}]`,
      );
      fixtureReplies.sections = sectionsReply;
    } else {
      bail(
        `Unsupported FIXTURE="${FIXTURE_NAME}". Use "sample" (résumé extraction) or "multipage" (33-page guide topical retrieval).`,
      );
    }

    // ── Model swap ────────────────────────────────────────────────
    // Exercise the mid-session tier swap: click "Change model" on
    // the ActiveModelBar, pick the *other* tier in the dialog,
    // confirm, wait for the new model to warm-load and the session
    // to re-bind against it, then run one more question.
    //
    // Why this is a distinct regression case:
    //
    //   - `setChatVariant` unloads the previous chat pipeline; if
    //     that drops the right entries from the runtime caches a
    //     dangling reference in the still-mounted `RagSession`
    //     would crash on the next `ask`. AskPdf invalidates the
    //     session on `chatVariant` change to dodge that; if that
    //     invalidation effect ever regresses, the next ask would
    //     hit a disposed pipe.
    //   - The new tier may already be cached (both flags set in
    //     this profile), so the swap is a *warm load* — same code
    //     path the no-flash assertion above pins, just triggered
    //     from a different entry point. Without this case a swap-
    //     time regression in the rollup status promotion would
    //     never get exercised.
    //   - Embed + rerank stay shared across tiers; the test that
    //     these are *not* unloaded on a tier swap is implicit in
    //     the fact that the post-swap question still works.
    console.log("\n→ Opening the model picker to swap tiers…");
    const swapStartedAt = Date.now();
    const swapClicked = await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Change model"]');
      if (btn instanceof HTMLButtonElement && !btn.disabled) {
        btn.click();
        return true;
      }
      return false;
    });
    if (!swapClicked)
      bail("Couldn't find / click the 'Change model' button on the ActiveModelBar.");

    await page
      .waitForFunction(() => !!document.getElementById("chat-model-picker-title"), {
        timeout: 5_000,
      })
      .catch(() => bail("Picker dialog never opened after clicking 'Change model'."));

    // Pick the *unselected* tier — the picker uses aria-pressed="true"
    // on the active one; the other one is what we want to swap to.
    const swapTarget = await page.evaluate(() => {
      const titleEl = document.getElementById("chat-model-picker-title");
      const dialog = titleEl?.closest('[role="dialog"]');
      if (!dialog) return null;
      const tierButtons = Array.from(dialog.querySelectorAll("button[aria-pressed]"));
      const unselected = tierButtons.find((b) => b.getAttribute("aria-pressed") === "false");
      if (!(unselected instanceof HTMLButtonElement)) return null;
      const label = (unselected.textContent ?? "").trim().slice(0, 80);
      unselected.click();
      return label;
    });
    if (!swapTarget) bail("Couldn't find an unselected tier button in the picker dialog.");
    console.log(`  → picked: ${swapTarget}`);

    const switchClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const btn = buttons.find((b) => (b.textContent ?? "").trim() === "Switch model");
      if (btn instanceof HTMLButtonElement && !btn.disabled) {
        btn.click();
        return true;
      }
      return false;
    });
    if (!switchClicked) {
      bail("'Switch model' button missing or disabled after picking a different tier.");
    }

    // Wait for the picker dialog to close, then handle either
    // outcome:
    //
    //   - The new tier is *cached* (typical re-run on the persistent
    //     profile): chat warm-loads in a few seconds, the gate
    //     auto-promotes through "Loading model…", and the composer
    //     re-enables. No interaction needed.
    //   - The new tier is *not* cached (E2E_FRESH=1 first-time run,
    //     or a CI runner that only ever pre-warmed one tier): the
    //     gate appears with "Download model" because the new tier
    //     needs a fresh fetch. We click it so the e2e exercises the
    //     post-swap download path too — without this branch the
    //     test stalls forever waiting for a composer that needs a
    //     user click to even start downloading.
    //
    // We wait on a unified condition that satisfies *either*
    // outcome, then drive the download click only when needed.
    console.log("→ Waiting for swap to complete (composer or post-swap Download)…");
    await page.waitForFunction(() => !document.getElementById("chat-model-picker-title"), {
      timeout: 10_000,
    });

    const postSwapState = await page.evaluate(() => {
      const composer = document.querySelector("textarea");
      const composerReady = composer instanceof HTMLTextAreaElement && !composer.disabled;
      const buttons = Array.from(document.querySelectorAll("button"));
      const downloadBtn = buttons.find((b) =>
        (b.textContent ?? "").trim().startsWith("Download model"),
      );
      return {
        composerReady,
        hasDownloadBtn: downloadBtn instanceof HTMLButtonElement,
      };
    });
    if (!postSwapState.composerReady && postSwapState.hasDownloadBtn) {
      console.log("  · new tier not cached — clicking gate Download to fetch…");
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const downloadBtn = buttons.find((b) =>
          (b.textContent ?? "").trim().startsWith("Download model"),
        );
        if (downloadBtn instanceof HTMLButtonElement) downloadBtn.click();
      });
    }

    await page
      .waitForFunction(
        () => {
          const composer = document.querySelector("textarea");
          return composer instanceof HTMLTextAreaElement && !composer.disabled;
        },
        // 10 min covers a cold ~1.2 GB chat-tier download on a slow
        // line, then session rebuild against the cached IDB index.
        // On the typical warm-cache path this resolves in seconds.
        { timeout: 10 * 60_000 },
      )
      .catch(() => bail("Composer never re-enabled after model swap — swap stalled."));
    console.log(`  ✓ swap complete in ${Date.now() - swapStartedAt} ms`);

    console.log("→ Asking a question on the swapped tier…");
    const swapReply = await timed("question-after-swap", async () => {
      const priorSwapBubbleCount = await page.evaluate(
        () => document.querySelectorAll("[data-bubble]").length,
      );
      await page.focus("textarea");
      await page.keyboard.type("Summarize this document in two sentences.");
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
        priorSwapBubbleCount,
      );
      return await page.evaluate(() => {
        const bubbles = document.querySelectorAll('[data-bubble="assistant"]');
        return bubbles[bubbles.length - 1]?.textContent?.trim() ?? "";
      });
    });
    console.log("\n──────── post-swap assistant reply ────────");
    console.log(swapReply);
    console.log("───────────────────────────────────────────\n");
    if (!swapReply) bail("Post-swap: assistant returned an empty reply.");
    if (/^[! ]{20,}$/.test(swapReply)) bail("Post-swap: degenerate token loop.");
    const swapNgramWorst = worstNgramRepeat(swapReply);
    if (swapNgramWorst >= 4) {
      bail(`Post-swap: assistant looped — same 4-word window ${swapNgramWorst}× in the reply.`);
    }
    console.log("  ✓ post-swap reply non-empty, no loop");

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
    // Same topic-relevance gate the warm-cache pass uses — see the
    // comment there. Catches a cold reply that's coherent but talks
    // about something the document doesn't cover.
    const coldTopicKeywords =
      FIXTURE_NAME === "sample"
        ? ["sumit", "enterprise", "architect", "résumé", "resume", "cv"]
        : FIXTURE_NAME === "multipage"
          ? ["claude", "skill", "skills"]
          : [];
    if (coldTopicKeywords.length > 0) {
      const coldLower = reply.toLowerCase();
      if (!coldTopicKeywords.some((kw) => coldLower.includes(kw))) {
        bail(
          `Cold overview is off-topic. Expected at least one of [${coldTopicKeywords.join(", ")}]. Got: ${reply.slice(0, 240)}`,
        );
      }
    }

    console.log("✓ AI chat smoke test passed.");

    // Structured summary on a single line so a wrapper script can
    // parse it across runs (we use it to build the cross-tier
    // comparison table). Replies are truncated to keep the line
    // size manageable but contain enough text to judge quality.
    // The per-fixture extraction replies were collected into
    // `fixtureReplies` above; truncate each for telemetry and merge
    // alongside the fixture-agnostic overview + swap replies. Keys
    // vary by fixture (sample: phone/email/address; multipage:
    // topic/definition/sections) — a wrapper script parsing this
    // line should switch on `fixture` to know what to expect.
    const truncatedFixtureReplies: Record<string, string> = {};
    for (const [k, v] of Object.entries(fixtureReplies)) {
      truncatedFixtureReplies[k] = v.slice(0, 240);
    }
    const summary = {
      kind: "e2e-summary" as const,
      fixture: FIXTURE_NAME,
      variant: CHAT_VARIANT_OVERRIDE ?? "(default)",
      timings,
      replies: {
        coldOverview: reply.slice(0, 600),
        warmOverview: warmReply.slice(0, 600),
        ...truncatedFixtureReplies,
        postSwap: swapReply.slice(0, 600),
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
