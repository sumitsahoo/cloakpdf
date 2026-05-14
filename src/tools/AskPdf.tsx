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
import { Database, Loader2, ScanSearch, Send, Sparkles, User } from "lucide-react";
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
import { createRagSession, type IndexingProgress, type RagSession } from "../rag/index.ts";
import { formatFileSize } from "../utils/file-helpers.ts";

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
        const { chat, embed } = await rag.ensureReady();
        const session = await createRagSession({
          chatPipe: chat,
          embedPipe: embed,
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
              <AiModelGate
                ai={rag.chat}
                title="Download AI models to start chatting"
                blurb="Two small models load together: a chat model and an embedder. Both run entirely in your browser; your PDFs are never uploaded."
              >
                {/*
                  Three mutually-exclusive states once the models are
                  ready: indexing the PDF, then chatting. We render only
                  one at a time so the user isn't looking at a frozen
                  composer next to a tiny progress bar.
                */}
                {isIndexing ? (
                  <IndexingCard progress={indexing} />
                ) : (
                  <>
                    <ConversationView turns={turns} scrollAnchorRef={scrollAnchorRef} />
                    <Composer
                      value={question}
                      onChange={setQuestion}
                      onKeyDown={onKeyDown}
                      onSubmit={handleAsk}
                      disabled={task.processing || !sessionReady}
                      placeholder="Ask something about this PDF…"
                      busyLabel={task.processing ? "Thinking…" : "Preparing…"}
                    />
                  </>
                )}
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
      <div className="mt-5">
        <ProgressBar current={progress?.current ?? 0} total={progress?.total ?? 1} label={label} />
      </div>
    </div>
  );
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
  return (
    <div className="sticky bottom-2 bg-white dark:bg-dark-surface rounded-2xl border border-slate-200 dark:border-dark-border shadow-sm p-3">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={placeholder ?? "Ask something about this PDF…"}
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
