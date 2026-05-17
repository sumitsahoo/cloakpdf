/**
 * Ask PDF — chat-style Q&A over a PDF, powered by a LangChain/LangGraph
 * hybrid-RAG session running on-device.
 *
 * This component is a thin shell around `createRagSession`. Per file:
 *
 *   1. Wait for both AI models to be ready.
 *   2. Build a `RagSession` — caches hit IndexedDB; cache misses run
 *      text-layer extraction (+ OCR fallback), chunk, embed, persist.
 *   3. Drive a typewriter chat: every question runs through the graph
 *      (classify → retrieve → generate, or → chitchat → END).
 *
 * Indexing happens *eagerly* the moment models are ready and a PDF is
 * loaded — not lazily on the first question — so the user isn't left
 * staring at a "Thinking…" spinner that's really doing extraction.
 */
import {
  AlertTriangle,
  Database,
  Loader2,
  MemoryStick,
  ScanSearch,
  Send,
  Sparkles,
  User,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ActiveModelBar } from "../components/ActiveModelBar.tsx";
import { AiConsentModal } from "../components/AiConsentModal.tsx";
import { AiModelGate } from "../components/AiModelGate.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { ChatModelPickerModal } from "../components/ChatModelPickerModal.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { InfoCallout } from "../components/InfoCallout.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { findTool } from "../config/tool-registry.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { usePdfFile } from "../hooks/usePdfFile.ts";
import { useRagModels } from "../hooks/useRagModels.ts";
import { createRagSession, type IndexingProgress, type RagSession } from "../rag/index.ts";
import { formatFileSize } from "../utils/file-helpers.ts";

/**
 * Hard cap on user-question length. The chat model tiers we ship have
 * context windows from 2 K (SmolLM2-1.7B) up to 32 K (LFM2-2.6B); we
 * reserve most of the smallest tier's window for the document anchor
 * + relevant excerpts + system prompt, leaving the question slot at
 * ~100-150 tokens. 500 characters is a comfortable English-prose cap
 * for that slot — long enough for a detailed multi-clause question,
 * short enough that the smallest tier never has to truncate retrieved
 * context to fit. The textarea's `maxLength` enforces the cap at the
 * keystroke level so users can't paste a 10 KB blob and trigger
 * silent context-window overflow downstream.
 */
const MAX_QUESTION_CHARS = 500;
/** Threshold at which the character counter switches to the amber "near limit" colour. */
const COUNTER_WARN_AT = 400;

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Pages cited as context for an assistant reply. */
  citedPages?: number[];
  /** `true` while the assistant message is still being streamed. */
  streaming?: boolean;
}

export default function AskPdf() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [indexing, setIndexing] = useState<IndexingProgress | null>(null);
  const [scannedHint, setScannedHint] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [variantPickerOpen, setVariantPickerOpen] = useState(false);

  const rag = useRagModels();

  const sessionRef = useRef<RagSession | null>(null);

  const pdf = usePdfFile({
    onReset: () => {
      setTurns([]);
      setScannedHint(false);
      setIndexing(null);
      setSessionReady(false);
      sessionRef.current = null;
    },
  });
  const task = useAsyncProcess();

  // Auto-scroll the conversation to the latest message. The trigger
  // collapses "number of turns" and "current-turn length" into one
  // primitive so the effect re-runs both on new turns and as tokens
  // stream into the in-progress assistant turn.
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const scrollTrigger = turns.length * 1_000_000 + (turns.at(-1)?.content.length ?? 0);
  useEffect(() => {
    if (scrollTrigger === 0) return;
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [scrollTrigger]);

  const dialogOpen =
    rag.status === "awaiting-consent" || rag.status === "downloading" || rag.status === "error";

  /** `true` while we're building the RAG session for the loaded PDF. */
  const isIndexing = indexing !== null;

  /**
   * Invalidate the RAG session whenever the user swaps chat tiers.
   * The session captured the previous chat pipeline by reference; that
   * pipeline gets `unloadModel`'d by `setChatVariant` so the next
   * `session.ask` would call into a disposed handle. Rebuilding is
   * cheap — the IndexedDB vector cache survives (embedder didn't
   * change) so it's a pipeline rewire, not a re-index.
   *
   * Chat turns are intentionally preserved: each question runs
   * through the graph independently, so the displayed history stays
   * coherent across a tier swap even though the answering model is
   * now different.
   */
  useEffect(() => {
    sessionRef.current = null;
    setSessionReady(false);
    setIndexing(null);
  }, [rag.chatVariant]);

  /**
   * Same idea, different trigger. The session also captures the
   * embedder + reranker pipes by reference; if `disposeAllModels` ran
   * (e.g. user clicked "Free model memory" mid-session) the rollup
   * status drops out of `"ready"` and every pipe handle the session
   * is holding becomes a disposed-runtime call waiting to happen.
   *
   * Clearing the session ref here makes the next "models ready"
   * transition rebuild the session against the fresh pipes — the
   * same code path that runs after the initial cold load.
   */
  useEffect(() => {
    if (rag.status !== "ready") {
      sessionRef.current = null;
      setSessionReady(false);
    }
  }, [rag.status]);

  /**
   * Build the RAG session as soon as the PDF is loaded *and* both
   * models are ready. Idempotent — re-renders short-circuit on
   * `sessionRef.current`.
   */
  useEffect(() => {
    if (!pdf.file) return;
    if (rag.status !== "ready") return;
    if (sessionRef.current || isIndexing || scannedHint) return;
    const file = pdf.file;
    void task.run(async () => {
      try {
        const { chat, embed, rerank } = await rag.ensureReady();
        const session = await createRagSession({
          chatPipe: chat,
          chatInfo: rag.chat.info,
          embedPipe: embed,
          rerankPipe: rerank,
          file,
          onIndexProgress: setIndexing,
        });
        sessionRef.current = session;
        setSessionReady(true);
        setIndexing(null);
      } catch (e) {
        setIndexing(null);
        if (e instanceof Error && /no usable text/i.test(e.message)) {
          setScannedHint(true);
          return;
        }
        throw e;
      }
    }, "Failed to index the PDF. Please try again.");
  }, [pdf.file, rag.status, rag, task, isIndexing, scannedHint]);

  const handleAsk = useCallback(async () => {
    if (!pdf.file || !sessionRef.current) return;
    const session = sessionRef.current;
    const q = question.trim();
    if (!q) return;

    const userId = `u-${Date.now()}`;
    const assistantId = `a-${Date.now()}`;
    setTurns((prev) => [
      ...prev,
      { id: userId, role: "user", content: q },
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ]);
    setQuestion("");

    await task.run(async () => {
      const result = await session.ask({
        question: q,
        onToken: (delta) => {
          setTurns((prev) =>
            prev.map((t) => (t.id === assistantId ? { ...t, content: t.content + delta } : t)),
          );
        },
      });
      setTurns((prev) =>
        prev.map((t) =>
          t.id === assistantId
            ? {
                ...t,
                content: result.answer,
                // Citation footer only makes sense for grounded answers
                // — chitchat and off-topic refusals don't reference
                // document pages, so we drop the field entirely for them.
                citedPages: result.intent === "question" ? result.citedPages : undefined,
                streaming: false,
              }
            : t,
        ),
      );
    }, "Failed to answer question. Please try again.");
  }, [pdf.file, question, task]);

  // On task error, mark any streaming assistant turn as failed.
  useEffect(() => {
    if (!task.error) return;
    setTurns((prev) =>
      prev.map((t) => (t.streaming ? { ...t, content: "", streaming: false } : t)),
    );
  }, [task.error]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleAsk();
      }
    },
    [handleAsk],
  );

  // RAM heads-up — always shown until the model is ready (warning
  // is moot at that point). We tried gating this on
  // `navigator.deviceMemory < 8` to hide it on machines that look
  // comfortable, but the signal is too unreliable to use as a
  // visibility switch:
  //   - Chrome caps the reading at 8 GB for privacy, so a 16 / 32 GB
  //     desktop reports the same value as an 8 GB one — we'd hide
  //     the hint on devices we can't actually verify.
  //   - Firefox / Safari don't ship the API at all (returns `null`).
  //
  // The detected RAM line still lives in `AiModelDetailsModal` for
  // users who want to inspect what we read; this surface just gives
  // every user the recommendation up-front. Mobile users never reach
  // this code — `App.tsx` short-circuits to a "desktop only" view
  // when `tool.desktopOnly` and `isMobileDevice()` both hold.
  const askPdfTool = findTool("ask-pdf");
  const ramRequirement = askPdfTool?.requirements ?? null;
  const showRamNote = ramRequirement !== null && rag.status !== "ready";

  return (
    <div className="space-y-6" data-rag-status={rag.status} data-rag-chat-status={rag.chat.status}>
      {showRamNote && (
        // Compact single-line RAM heads-up rendered at the *top* of
        // the tool so users see it before they bother uploading a
        // file — on a low-RAM device that decision matters before
        // the download cost is paid. Lives outside the file-state
        // conditional so it stays visible across the drop-zone /
        // gate / indexing / scanned-hint stages, and hides once the
        // model is loaded (warning is moot at that point).
        // Amber icon flags it as a "watch out", not a hard block —
        // users can still proceed.
        <p className="flex items-start gap-1.5 text-xs text-slate-500 dark:text-dark-text-muted px-1">
          <MemoryStick
            className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500 dark:text-amber-400"
            aria-hidden="true"
          />
          <span>
            {ramRequirement}. The two models load into memory together — lower-RAM devices may run
            slowly or close this tab during inference.
          </span>
        </p>
      )}

      {/*
        Sequential flow — gate first, PDF second.
        ─────────────────────────────────────────
        Old layout asked for a PDF upload *before* downloading the
        models, which meant the user committed a file (and looked at
        an unactionable "Loading…" state) before they'd even seen the
        download size or picked a chat tier. New layout walks the
        user through one step at a time:
            (1) gate card — tier picker + Download CTA
            (2) PDF drop zone — only shown once the rollup says all
                three pipelines are loaded
            (3) indexing card — while the embedder chunks the file
            (4) chat panel — with the composer enabled

        The gate's `ready`/`loading` overrides take the *rollup*
        status (`rag.status`) instead of just the chat status — that
        way the children only mount when every pipeline is actually
        usable, not the moment chat alone resolves. Without the
        override the gate would render an unusable chat panel during
        the brief window where chat is "ready" but embed/rerank are
        still mid-load (partial-cache return-visit edge case).
      */}
      <AiModelGate
        ai={rag.chat}
        models={[rag.chat.info, rag.embed.info, rag.rerank.info]}
        roles={["chat", "retrieval", "rerank"]}
        chatVariant={rag.chatVariant}
        onChatVariantChange={rag.setChatVariant}
        // Copy that matches the *current* state. The "Download AI
        // models…" headline only makes sense on a first-run download
        // (or an explicit re-download via the consent dialog); on a
        // returning visitor with the bytes already cached we're not
        // downloading, we're restoring — and the headline shouldn't
        // claim otherwise. Mapping by rollup status keeps the gate
        // honest across all three lifecycle paths the user can land
        // on (cold first-visit, warm reload, partial cache).
        title={
          rag.status === "loading"
            ? "Restoring AI models from your device cache…"
            : rag.status === "downloading"
              ? "Downloading AI models…"
              : "Download AI models to chat with your PDFs"
        }
        blurb={
          rag.status === "loading"
            ? "We're loading the models you already downloaded — no network needed. This usually takes a few seconds."
            : rag.status === "downloading"
              ? "Hang tight — the models are streaming into your browser cache. After this, every future visit loads in seconds."
              : "Ask your PDF runs entirely on your device. Pick a chat-model size below, download it once, then upload a PDF to start chatting."
        }
        ready={rag.status === "ready"}
        loading={
          rag.status === "downloading" ||
          rag.status === "loading" ||
          rag.status === "awaiting-consent"
        }
        // Gate's "Download model" click should kick off the actual
        // download for every pipeline in the bundle. We use
        // `rag.confirm` (not `rag.ensureReady`) deliberately:
        //
        //   - `ensureReady` would push each model through the
        //     `awaiting-consent` state and the user would have to
        //     click "Download model" *again* in the consent dialog
        //     that opens. Two identical buttons for the same
        //     decision is bad UX — the gate already shows the
        //     picker, the aggregate footprint, and a "View details"
        //     link covering everything the consent body would
        //     repeat. The dialog's job from here is just to show
        //     progress, not to gather a second confirmation.
        //   - `confirm` calls each sub-hook's confirm directly,
        //     which calls `startDownload` and flips status
        //     `idle → downloading` in one shot. The dialog opens
        //     in download state (per `dialogOpen` below covering
        //     `downloading`), the progress UI renders, no extra
        //     click needed.
        //   - Also fixes the partial-cache edge case
        //     (migrateLegacyChatReadyFlag clears the rerank flag
        //     once): confirm iterates all three sub-models, so
        //     even if chat is already cached and ready, embed +
        //     rerank still get a fresh startDownload call.
        onDownload={rag.confirm}
        // Storage actions in the gate-side details modal — covers
        // the "I freed memory and now I want to delete the disk
        // cache too" path without forcing the user to re-download
        // just to surface a delete button. canFreeMemory is false
        // here (gate only shows when not ready), so the dialog
        // hides Free Memory; canDelete may be true if disk cache
        // survives, so Delete appears when there's something to do.
        onFreeMemory={rag.dispose}
        onDeleteCachedModels={rag.evict}
        canFreeMemory={rag.canFreeMemory}
        canDelete={rag.canDelete}
      >
        {/* Children render only when all three models are ready. */}
        {pdf.file && (
          <FileInfoBar
            fileName={pdf.file.name}
            details={formatFileSize(pdf.file.size)}
            onChangeFile={pdf.reset}
          />
        )}

        {!pdf.file ? (
          <FileDropZone
            glowColor={categoryGlow.transform}
            iconColor={categoryAccent.transform}
            accept=".pdf,application/pdf"
            onFiles={pdf.onFiles}
            encryptedFile={pdf.encryptedFile}
            onClearEncrypted={pdf.reset}
            label="Drop a PDF file here"
            hint="Models are ready — drop a PDF to start chatting"
          />
        ) : scannedHint ? (
          <InfoCallout icon={ScanSearch} title="Couldn't extract any text" accent="warning">
            This PDF has no usable text — even after OCR. It may be encrypted, password-protected,
            or low-resolution. Try a different file.
          </InfoCallout>
        ) : isIndexing ? (
          <IndexingCard progress={indexing} />
        ) : (
          <>
            <ChatPanel
              turns={turns}
              scrollAnchorRef={scrollAnchorRef}
              composer={
                <Composer
                  value={question}
                  onChange={setQuestion}
                  onKeyDown={onKeyDown}
                  onSubmit={handleAsk}
                  disabled={task.processing || !sessionReady}
                  placeholder="Ask something about this PDF…"
                  busyLabel={task.processing ? "Thinking…" : "Preparing…"}
                />
              }
            />
            {/*
              Persistent caveat shown beneath the chat panel while
              chatting. On-device chat models in the 1-3 B range
              occasionally misread digits, mis-attribute facts, or
              paraphrase loosely — true across all the tiers we ship
              today. Users should treat answers as a search assist,
              not as authoritative extracts.
            */}
            <p className="flex items-start gap-1.5 text-xs text-slate-500 dark:text-dark-text-muted px-1">
              <AlertTriangle
                className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500 dark:text-amber-400"
                aria-hidden="true"
              />
              <span>
                AI answers may be inaccurate — always verify against the source document before
                relying on them.
              </span>
            </p>
          </>
        )}
      </AiModelGate>

      {/*
        Single storage / status bar at the bottom, shown only when
        the rollup says everything is ready. While the gate is up
        the gate itself surfaces "View details" + the same storage
        actions, so a second bar would just stack two model-info
        widgets on top of each other.
      */}
      {rag.status === "ready" && (
        <ActiveModelBar
          models={[rag.chat.info, rag.embed.info, rag.rerank.info]}
          roles={["chat", "retrieval", "rerank"]}
          ready
          onChange={() => setVariantPickerOpen(true)}
          disabled={task.processing || isIndexing}
          onFreeMemory={rag.dispose}
          onDeleteCachedModels={rag.evict}
          canFreeMemory={rag.canFreeMemory}
          canDelete={rag.canDelete}
        />
      )}

      {task.error && <AlertBox message={task.error} />}

      <AiConsentModal
        open={dialogOpen}
        models={[rag.chat.info, rag.embed.info, rag.rerank.info]}
        roles={["chat", "retrieval", "rerank"]}
        status={rag.status}
        progress={rag.progress}
        // Per-model arrays parallel to `models` — drive the per-model
        // breakdown beneath the overall bar so users see *which*
        // pipeline the current bytes are flowing into.
        perModelStatus={[rag.chat.status, rag.embed.status, rag.rerank.status]}
        perModelProgress={[rag.chat.progress, rag.embed.progress, rag.rerank.progress]}
        error={rag.error}
        onConfirm={rag.confirm}
        onRetry={rag.retry}
        onCancel={rag.cancel}
      />

      <ChatModelPickerModal
        open={variantPickerOpen}
        current={rag.chatVariant}
        onConfirm={(next) => {
          rag.setChatVariant(next);
          setVariantPickerOpen(false);
        }}
        onCancel={() => setVariantPickerOpen(false)}
      />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

/**
 * Centred card shown while the RAG index is being built for the
 * uploaded PDF. Replaces the previous inline `<ProgressBar>` + disabled
 * composer combo, which looked like a frozen chat with a tiny progress
 * detail tacked above it. Now it's a single dominant card: the user
 * sees one focused state instead of a half-rendered chat UI.
 *
 * The stage label maps the underlying {@link IndexingProgress} kind
 * to a sentence that explains what's happening *to the user*, not in
 * pipeline terms ("extract" / "embed" become "Reading text" /
 * "Building search index").
 */
function IndexingCard({ progress }: { progress: IndexingProgress | null }) {
  const { label, hint } = describeIndexProgress(progress);
  // **Why a custom bar instead of `<ProgressBar>`**: the indexing
  // pipeline runs in two distinct phases (`extract` then `embed`),
  // each with its own current/total. Using `<ProgressBar>` per phase
  // means the bar climbs to ~100 % during extract, *resets to 0 %* the
  // moment embed starts, then snaps to 100 % at the end — visually
  // the bar moves backwards. We compute a single monotonic percent
  // across both phases here and let the label carry the per-phase
  // "(3/4)" detail.
  const percent = overallIndexingPercent(progress);
  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-slate-200 dark:border-dark-border shadow-sm p-6">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400"
        >
          <Database className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-dark-text">
            Preparing your document
          </p>
          <p className="text-xs text-slate-500 dark:text-dark-text-muted mt-1 leading-relaxed">
            {hint} This happens once per PDF — re-opening the same file later is instant.
          </p>
        </div>
      </div>
      <div className="mt-5 space-y-2">
        <div className="flex justify-between text-sm text-slate-600 dark:text-dark-text-muted">
          <span className="min-w-0 truncate pr-2">{label}</span>
          <span className="tabular-nums shrink-0">{percent}%</span>
        </div>
        <div className="w-full bg-slate-200 dark:bg-dark-border rounded-full h-2 overflow-hidden">
          {/* No CSS transition: the bar snaps to the new width in
              the same React render that updates the percent text. A
              300ms `transition-[width]` was causing the bar's visual
              fill to lag the displayed percent — bar at ~50 % while
              the label already read 62 %, which looks broken. Embed
              batches fire every couple of seconds so a snap reads as
              progress, not a glitch. */}
          <div className="bg-primary-600 h-2 rounded-full" style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
}

/**
 * Map the phase-specific {@link IndexingProgress} onto a single
 * monotonic 0–100 progress percent.
 *
 * **Weight choice** (extract = 30 %, embed = 70 %): on a typical
 * text-layer PDF, extraction is fast (a few ms per page) while
 * embedding is the long pole — each batch is a WASM forward pass
 * against a 309 MB int8 model. Roughly matches the wall-clock split
 * we see on the résumé fixture. OCR-heavy PDFs invert this, but we
 * accept the small lie there because OCR users see the dedicated
 * "Running OCR on scanned pages…" label and know it's slow.
 */
function overallIndexingPercent(progress: IndexingProgress | null): number {
  if (!progress) return 0;
  const ratio = progress.total > 0 ? Math.min(1, progress.current / progress.total) : 0;
  if (progress.kind === "extract") return Math.round(ratio * 30);
  return Math.round(30 + ratio * 70);
}

function describeIndexProgress(progress: IndexingProgress | null): {
  label: string;
  hint: string;
} {
  if (!progress) {
    return {
      label: "Starting…",
      hint: "Reading text from the PDF and building a search index so the assistant can answer questions about it.",
    };
  }
  if (progress.kind === "extract") {
    return progress.phase === "ocr"
      ? {
          label: `Running OCR on scanned pages (${progress.current}/${progress.total})…`,
          hint: "Pages without a text layer are being read with OCR — slower than plain text, but the answers will be just as grounded.",
        }
      : {
          label: `Reading PDF text (${progress.current}/${progress.total})…`,
          hint: "Extracting the text layer from your PDF so the assistant has something to search.",
        };
  }
  return {
    label: `Building search index (${progress.current}/${progress.total} chunks)…`,
    hint: "Turning the text into vectors the assistant can search through when you ask a question.",
  };
}

/**
 * Bounded chat panel: a flex column that fills available vertical
 * space within sensible bounds, with the conversation scrolling
 * *inside* the panel and the composer anchored at the bottom edge.
 *
 * Why a bounded panel instead of a sticky composer with page-level
 * scroll:
 *
 *   - The composer never visually jumps when the user scrolls back to
 *     re-read an earlier turn — page scroll stops at the panel's
 *     edges.
 *   - As more turns accumulate the panel never pushes other tool
 *     chrome (FileInfoBar / ActiveModelBar) off-screen — they stay
 *     pinned, which matches what users expect from a chat surface.
 *   - The visual frame creates a clear "this is a conversation"
 *     affordance vs. the plain document flow the page uses elsewhere.
 *
 * Heights are responsive: on phones the panel caps at ~60 svh / 520 px
 * so the composer (the primary interaction) stays above the fold even
 * with the title block + file-info card stacked above. At `sm:` and up
 * we relax to the original 72 svh / 720 px envelope where there's more
 * viewport to spend on transcript history.
 */
function ChatPanel({
  turns,
  composer,
  scrollAnchorRef,
}: {
  turns: ChatTurn[];
  composer: React.ReactNode;
  scrollAnchorRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="flex flex-col h-[min(58svh,520px)] min-h-80 sm:h-[min(72svh,720px)] sm:min-h-115 rounded-2xl border border-slate-200 dark:border-dark-border bg-slate-50/70 dark:bg-dark-bg/60 overflow-hidden">
      {/* `thin-scrollbar` matches the scrollbar idiom used in modals
          (AiConsentModal, AiModelDetailsModal, ToolPickerModal) so
          the chat panel doesn't read as a different surface from the
          rest of the app's overflow containers. */}
      <div className="flex-1 overflow-y-auto thin-scrollbar px-4 py-4">
        {turns.length === 0 ? (
          <EmptyChatHint />
        ) : (
          <div className="space-y-3">
            {turns.map((turn) => (
              <Bubble key={turn.id} turn={turn} />
            ))}
            <div ref={scrollAnchorRef} />
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface">
        {composer}
      </div>
    </div>
  );
}

/**
 * Placeholder shown when there are no turns yet. Lives in the same
 * scroll area the conversation will populate so the panel doesn't
 * collapse to a hairline before the first question.
 */
function EmptyChatHint() {
  // On mobile the panel is short, so we top-anchor the hint (small
  // top padding) — vertical-centring in a 520 px box leaves the hint
  // floating in the middle of empty grey, which reads as "broken" on
  // a phone. On `sm:` and up the panel is taller and centring looks
  // intentional, so we flip back to `justify-center`.
  return (
    <div className="h-full flex flex-col items-center justify-start sm:justify-center text-center px-6 pt-10 sm:pt-0">
      <span
        aria-hidden="true"
        className="w-10 h-10 rounded-full flex items-center justify-center bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 mb-3"
      >
        <Sparkles className="w-4 h-4" />
      </span>
      <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
        Ready to chat about this PDF
      </p>
      <p className="text-xs text-slate-500 dark:text-dark-text-muted mt-1 max-w-xs leading-relaxed">
        Ask anything about the document&apos;s contents. Answers are generated on-device and stay
        grounded in the uploaded file.
      </p>
    </div>
  );
}

/**
 * Markdown renderer for assistant turns. Wraps `react-markdown` with a
 * minimal Tailwind component map so the rendered output inherits the
 * bubble's typography instead of `react-markdown`'s default unstyled
 * HTML. `remark-gfm` enables tables, task lists, strikethrough, and
 * autolinks — features the prompt allows the model to use when the
 * question warrants.
 *
 * **Safety**: `react-markdown` does NOT render raw HTML by default,
 * so even if the chat model emits a `<script>` tag verbatim it lands
 * as literal text in the DOM. We do not add `rehype-raw`. The model
 * output is the only untrusted input on this path.
 */
function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed text-slate-800 dark:text-dark-text wrap-anywhere">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="list-disc list-outside pl-5 mb-2 last:mb-0 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside pl-5 mb-2 last:mb-0 space-y-1">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          h1: ({ children }) => <h3 className="font-semibold text-base mb-1.5">{children}</h3>,
          h2: ({ children }) => <h3 className="font-semibold text-base mb-1.5">{children}</h3>,
          h3: ({ children }) => <h3 className="font-semibold text-base mb-1.5">{children}</h3>,
          code: ({ children }) => (
            <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-dark-bg text-xs font-mono">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="my-2 p-3 rounded-lg bg-slate-100 dark:bg-dark-bg text-xs font-mono overflow-x-auto">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-slate-300 dark:border-dark-border pl-3 italic text-slate-600 dark:text-dark-text-muted my-2">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              className="text-primary-600 dark:text-primary-400 underline underline-offset-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="my-3 border-slate-200 dark:border-dark-border" />,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="text-xs border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-slate-200 dark:border-dark-border px-2 py-1 font-semibold text-left">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-slate-200 dark:border-dark-border px-2 py-1">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function Bubble({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === "user";
  return (
    // `data-bubble` is the stable hook the e2e probe uses to count
    // turns and find the last assistant reply. Without it the tests
    // would have to grep Tailwind class names — exactly the coupling
    // that broke when we swapped the assistant rendering from plain
    // `<p whitespace-pre-wrap>` to markdown components.
    //
    // `data-streaming` toggles to "true" while a token stream is in
    // flight so tests can wait for it to clear (and a screen reader
    // can interpret aria-busy from the same primitive).
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
      data-bubble={turn.role}
      data-streaming={turn.streaming ? "true" : "false"}
      aria-busy={turn.streaming ? true : undefined}
    >
      <span
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5 ${
          isUser
            ? "bg-primary-600 text-white"
            : "bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400"
        }`}
        aria-hidden="true"
      >
        {isUser ? <User className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
      </span>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-primary-600 text-white rounded-tr-md"
            : "bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border text-slate-800 dark:text-dark-text rounded-tl-md"
        }`}
      >
        {turn.streaming && !turn.content ? (
          <span className="inline-flex items-center gap-2 text-slate-500 dark:text-dark-text-muted">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Thinking…
          </span>
        ) : isUser ? (
          // User turns are plain text — we don't want their question
          // rendered as markdown (a stray "#" or "*" should appear
          // verbatim). Whitespace-pre-wrap keeps any line breaks
          // the user typed with Shift+Enter.
          <p className="whitespace-pre-wrap wrap-anywhere">{turn.content}</p>
        ) : (
          // Assistant turns are markdown — the prompt allows the model
          // to use lists, headings, bold, and code spans when the
          // question warrants. The caret lives outside the markdown
          // so a partial token stream (e.g. an unfinished `**bold**`)
          // doesn't disturb the streaming indicator.
          <AssistantMarkdown content={turn.content} />
        )}
        {!isUser && turn.streaming && turn.content && (
          <span
            aria-hidden="true"
            className="inline-block w-1.5 h-4 ml-0.5 -mb-0.5 align-middle bg-current opacity-60 animate-pulse"
          />
        )}
        {!isUser && turn.citedPages && turn.citedPages.length > 0 && !turn.streaming && (
          <p className="mt-2 pt-2 border-t border-slate-100 dark:border-dark-border/60 text-xs text-slate-400 dark:text-dark-text-muted">
            Context from {turn.citedPages.length === 1 ? "page" : "pages"}{" "}
            {turn.citedPages.join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}

function Composer({
  value,
  onChange,
  onKeyDown,
  onSubmit,
  disabled,
  placeholder,
  busyLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  disabled: boolean;
  placeholder?: string;
  busyLabel?: string;
}) {
  // The composer is rendered *inside* the `ChatPanel`'s flex column,
  // anchored to the panel's bottom edge. It no longer needs `sticky`
  // positioning, a border, or a card shadow — the panel provides all
  // of those. We keep just the padding so the textarea has room to
  // breathe.
  return (
    <div className="p-3">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={placeholder ?? "Ask something about this PDF…"}
        rows={2}
        maxLength={MAX_QUESTION_CHARS}
        // `thin-scrollbar` matches the styled scrollbar used elsewhere
        // (modals, chat panel) so a long pasted question scrolls
        // inside the textarea consistently with the rest of the app.
        className="thin-scrollbar w-full resize-none bg-transparent text-sm text-slate-800 dark:text-dark-text placeholder-slate-400 dark:placeholder-dark-text-muted focus-visible:outline-none disabled:opacity-50"
      />
      <div className="flex items-center justify-between gap-3 mt-2 pt-2 border-t border-slate-100 dark:border-dark-border/60">
        <p className="text-xs text-slate-400 dark:text-dark-text-muted hidden sm:block">
          Press{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-dark-bg text-slate-600 dark:text-dark-text-muted font-mono">
            Enter
          </kbd>{" "}
          to send,{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-dark-bg text-slate-600 dark:text-dark-text-muted font-mono">
            Shift+Enter
          </kbd>{" "}
          for a new line.
        </p>
        {/* Character counter — hidden until the user is close to the
            limit so it doesn't clutter the composer during normal use.
            Switches to amber once `COUNTER_WARN_AT` is reached so the
            constraint feels advisory rather than punitive. Tabular
            numerals keep the count from jiggling as digits change. */}
        {value.length >= COUNTER_WARN_AT && (
          <span
            aria-live="polite"
            className={`text-xs tabular-nums ${
              value.length >= MAX_QUESTION_CHARS
                ? "text-amber-600 dark:text-amber-400 font-medium"
                : "text-amber-500 dark:text-amber-400"
            }`}
          >
            {value.length}/{MAX_QUESTION_CHARS}
          </span>
        )}
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
          className="inline-flex items-center gap-1.5 ml-auto px-4 py-2 rounded-lg text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {disabled ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {busyLabel ?? "Thinking…"}
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Send
            </>
          )}
        </button>
      </div>
    </div>
  );
}
