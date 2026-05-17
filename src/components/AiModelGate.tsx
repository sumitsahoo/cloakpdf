/**
 * Inline gate shown in place of an AI tool's controls until the model
 * is ready. Renders a compact model summary + "Download model" CTA when
 * the pipeline hasn't been loaded yet; otherwise renders `children`.
 *
 * Use this to ensure the user *opts in* to a model download before the
 * tool's main UI becomes interactive — the alternative (popping the
 * consent dialog on every action click) hides the cost of the feature
 * until the user is already committed to running it.
 *
 * The gate auto-triggers `ensureReady()` for returning visitors whose
 * browser already cached the model bytes — they see a brief "Loading…"
 * state and never have to click anything.
 *
 * The progress, error, and confirmation UI continue to live in
 * {@link AiConsentModal} (rendered by the tool) — the gate is just
 * the entry point.
 *
 * **Two-model support.** Ask PDF needs a chat LLM *and* an embedder.
 * Pass both via `models`; the gate shows the aggregate footprint and
 * a "View details" link that opens {@link AiModelDetailsModal} for
 * the full per-model breakdown. The CTA still drives `ai.ensureReady()`
 * — the *primary* hook is expected to be the rollup (e.g. `rag.chat`)
 * whose `ensureReady` kicks off both downloads (see useRagModels).
 */
import { Cpu, Download, Loader2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { UseAiModelReturn } from "../hooks/useAiModel.ts";
import { type AiModelInfo, type ChatVariantId, formatApproxSize } from "../utils/ai-models.ts";
import { isModelMarkedReady } from "../utils/ai-runtime.ts";
import { AiModelDetailsModal } from "./AiModelDetailsModal.tsx";
import { ChatModelPicker } from "./ChatModelPicker.tsx";

interface AiModelGateProps {
  ai: UseAiModelReturn;
  /**
   * Full model roster to surface in the details modal — typically
   * `[chat.info, embed.info]` for a RAG tool. When omitted falls back
   * to `[ai.info]` and the details link still works (single-model
   * variant of the same modal).
   */
  models?: AiModelInfo[];
  /**
   * Optional role labels matching `models` by index, e.g.
   * `["chat", "retrieval"]`. Surfaces *what* each model does in the
   * details modal.
   */
  roles?: string[];
  /**
   * Active chat tier — when provided alongside {@link onChatVariantChange}
   * the gate renders a tier picker above the download button so the
   * user picks *before* committing to a download. Omitting either
   * prop falls back to the single-tier layout used by tools that
   * don't expose tier choice.
   */
  chatVariant?: ChatVariantId;
  /** Fires when the user picks a different chat tier. */
  onChatVariantChange?: (next: ChatVariantId) => void;
  /** Headline shown on the gate card. */
  title?: string;
  /** Lead-in sentence. Aggregate footprint and details link are appended. */
  blurb?: string;
  /**
   * Optional "all required pipelines are ready" override. Without
   * this, the gate decides whether to render children purely from
   * `ai.status === "ready"` — fine for single-model tools, wrong for
   * multi-model tools where `ai` is just one of N pipelines (chat,
   * say) and the others might still be loading. Pass the rollup
   * status from {@link useRagModels} (or equivalent) here so the
   * gate waits for the full set.
   */
  ready?: boolean;
  /**
   * Optional "any required pipeline is mid-load" override. Same
   * rationale as {@link ready} — the gate's "Loading model…" button
   * state should reflect the rollup, not just the chat slot.
   */
  loading?: boolean;
  /**
   * Release in-tab pipelines (RAM only). Passed through to the gate's
   * "View details" modal so users in the post-dispose-with-cache
   * state (gate visible because not loaded, but disk still cached)
   * can still surface storage actions one click away.
   */
  onFreeMemory?: () => void | Promise<unknown>;
  /**
   * Destructive: also evict CacheStorage bytes + clear consent flags.
   * Passed through to the gate's details modal. See
   * {@link onFreeMemory} for why this lives on the gate too.
   */
  onDeleteCachedModels?: () => void | Promise<unknown>;
  /** `true` if there's RAM-resident state for "Free memory" to free. */
  canFreeMemory?: boolean;
  /** `true` if there's anything cached on disk or in RAM for "Delete" to evict. */
  canDelete?: boolean;
  /**
   * Overrides what the gate's "Download model" button calls when
   * clicked. Defaults to `ai.ensureReady()` — fine for single-model
   * tools. Multi-model tools should pass the rollup ensure-ready
   * (e.g. `rag.ensureReady`) so the button triggers consent for
   * every required pipeline, not just `ai`. Without this override
   * a partial-cache state (some models flagged ready, some not)
   * would leave the user stuck: clicking Download would no-op on
   * the already-ready primary model and never open the consent
   * dialog for the rest.
   */
  onDownload?: () => Promise<unknown> | void;
  /** Tool controls — rendered once the model is ready. */
  children: ReactNode;
}

export function AiModelGate({
  ai,
  models,
  roles,
  chatVariant,
  onChatVariantChange,
  title = "Download AI model to continue",
  blurb = "Runs entirely in your browser; your PDFs are never uploaded.",
  ready: readyOverride,
  loading: loadingOverride,
  onFreeMemory,
  onDeleteCachedModels,
  canFreeMemory,
  canDelete,
  onDownload,
  children,
}: AiModelGateProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Returning-visitor auto-load. Triggers exactly once per mount when
  // the localStorage hint says the model has been downloaded before.
  // First-time visitors stay on the gate card until they click Download.
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (autoLoadedRef.current) return;
    if (ai.status !== "idle") return;
    if (!isModelMarkedReady(ai.info.id)) return;
    autoLoadedRef.current = true;
    ai.ensureReady().catch(() => {
      // Failure flows through `ai.error`; the dialog renders retry UI.
    });
  }, [ai]);

  // "Ready" decides whether to render children. For multi-model tools
  // the caller passes the rollup status (e.g. `rag.status === "ready"`)
  // so the gate waits for all pipelines, not just chat. Without that
  // override we fall back to the single-model semantics.
  const ready = readyOverride ?? ai.status === "ready";
  if (ready) return <>{children}</>;

  // `loading` covers every transient state where the consent flow has
  // started: explicit download, cache-warm load (no network), and the
  // brief window between "consent given" and "first byte fetched".
  // The dialog handles the visible progress for downloads — here we
  // just want the gate button to read "Loading model…" so the
  // interaction is consistent across both code paths. Caller can
  // override with the rollup loading-state for multi-model gates.
  const loading =
    loadingOverride ??
    (ai.status === "downloading" || ai.status === "loading" || ai.status === "awaiting-consent");

  const modelList = models && models.length > 0 ? models : [ai.info];
  const totalBytes = modelList.reduce((sum, m) => sum + m.approxSizeBytes, 0);
  const summary =
    modelList.length > 1
      ? `${modelList.length} small models load together — about ${formatApproxSize(totalBytes)} total.`
      : `${ai.info.displayName} (~${formatApproxSize(ai.info.approxSizeBytes)}).`;

  // Tier picker is opt-in: both `chatVariant` and `onChatVariantChange`
  // must be supplied (single-tier callers — e.g. tools that don't
  // expose a chat-model choice — keep the original lean layout).
  const showPicker = chatVariant !== undefined && onChatVariantChange !== undefined;

  return (
    <>
      <div className="bg-white dark:bg-dark-surface rounded-2xl border border-slate-200 dark:border-dark-border shadow-sm p-5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400"
          >
            <Cpu className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 dark:text-dark-text">{title}</p>
            <p className="text-xs text-slate-500 dark:text-dark-text-muted mt-1 leading-relaxed">
              {summary} {blurb}{" "}
              <button
                type="button"
                onClick={() => setDetailsOpen(true)}
                className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium underline-offset-2 hover:underline"
              >
                View details
              </button>
            </p>
          </div>
        </div>
        {showPicker && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-dark-border/60">
            <p className="text-xs font-medium text-slate-600 dark:text-dark-text-muted mb-2">
              Choose a chat model
            </p>
            <ChatModelPicker
              value={chatVariant}
              onChange={onChatVariantChange}
              disabled={loading}
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            const trigger = onDownload ?? (() => ai.ensureReady());
            try {
              const out = trigger();
              if (out && typeof (out as Promise<unknown>).catch === "function") {
                (out as Promise<unknown>).catch(() => {
                  /* dialog shows the error */
                });
              }
            } catch {
              /* dialog shows the error */
            }
          }}
          disabled={loading}
          className="mt-4 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading model…
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Download model
            </>
          )}
        </button>
      </div>

      <AiModelDetailsModal
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        models={modelList}
        roles={roles}
        onFreeMemory={onFreeMemory}
        onDelete={onDeleteCachedModels}
        canFreeMemory={canFreeMemory}
        canDelete={canDelete}
      />
    </>
  );
}
