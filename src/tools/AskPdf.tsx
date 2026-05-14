/**
 * Ask PDF — chat-style Q&A over the document text using a small,
 * on-device LLM with embedding-based RAG retrieval.
 *
 * Per file (once):
 *
 *   1. Hash the bytes (SHA-256) → use as cache key.
 *   2. If a cached vector store exists in IndexedDB, load it. Done.
 *   3. Otherwise, extract text per page (text layer; OCR fallback for
 *      scanned pages), chunk by sentence, embed every chunk with the
 *      MiniLM model, and persist the resulting vector store.
 *
 * Per question:
 *
 *   1. Embed the question.
 *   2. Cosine top-K against the chunk vectors.
 *   3. Build a context block in page-number order.
 *   4. Stream the chat model's reply with the context + question.
 *
 * The model and pipeline shape are abstracted away — to swap either
 * the chat LLM or the embedder, edit its entry in {@link AI_MODELS};
 * this file stays put.
 */
import { Loader2, ScanSearch, Send, Sparkles, User } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActiveModelBar } from "../components/ActiveModelBar.tsx";
import { AiConsentDialog } from "../components/AiConsentDialog.tsx";
import { AiModelGate } from "../components/AiModelGate.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { InfoCallout } from "../components/InfoCallout.tsx";
import { ProgressBar } from "../components/ProgressBar.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { usePdfFile } from "../hooks/usePdfFile.ts";
import { useRagModels } from "../hooks/useRagModels.ts";
import { type ChatMessage, runChat, runEmbed } from "../utils/ai-tasks.ts";
import { chunkPages, extractPdfText } from "../utils/ocr-text.ts";
import { formatFileSize } from "../utils/file-helpers.ts";
import {
  buildVectorStore,
  cacheStore,
  getCachedStore,
  sha256Hex,
  topK,
  type VectorStore,
} from "../utils/vector-store.ts";

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Pages cited as context for an assistant reply. */
  citedPages?: number[];
  /** `true` while the assistant message is still being streamed. */
  streaming?: boolean;
}

const SYSTEM_PROMPT = [
  "You are a careful assistant answering questions about a PDF document.",
  "Use ONLY the information in the provided Context to answer.",
  'If the answer is not in the Context, reply exactly: "I could not find that in this document."',
  "Cite page numbers in parentheses when relevant. Keep answers concise (1–4 sentences).",
].join(" ");

/** How many chunks to retrieve per question. */
const TOP_K = 6;

/** Indexing-phase progress reported to the UI. */
type IndexProgress =
  | { kind: "extract"; phase: "text-layer" | "ocr"; current: number; total: number }
  | { kind: "embed"; current: number; total: number };

export default function AskPdf() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [indexing, setIndexing] = useState<IndexProgress | null>(null);
  const [scannedHint, setScannedHint] = useState(false);

  const rag = useRagModels();

  const pdf = usePdfFile({
    onReset: () => {
      setTurns([]);
      setScannedHint(false);
      setIndexing(null);
      storeRef.current = null;
    },
  });
  const task = useAsyncProcess();

  /**
   * Cached vector store for the currently-loaded PDF. Cleared when
   * the user swaps files. We rebuild from IndexedDB on the first
   * question after a file load.
   */
  const storeRef = useRef<VectorStore | null>(null);

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

  /**
   * Build (or load from cache) the vector store for `file`. Idempotent
   * — subsequent questions on the same file hit `storeRef` and skip.
   */
  const ensureStore = useCallback(
    async (file: File, embedPipe: object): Promise<VectorStore | null> => {
      if (storeRef.current) return storeRef.current;

      const bytes = await file.arrayBuffer();
      const documentId = await sha256Hex(bytes);

      const cached = await getCachedStore(documentId);
      if (cached) {
        storeRef.current = cached;
        return cached;
      }

      setIndexing({ kind: "extract", phase: "text-layer", current: 0, total: 1 });
      const pages = await extractPdfText(file, {
        onProgress: (info) => {
          setIndexing({
            kind: "extract",
            phase: info.phase,
            current: info.current,
            total: info.total,
          });
        },
      });

      const hasAnyText = pages.some((p) => p.text.trim().length > 0);
      if (!hasAnyText) {
        setScannedHint(true);
        setIndexing(null);
        return null;
      }

      const chunks = chunkPages(pages, 700, 100);
      if (chunks.length === 0) {
        setScannedHint(true);
        setIndexing(null);
        return null;
      }

      // Batch the embedder to keep the UI responsive on large PDFs.
      // 32-chunk batches are a reasonable middle ground between
      // throughput and per-step latency for MiniLM in WASM.
      const BATCH = 32;
      setIndexing({ kind: "embed", current: 0, total: chunks.length });
      const vectors: Float32Array[] = [];
      for (let i = 0; i < chunks.length; i += BATCH) {
        const slice = chunks.slice(i, i + BATCH);
        const batchVecs = await runEmbed(
          embedPipe,
          slice.map((c) => c.text),
        );
        vectors.push(...batchVecs);
        setIndexing({
          kind: "embed",
          current: Math.min(i + BATCH, chunks.length),
          total: chunks.length,
        });
      }

      const store = buildVectorStore(documentId, chunks, vectors);
      storeRef.current = store;
      void cacheStore(store);
      setIndexing(null);
      return store;
    },
    [],
  );

  const handleAsk = useCallback(async () => {
    if (!pdf.file) return;
    const file = pdf.file;
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
      let pipes: Awaited<ReturnType<typeof rag.ensureReady>>;
      try {
        pipes = await rag.ensureReady();
      } catch (e) {
        if (e instanceof Error && e.message === "cancelled") {
          setTurns((prev) => prev.filter((t) => t.id !== userId && t.id !== assistantId));
          return;
        }
        throw e;
      }

      const store = await ensureStore(file, pipes.embed);
      if (!store) {
        setTurns((prev) => prev.filter((t) => t.id !== userId && t.id !== assistantId));
        return;
      }

      const [queryVec] = await runEmbed(pipes.embed, [q]);
      const hits = topK(store, queryVec, TOP_K);
      if (hits.length === 0) {
        throw new Error("Couldn't find any relevant chunks for that question.");
      }

      // Order context by page number so the prompt reads top-to-bottom.
      const ordered = [...hits].sort((a, b) => a.chunk.pageNumber - b.chunk.pageNumber);
      const citedPages = [...new Set(ordered.map((h) => h.chunk.pageNumber))];
      const contextBlock = ordered
        .map((h) => `[Page ${h.chunk.pageNumber}]\n${h.chunk.text.trim()}`)
        .join("\n\n");

      const messages: ChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Context (from the PDF):\n${contextBlock}\n\nQuestion: ${q}`,
        },
      ];

      const reply = await runChat(pipes.chat, messages, {
        maxNewTokens: 512,
        onToken: (delta) => {
          setTurns((prev) =>
            prev.map((t) => (t.id === assistantId ? { ...t, content: t.content + delta } : t)),
          );
        },
      });

      setTurns((prev) =>
        prev.map((t) =>
          t.id === assistantId ? { ...t, content: reply, citedPages, streaming: false } : t,
        ),
      );
    }, "Failed to answer question. Please try again.");
  }, [pdf.file, question, rag, task, ensureStore]);

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

  return (
    <div className="space-y-6">
      {!pdf.file ? (
        <FileDropZone
          glowColor={categoryGlow.transform}
          iconColor={categoryAccent.transform}
          accept=".pdf,application/pdf"
          onFiles={pdf.onFiles}
          label="Drop a PDF file here"
          hint="Chat with your PDF — answers are generated on-device, never uploaded"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={pdf.file.name}
            details={formatFileSize(pdf.file.size)}
            onChangeFile={pdf.reset}
          />

          {scannedHint ? (
            <InfoCallout icon={ScanSearch} title="Couldn't extract any text" accent="warning">
              This PDF has no usable text — even after OCR. It may be encrypted, password-protected,
              or low-resolution. Try a different file.
            </InfoCallout>
          ) : (
            <>
              <ConversationView turns={turns} scrollAnchorRef={scrollAnchorRef} />

              {indexing && <IndexProgressBar progress={indexing} />}

              <AiModelGate
                ai={rag.chat}
                title="Download AI models to start chatting"
                blurb="Two small models load together: a chat model (~250 MB) and an embedder (~25 MB). Both run entirely in your browser; your PDFs are never uploaded."
              >
                <Composer
                  value={question}
                  onChange={setQuestion}
                  onKeyDown={onKeyDown}
                  onSubmit={handleAsk}
                  disabled={task.processing}
                />
              </AiModelGate>

              <ActiveModelBar info={rag.chat.info} ready={rag.status === "ready"} />
            </>
          )}
        </>
      )}

      {task.error && <AlertBox message={task.error} />}

      <AiConsentDialog
        open={dialogOpen}
        info={rag.chat.info}
        status={rag.status}
        progress={rag.progress}
        error={rag.error}
        onConfirm={rag.confirm}
        onRetry={rag.retry}
        onCancel={rag.cancel}
      />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function IndexProgressBar({ progress }: { progress: IndexProgress }) {
  const label =
    progress.kind === "extract"
      ? progress.phase === "ocr"
        ? `Running OCR on scanned pages (${progress.current}/${progress.total})…`
        : `Reading PDF text (${progress.current}/${progress.total})…`
      : `Indexing chunks (${progress.current}/${progress.total})…`;
  return <ProgressBar current={progress.current} total={progress.total} label={label} />;
}

function ConversationView({
  turns,
  scrollAnchorRef,
}: {
  turns: ChatTurn[];
  scrollAnchorRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (turns.length === 0) return null;
  return (
    <div className="space-y-3">
      {turns.map((turn) => (
        <Bubble key={turn.id} turn={turn} />
      ))}
      <div ref={scrollAnchorRef} />
    </div>
  );
}

function Bubble({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
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
        ) : (
          <p className="whitespace-pre-wrap wrap-anywhere">
            {turn.content}
            {turn.streaming && (
              <span
                aria-hidden="true"
                className="inline-block w-1.5 h-4 ml-0.5 -mb-0.5 align-middle bg-current opacity-60 animate-pulse"
              />
            )}
          </p>
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
}: {
  value: string;
  onChange: (next: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  return (
    <div className="sticky bottom-2 bg-white dark:bg-dark-surface rounded-2xl border border-slate-200 dark:border-dark-border shadow-sm p-3">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder="Ask something about this PDF…"
        rows={2}
        className="w-full resize-none bg-transparent text-sm text-slate-800 dark:text-dark-text placeholder-slate-400 dark:placeholder-dark-text-muted focus-visible:outline-none disabled:opacity-50"
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
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
          className="inline-flex items-center gap-1.5 ml-auto px-4 py-2 rounded-lg text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {disabled ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Thinking…
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
