/**
 * Consent + progress modal shown before any AI model is downloaded.
 *
 * The modal cycles through three visual states driven by the `status`
 * prop from `useAiModel`:
 *
 *   - `awaiting-consent` — full model card(s) with size, licence, and
 *     Hugging Face link plus a primary "Download model" CTA. User must
 *     explicitly opt in before any bytes are fetched.
 *   - `downloading` — determinate progress bar, current file name,
 *     loaded/total byte counts. The modal refuses to close on backdrop
 *     click while in this state so the user can't accidentally lose
 *     visibility of the download (Cancel button is the explicit exit).
 *   - `error` — error message with Retry / Cancel buttons.
 *
 * **Multi-model support.** Pass `models` (one entry per pipeline) to
 * render a card per model in the consent body. Pass `perModelStatus`
 * and `perModelProgress` (both parallel to `models`) to render an
 * itemised per-model breakdown beneath the overall download bar — one
 * row per model with its own mini bar so users can see *which* model
 * is currently being pulled, not just the rolled-up percent. The
 * arrays are optional; when omitted the modal renders only the
 * combined bar (matches the original single-bar UX). The model cards
 * themselves come from the shared {@link ModelCard} component used by
 * {@link AiModelDetailsModal}, so the two modals read as one system.
 *
 * **Visual pattern.** Mirrors `ToolPickerModal`'s translucent layout —
 * one painting layer for backdrop + close-button, sheet rises in via
 * `animate-slide-up-in`, `bg-white/85` for the see-through feel.
 * Bottom-sheet on mobile / centered card on desktop.
 *
 * **Download indicator.** The header swaps `Loader2` for a plain
 * `ArrowDown` during the `downloading` state — the arrow rises in
 * from the top, settles, then exits downward in a loop. A bare
 * down-arrow reads more directly as "bytes flowing in" than Lucide's
 * `Download` glyph (arrow + tray), which adds visual weight the
 * motion already conveys. Warm-load keeps the spinner since nothing
 * is being downloaded then.
 */
import { AlertCircle, ArrowDown, Check, Cpu, Loader2, ShieldCheck, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { AiModelStatus } from "../hooks/useAiModel.ts";
import type { AiModelInfo } from "../utils/ai-models.ts";
import type { AiProgress } from "../utils/ai-runtime.ts";
import { formatFileSize } from "../utils/file-helpers.ts";
import { ModelCard } from "./ModelCard.tsx";

interface AiConsentModalProps {
  /** When `false` the dialog is unmounted entirely. */
  open: boolean;
  /**
   * Models the user is being asked to download together. `models[0]`
   * drives the single-model headline copy; with multiple models the
   * headline / body switches to the plural case. One card is rendered
   * per model with metadata (size, licence, Hugging Face link).
   */
  models: AiModelInfo[];
  /**
   * Optional role labels matching {@link models} by index, e.g.
   * `["chat", "retrieval", "rerank"]`. Surfaces a small pill in each
   * card so users can tell which model handles which job.
   */
  roles?: string[];
  /** Rollup status driving the dialog's high-level state machine. */
  status: AiModelStatus;
  /**
   * Combined byte progress across every model — drives the dominant
   * "overall" bar. Sum of every model's loaded/total.
   */
  progress: AiProgress | null;
  /**
   * Per-model status, parallel to {@link models}. When provided
   * alongside {@link perModelProgress}, the download body renders a
   * row per model under the overall bar so users can see *which*
   * model is currently being pulled. Omitting either array falls back
   * to the single-bar layout.
   */
  perModelStatus?: AiModelStatus[];
  /** Per-model byte progress, parallel to {@link models}. */
  perModelProgress?: Array<AiProgress | null>;
  error: string | null;
  /** "Download model" — only fires from the `awaiting-consent` state. */
  onConfirm: () => void;
  /** "Retry" — only fires from the `error` state. */
  onRetry: () => void;
  /** "Cancel" — closes the dialog. Always available. */
  onCancel: () => void;
}

export function AiConsentModal({
  open,
  models,
  roles,
  status,
  progress,
  perModelStatus,
  perModelProgress,
  error,
  onConfirm,
  onRetry,
  onCancel,
}: AiConsentModalProps) {
  // Lock body scroll + wire Escape while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      // Allow Escape to cancel from any state — the underlying download
      // continues in the background but the dialog dismisses. Reopening
      // re-shows the same state machine progress.
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onCancel]);

  if (!open) return null;

  // Backdrop click closes the dialog *unless* a download or warm-load
  // is mid-flight — an accidental click is a poor way to lose
  // visibility of either kind of progress.
  const dismissOnBackdrop = status !== "downloading" && status !== "loading";
  const disableClose = !dismissOnBackdrop;

  const totalBytes = models.reduce((sum, m) => sum + m.approxSizeBytes, 0);
  const primary = models[0];

  return createPortal(
    <div
      className="fixed inset-0 z-200 flex items-end sm:items-center justify-center sm:px-3 md:px-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-consent-title"
      style={{
        // One painting layer for dim + blur — same pattern as
        // ToolPickerModal so iOS Safari's hit-testing stays simple.
        background: "color-mix(in oklab, rgb(15 23 42) 30%, transparent)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      <button
        type="button"
        onClick={dismissOnBackdrop ? onCancel : undefined}
        aria-label="Close"
        tabIndex={-1}
        className="absolute inset-0"
        style={{ background: "transparent" }}
      />

      <div className="relative flex flex-col w-full sm:w-[min(560px,100%)] max-h-[88svh] sm:max-h-[min(720px,calc(100svh-64px))] overflow-hidden rounded-t-2xl sm:rounded-2xl border border-slate-200/80 dark:border-dark-border bg-white/85 dark:bg-dark-surface/85 backdrop-blur-xl shadow-2xl animate-slide-up-in overscroll-contain">
        {/* Mobile drag handle — purely visual, no drag-to-dismiss
            since the download flow has its own explicit Cancel CTA. */}
        <div aria-hidden="true" className="grid place-items-center pt-2.5 pb-1 sm:hidden">
          <span className="w-11 h-1 rounded-full bg-slate-300 dark:bg-dark-border" />
        </div>

        <ModalHeader
          primary={primary}
          models={models}
          status={status}
          onCancel={onCancel}
          disableClose={disableClose}
        />

        <div className="overflow-y-auto px-4 md:px-7 py-4 md:py-5 thin-scrollbar">
          {status === "awaiting-consent" || status === "idle" ? (
            <ConsentBody models={models} roles={roles} />
          ) : status === "downloading" || status === "loading" ? (
            <DownloadBody
              primary={primary}
              models={models}
              roles={roles}
              totalBytes={totalBytes}
              progress={progress}
              perModelStatus={perModelStatus}
              perModelProgress={perModelProgress}
              warm={status === "loading"}
            />
          ) : status === "error" ? (
            <ErrorBody models={models} message={error} />
          ) : null}
        </div>

        <ModalFooter status={status} onConfirm={onConfirm} onRetry={onRetry} onCancel={onCancel} />
      </div>
    </div>,
    document.body,
  );
}

// ── Sub-components ────────────────────────────────────────────────

function ModalHeader({
  primary,
  models,
  status,
  onCancel,
  disableClose,
}: {
  primary: AiModelInfo;
  models: AiModelInfo[];
  status: AiModelStatus;
  onCancel: () => void;
  disableClose: boolean;
}) {
  const multi = models.length > 1;
  const headline =
    status === "loading"
      ? multi
        ? "Loading models"
        : "Loading model"
      : status === "downloading"
        ? multi
          ? "Downloading models"
          : "Downloading model"
        : status === "error"
          ? "Download failed"
          : multi
            ? "Use these AI models?"
            : `Use ${primary.displayName}?`;

  // Description: generic line when multi-model (each model has its
  // own detailed description further down in its card); the model's
  // own description when single. Count-aware so a 2-model vs 3-model
  // bundle reads correctly.
  const description = multi
    ? `${models.length} small models load together — one to chat with the document, the others to find and rerank the right pages. All run entirely on your device; your PDFs are never uploaded.`
    : primary.description;

  return (
    <div className="flex items-start gap-4 px-4 md:px-7 pt-2 sm:pt-5 pb-3.5 border-b border-slate-200/70 dark:border-dark-border/70">
      <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 overflow-hidden">
        {status === "downloading" ? (
          // Bare down-arrow looping top→middle→bottom→fade — visually
          // mirrors what the bar below is doing (bytes flowing in)
          // without the visual weight of `Download`'s tray + line.
          // Hidden from a11y; the headline below already announces the
          // downloading state.
          <ArrowDown
            className="w-5 h-5 animate-download-arrow"
            aria-hidden="true"
            strokeWidth={2.5}
          />
        ) : status === "loading" ? (
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
        ) : status === "error" ? (
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" aria-hidden="true" />
        ) : (
          <Cpu className="w-5 h-5" aria-hidden="true" />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <h2
          id="ai-consent-title"
          className="text-card-title sm:text-base font-semibold tracking-[-0.01em] text-slate-800 dark:text-dark-text"
        >
          {headline}
        </h2>
        <p className="text-card-desc text-slate-500 dark:text-dark-text-muted mt-0.5 leading-relaxed">
          {description}
        </p>
      </div>
      <button
        type="button"
        onClick={disableClose ? undefined : onCancel}
        disabled={disableClose}
        aria-label="Close"
        className="w-9 h-9 rounded-lg grid place-items-center text-slate-400 dark:text-dark-text-muted hover:bg-slate-100 dark:hover:bg-dark-surface-alt hover:text-slate-700 dark:hover:text-dark-text transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function ConsentBody({ models, roles }: { models: AiModelInfo[]; roles?: string[] }) {
  return (
    <div className="space-y-3">
      {models.map((info, i) => (
        <ModelCard key={info.id} info={info} role={roles?.[i]} />
      ))}

      {/* Privacy reassurance — repeated here intentionally; users may
          jump straight to this block without reading the header. */}
      <div className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-dark-text-muted leading-relaxed pt-1">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-primary-600 dark:text-primary-400" />
        <p>
          Files are downloaded once from Hugging Face's CDN and cached in your browser. After that
          everything runs entirely on your device — your PDFs are never uploaded.
        </p>
      </div>
    </div>
  );
}

function DownloadBody({
  primary,
  models,
  roles,
  totalBytes,
  progress,
  perModelStatus,
  perModelProgress,
  warm,
}: {
  primary: AiModelInfo;
  models: AiModelInfo[];
  roles?: string[];
  /** Sum of `approxSizeBytes` across all models — used as the total fallback. */
  totalBytes: number;
  progress: AiProgress | null;
  perModelStatus?: AiModelStatus[];
  perModelProgress?: Array<AiProgress | null>;
  /**
   * `true` when the bytes are already in CacheStorage and we're only
   * constructing the pipeline from disk. Suppresses the byte counter
   * and the "download will resume" line — neither applies — and
   * shows a friendlier "Loading model" label instead.
   */
  warm: boolean;
}) {
  const multi = models.length > 1;
  const showBreakdown =
    multi &&
    Array.isArray(perModelStatus) &&
    Array.isArray(perModelProgress) &&
    perModelStatus.length === models.length &&
    perModelProgress.length === models.length;

  if (warm) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-dark-text">
          <span
            aria-hidden="true"
            className="w-4 h-4 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin"
          />
          <span className="font-medium">
            {progress?.status ?? (multi ? "Loading models" : "Loading model")}
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-dark-text-muted leading-relaxed">
          {multi
            ? "All models are already cached in your browser — initialising the runtimes now. This usually takes a few seconds."
            : `${primary.displayName} is already cached in your browser — initialising the runtime now. This usually takes a few seconds.`}
        </p>
      </div>
    );
  }

  const loaded = progress?.loaded ?? 0;
  // Use the aggregated `total` from `useRagModels.progress` directly
  // when available — it already accounts for completed models by
  // counting their full `approxSizeBytes` toward both `loaded` and
  // `total`, so the percent reaches 100% on the last model
  // finishing. Falls back to the registry sum only in the brief
  // pre-progress window before Transformers.js fires its first
  // event. The earlier `Math.max(reported, registry)` pattern was
  // the bug behind "stopped at 85%" — when Transformers.js
  // under-reports total bytes (smaller actual quant than the
  // estimate), the dialog would cap percent below 100% because
  // `loaded` reached the reported total but `total` kept the
  // higher registry estimate.
  const total = progress?.total && progress.total > 0 ? progress.total : totalBytes;
  const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;

  // Single-model fallback (e.g. a tool that only loads one pipeline)
  // keeps the original "one chunky bar + filename + bytes" layout —
  // there's nothing for a per-model breakdown to add when there's
  // only one model.
  if (!showBreakdown) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-700 dark:text-dark-text font-medium">
            {progress?.status ?? "Downloading"}
          </span>
          <span className="font-medium text-primary-600 dark:text-primary-400 tabular-nums">
            {percent}%
          </span>
        </div>
        <div className="w-full bg-slate-200 dark:bg-dark-border rounded-full h-2 overflow-hidden">
          <div
            className="bg-primary-600 h-full rounded-full transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-dark-text-muted">
          <span className="font-mono wrap-anywhere truncate">
            {progress?.file ? progress.file.split("/").pop() || progress.file : "preparing…"}
          </span>
          <span className="tabular-nums shrink-0">
            {formatFileSize(loaded)} / {formatFileSize(total)}
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-dark-text-muted leading-relaxed pt-1">
          If your connection drops, the download will resume next time — files already saved to your
          browser cache won't be redownloaded.
        </p>
      </div>
    );
  }

  // Multi-model breakdown.
  //
  // **Layout intent.** A single tinted "summary" panel at the top
  // (big percent + total bytes) followed by one white card per
  // model. The summary doesn't repeat the bar — the per-model cards
  // already visualise where bytes are flowing, and a second
  // top-level bar would be redundant. The summary's big numeric
  // anchors the eye; the cards below answer "which model is next".
  //
  // Each per-model card is self-contained: role pill, display name,
  // its own per-model bar, and a tail that swaps between size /
  // "Ready" / "Loading…" / "Waiting" depending on the model's own
  // state machine. Cards keep the project's slate-200 border + white
  // surface + rounded-xl idiom so the dialog reads as one of the
  // app's regular surfaces, not a special download UI.
  const completed = perModelStatus.filter((s) => s === "ready").length;
  const downloading = models.length - completed;

  return (
    <div className="space-y-4">
      {/* Tinted summary panel — big percent left, totals on the right.
          Replaces the old "Overall progress" + bar combo. The
          per-model bars below already show progress in detail; a
          second top bar was redundant and made the panel feel
          stacked. */}
      <div className="rounded-xl border border-primary-100/80 dark:border-primary-900/40 bg-primary-50/60 dark:bg-primary-900/15 px-4 py-3.5">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xxs uppercase tracking-wider font-medium text-primary-700 dark:text-primary-300">
              {progress?.status ?? "Downloading"}
            </p>
            <p className="text-sm font-semibold text-slate-800 dark:text-dark-text tabular-nums mt-1">
              {formatFileSize(loaded)}{" "}
              <span className="text-slate-500 dark:text-dark-text-muted font-normal">
                of {formatFileSize(total)}
              </span>
            </p>
            <p className="text-xs text-slate-500 dark:text-dark-text-muted mt-0.5">
              {completed} of {models.length} ready
              {downloading > 0 ? ` · ${downloading} pending` : ""}
            </p>
          </div>
          <span className="text-3xl font-semibold text-primary-600 dark:text-primary-400 tabular-nums leading-none shrink-0">
            {percent}
            <span className="text-base font-medium">%</span>
          </span>
        </div>
      </div>

      {/* Per-model cards — one row per pipeline. Listed in the same
          order the consumer passed in `models`, so the chat row sits
          at the top (it's the slowest + most visible). */}
      <ul className="space-y-2">
        {models.map((info, i) => (
          <li key={info.id}>
            <ModelProgressCard
              info={info}
              role={roles?.[i]}
              status={perModelStatus[i] ?? "idle"}
              progress={perModelProgress[i] ?? null}
            />
          </li>
        ))}
      </ul>

      <p className="text-xs text-slate-500 dark:text-dark-text-muted leading-relaxed">
        If your connection drops, the download will resume next time — files already saved to your
        browser cache won't be redownloaded.
      </p>
    </div>
  );
}

/**
 * One card per model in the multi-model breakdown. Shows the model's
 * role pill, display name, a thin per-model progress bar, and a tail
 * that swaps between size counter / "Ready" / "Loading…" / "Waiting"
 * depending on the model's state. The card is self-contained — the
 * summary panel above doesn't repeat any of this information.
 *
 * **Visual idiom.** `rounded-xl border border-slate-200 bg-white` —
 * the same surface treatment {@link ModelCard} uses, so the consent
 * body and download body share a visual language.
 */
function ModelProgressCard({
  info,
  role,
  status,
  progress,
}: {
  info: AiModelInfo;
  role?: string;
  status: AiModelStatus;
  progress: AiProgress | null;
}) {
  const loaded = progress?.loaded ?? 0;
  // Prefer the runtime-reported total once it's available — that's
  // the authoritative denominator and lets the percent reach 100%
  // when the model actually finishes. Fall back to the registry
  // estimate only in the pre-progress window (no events fired yet).
  // The earlier `Math.max(reported, registry)` workaround capped
  // per-card percent below 100% whenever the actual download was
  // smaller than the registry estimate.
  const total = progress?.total && progress.total > 0 ? progress.total : info.approxSizeBytes;
  const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;

  // Bar appearance keys off status, not just percent — a finished
  // card reads as "done" (lighter fill + check), a failed card as
  // "error" (red track), a waiting card as "queued" (muted track),
  // a downloading card as the active fill. The bar fill on error is
  // intentionally full + red so the row still has visual weight,
  // matching the "Failed" tail.
  const barPercent =
    status === "ready" || status === "error" ? 100 : status === "downloading" ? percent : 0;
  const barClass =
    status === "ready"
      ? "bg-primary-400/80 dark:bg-primary-500/70"
      : status === "error"
        ? "bg-red-500/70 dark:bg-red-400/70"
        : status === "downloading"
          ? "bg-primary-600 dark:bg-primary-500"
          : "bg-slate-200 dark:bg-dark-border";

  // Tail: the per-card status indicator on the right. Each status
  // maps to one affordance so the card never juggles two competing
  // signals (e.g. a percent + a "Ready" badge at the same time).
  // Without an `error` branch a failed model rendered as "Waiting"
  // while the dialog header already shouted "Download failed" — the
  // user couldn't tell *which* model broke. The red tail closes
  // that loop.
  let tail: React.ReactNode;
  if (status === "ready") {
    tail = (
      <span className="inline-flex items-center gap-1 text-primary-700 dark:text-primary-300 font-medium">
        <Check className="w-3.5 h-3.5" aria-hidden="true" />
        Ready
      </span>
    );
  } else if (status === "error") {
    tail = (
      <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
        <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
        Failed
      </span>
    );
  } else if (status === "loading") {
    tail = (
      <span className="inline-flex items-center gap-1 text-slate-500 dark:text-dark-text-muted">
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        Loading…
      </span>
    );
  } else if (status === "downloading") {
    tail = (
      <span className="tabular-nums text-primary-600 dark:text-primary-400 font-medium">
        {percent}%
      </span>
    );
  } else {
    tail = <span className="text-slate-400 dark:text-dark-text-muted">Waiting</span>;
  }

  // Sub-tail under the bar: byte counter while downloading (the
  // user's "how big is this one?" hint), or the model's published
  // size hint in any other state. Keeps the card looking the same
  // height across states so the list doesn't jiggle as models
  // transition.
  const subTail =
    status === "downloading"
      ? `${formatFileSize(loaded)} / ${formatFileSize(total)}`
      : `${formatFileSize(info.approxSizeBytes)}`;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 mb-0.5">
            {role && (
              <span className="shrink-0 text-xxs uppercase tracking-wider text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 rounded px-1.5 py-0.5 font-medium">
                {role}
              </span>
            )}
            <span className="font-medium text-sm text-slate-700 dark:text-dark-text truncate">
              {info.displayName}
            </span>
          </div>
        </div>
        <span className="text-xs shrink-0">{tail}</span>
      </div>
      <div className="mt-2 w-full bg-slate-100 dark:bg-dark-bg rounded-full h-1.5 overflow-hidden">
        <div
          className={`${barClass} h-full rounded-full transition-[width] duration-300`}
          style={{ width: `${barPercent}%` }}
        />
      </div>
      <p className="mt-1.5 text-xxs tabular-nums text-slate-400 dark:text-dark-text-muted">
        {subTail}
      </p>
    </div>
  );
}

function ErrorBody({ models, message }: { models: AiModelInfo[]; message: string | null }) {
  const subject = models.length > 1 ? "the AI models" : `${models[0].displayName}`;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-700 dark:text-red-300">
        {message ?? "The download could not be completed."}
      </div>
      <p className="text-xs text-slate-500 dark:text-dark-text-muted leading-relaxed">
        Files already saved to your browser cache are kept — retrying picks up where the last
        attempt left off rather than starting {subject} from scratch.
      </p>
    </div>
  );
}

function ModalFooter({
  status,
  onConfirm,
  onRetry,
  onCancel,
}: {
  status: AiModelStatus;
  onConfirm: () => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="px-4 md:px-7 py-4 bg-slate-50/55 dark:bg-dark-surface-alt/55 border-t border-slate-200/70 dark:border-dark-border/70 flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-dark-text bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border hover:border-slate-300 dark:hover:border-dark-text-muted hover:bg-slate-50 dark:hover:bg-dark-surface-alt transition-colors"
      >
        Cancel
      </button>
      {status === "error" ? (
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors bg-primary-600 hover:bg-primary-700 text-white shadow-sm shadow-primary-500/30"
        >
          Retry download
        </button>
      ) : status === "downloading" ? null : (
        <button
          type="button"
          onClick={onConfirm}
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors bg-primary-600 hover:bg-primary-700 text-white shadow-sm shadow-primary-500/30"
        >
          Download model
        </button>
      )}
    </div>
  );
}
