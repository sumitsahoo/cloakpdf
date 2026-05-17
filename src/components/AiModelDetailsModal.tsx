/**
 * Read-only modal that lists every AI model loaded by a tool — name,
 * Hugging Face repo, size, license, source link, and optional role
 * label ("chat", "retrieval", …).
 *
 * Reached from both {@link AiModelGate} (before download) and
 * {@link ActiveModelBar} (after load). Keeping the per-model details
 * here instead of inline on the surrounding chrome means the gate
 * card and the active-model strip stay compact on phones, while users
 * who want to know exactly what's running on their device are one tap
 * away from the full picture.
 *
 * Different from {@link AiConsentModal}: that modal drives the
 * download / consent flow with progress, retry, and cancel actions.
 * This one is purely informational and dismissible from any state.
 *
 * **Visual pattern.** Mirrors `ToolPickerModal`'s translucent bottom-
 * sheet-on-mobile / centered-on-desktop layout — single `fixed inset-0`
 * wrapper paints both the dim-and-blur backdrop and the close-button
 * surface, with the inner sheet rising in via `animate-slide-up-in`.
 * One painting layer keeps iOS Safari from getting confused about
 * which element should scroll.
 */
import { AlertTriangle, HardDrive, MemoryStick, ShieldCheck, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { type AiModelInfo, formatApproxSize } from "../utils/ai-models.ts";
import { ModelCard } from "./ModelCard.tsx";

interface AiModelDetailsModalProps {
  open: boolean;
  onClose: () => void;
  /** Models to list. Render order is preserved. */
  models: AiModelInfo[];
  /**
   * Optional human-readable role per model — same length and order as
   * `models`. E.g. `["chat", "retrieval"]`. Pass `undefined` when role
   * labels aren't meaningful.
   */
  roles?: string[];
  /**
   * Release the in-tab pipelines (RAM only). The browser keeps the
   * downloaded weight files in CacheStorage so re-loading is fast.
   * Wire from `useRagModels.dispose`. The dialog hides the "Free
   * memory" affordance entirely when this is omitted (e.g. opened
   * from the pre-download gate, where there's no RAM to free yet).
   */
  onFreeMemory?: () => void | Promise<unknown>;
  /**
   * Destructive: also delete the model weights from CacheStorage
   * and clear the consent flags so the user re-experiences the
   * download dialog on next use. Wire from `useRagModels.evict`.
   * Hidden when omitted; rendered with an inline two-step confirm
   * when present so a stray click can't nuke a 1.5 GB download.
   */
  onDelete?: () => void | Promise<unknown>;
  /**
   * Disables both storage actions while another AI task is running
   * (e.g. mid-question, mid-indexing). The host knows the task
   * state; we don't try to second-guess it from the model status.
   */
  storageActionsDisabled?: boolean;
  /**
   * `true` when at least one pipeline is resident in RAM — i.e.
   * there's something for {@link onFreeMemory} to actually free.
   * When `false` (e.g. right after a dispose/evict), the "Free
   * memory" button hides so the user isn't offered a no-op action.
   * Wire from `useRagModels.canFreeMemory`. Default `true`
   * preserves the old always-show behaviour for callers that
   * haven't been updated yet.
   */
  canFreeMemory?: boolean;
  /**
   * `true` when at least one model is loaded in RAM *or* known to
   * have weights cached on disk. When `false` (cache evicted, no
   * pipelines loaded), the destructive "Delete cached models"
   * button hides — nothing to delete, so the affordance would be a
   * no-op. Wire from `useRagModels.canDelete`.
   */
  canDelete?: boolean;
}

export function AiModelDetailsModal({
  open,
  onClose,
  models,
  roles,
  onFreeMemory,
  onDelete,
  storageActionsDisabled,
  canFreeMemory = true,
  canDelete = true,
}: AiModelDetailsModalProps) {
  // Two-step confirm state for "Delete cached models" — clicking the
  // button arms it ("Click again to confirm"); clicking the armed
  // button fires the actual delete. Resets whenever the dialog opens
  // or closes so a future visit starts cleanly disarmed.
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Lock body scroll + wire Escape while open. Matches the workflow
  // ToolPickerModal pattern so the two dialogs feel like one system.
  useEffect(() => {
    if (!open) return;
    setDeleteArmed(false);
    setBusy(false);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const totalBytes = models.reduce((sum, m) => sum + m.approxSizeBytes, 0);
  // An individual button shows iff its callback is wired AND there's
  // actually something for it to act on. The whole storage section
  // hides when neither button has anything to do — keeps the modal
  // tidy after a successful evict (nothing to free, nothing to
  // delete) instead of leaving two ghost rows of "this won't do
  // anything" buttons.
  const showFreeMemory = Boolean(onFreeMemory) && canFreeMemory;
  const showDelete = Boolean(onDelete) && canDelete;
  const showStorageActions = showFreeMemory || showDelete;

  async function handleFreeMemory() {
    if (!onFreeMemory || busy) return;
    setBusy(true);
    try {
      await onFreeMemory();
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteClick() {
    if (!onDelete || busy) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setBusy(true);
    try {
      await onDelete();
      // After a successful evict the modal's content (model badges,
      // memory line) is still accurate metadata, but the in-page
      // state has changed — close so the host can re-render the
      // gate/consent flow from scratch.
      onClose();
    } finally {
      setBusy(false);
      setDeleteArmed(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-200 flex items-end sm:items-center justify-center sm:px-3 md:px-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-model-details-title"
      style={{
        // Single painting layer for dim + blur — same approach as
        // ToolPickerModal so iOS Safari's hit-testing on the wrapper
        // stays straightforward.
        background: "color-mix(in oklab, rgb(15 23 42) 30%, transparent)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute inset-0"
        style={{ background: "transparent" }}
      />

      <div className="relative flex flex-col w-full sm:w-[min(560px,100%)] max-h-[82svh] sm:max-h-[min(640px,calc(100svh-64px))] overflow-hidden rounded-t-2xl sm:rounded-2xl border border-slate-200/80 dark:border-dark-border bg-white/85 dark:bg-dark-surface/85 backdrop-blur-xl shadow-2xl animate-slide-up-in overscroll-contain">
        {/* Mobile drag handle — purely decorative here (no drag-to-dismiss).
            Matches the visual cue used in ToolPickerModal so users coming
            from the workflow flow recognise the sheet pattern. */}
        <div aria-hidden="true" className="grid place-items-center pt-2.5 pb-1 sm:hidden">
          <span className="w-11 h-1 rounded-full bg-slate-300 dark:bg-dark-border" />
        </div>

        <div className="flex items-start gap-4 px-4 md:px-7 pt-2 sm:pt-5 pb-3.5 border-b border-slate-200/70 dark:border-dark-border/70">
          <div className="flex-1 min-w-0">
            <h2
              id="ai-model-details-title"
              className="text-card-title sm:text-base font-semibold tracking-[-0.01em] text-slate-800 dark:text-dark-text"
            >
              {models.length > 1 ? "AI models in use" : "AI model in use"}
            </h2>
            <p className="text-card-desc text-slate-500 dark:text-dark-text-muted mt-0.5 leading-relaxed">
              {models.length > 1
                ? `${models.length} models load together — about ${formatApproxSize(totalBytes)} total. All run on your device; your PDFs are never uploaded.`
                : "Runs on your device; your PDFs are never uploaded."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-lg grid place-items-center text-slate-400 dark:text-dark-text-muted hover:bg-slate-100 dark:hover:bg-dark-surface-alt hover:text-slate-700 dark:hover:text-dark-text transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-4 md:px-7 py-4 md:py-5 space-y-3 thin-scrollbar">
          <RequirementsLine totalBytes={totalBytes} />

          {models.map((info, i) => (
            <ModelCard key={info.id} info={info} role={roles?.[i]} />
          ))}

          <div className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-dark-text-muted leading-relaxed pt-1">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-primary-600 dark:text-primary-400" />
            <p>
              Model files are downloaded once from Hugging Face's CDN and cached in your browser.
              After that, everything runs entirely on your device.
            </p>
          </div>

          {showStorageActions && (
            <StorageActions
              totalBytes={totalBytes}
              onFreeMemory={showFreeMemory ? onFreeMemory : undefined}
              onDelete={showDelete ? onDelete : undefined}
              deleteArmed={deleteArmed}
              onDeleteClick={handleDeleteClick}
              onCancelDelete={() => setDeleteArmed(false)}
              onFreeMemoryClick={handleFreeMemory}
              disabled={Boolean(storageActionsDisabled) || busy}
              busy={busy}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Plain informational strip showing the model bundle's peak-RAM
 * footprint and the recommended baseline. **We deliberately do not
 * read `navigator.deviceMemory`** — Chrome caps it at 8 GB for
 * fingerprinting privacy (so 16 GB and 32 GB desktops both report 8),
 * Firefox/Safari don't expose it at all, and any "Detected on your
 * device: X GB" line we'd render from that signal is at best
 * uninformative and at worst self-contradictory.
 *
 * The deal we offer the user instead: tell them what the models need,
 * and trust them to know whether their machine has it. A single
 * neutral tone, no amber/slate split based on a signal we don't
 * trust, no per-user diagnosis.
 *
 * The dialog only renders on desktop — the Ask PDF tool is gated to
 * non-mobile devices upstream (see `tool.desktopOnly` in
 * `tool-registry.ts`), so we don't need a phone-specific branch here.
 */
function RequirementsLine({ totalBytes }: { totalBytes: number }) {
  const totalGb = totalBytes / (1024 * 1024 * 1024);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-dark-border bg-slate-50/60 dark:bg-dark-surface-alt/60 text-slate-700 dark:text-dark-text p-3 text-xs leading-relaxed flex items-start gap-2.5">
      <MemoryStick
        className="w-4 h-4 shrink-0 mt-0.5 text-primary-600 dark:text-primary-400"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Memory requirement</p>
        <p className="opacity-80 mt-0.5">
          These models load about {totalGb.toFixed(1)} GB into memory at the same time. At least 16
          GB of RAM is recommended for smooth performance.
        </p>
      </div>
    </div>
  );
}

/**
 * Footer panel offering the two storage knobs: a soft "Free memory"
 * (release RAM, keep the downloaded weights cached on disk so the
 * next use warm-loads in seconds) and a destructive "Delete cached
 * models" (also evict the CacheStorage bytes, ~1.5 GB).
 *
 * The destructive action goes through a two-step confirm: the first
 * click swaps the button into an "armed" state with a red warning
 * blurb and a "Cancel" escape hatch; the second click actually fires
 * the evict. This is cheaper than a separate confirm modal and
 * harder to dismiss by accident than `window.confirm` (whose dialog
 * placement varies wildly across browsers/OS).
 *
 * Both buttons disable while a task is running (`disabled` from the
 * host) and while either operation is in flight (`busy`) — frees the
 * caller from having to model the two-state dance themselves.
 */
function StorageActions({
  totalBytes,
  onFreeMemory,
  onDelete,
  deleteArmed,
  onDeleteClick,
  onCancelDelete,
  onFreeMemoryClick,
  disabled,
  busy,
}: {
  totalBytes: number;
  onFreeMemory?: () => void | Promise<unknown>;
  onDelete?: () => void | Promise<unknown>;
  deleteArmed: boolean;
  onDeleteClick: () => void;
  onCancelDelete: () => void;
  onFreeMemoryClick: () => void;
  disabled: boolean;
  busy: boolean;
}) {
  const totalGb = totalBytes / (1024 * 1024 * 1024);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface p-3.5 text-xs">
      <div className="flex items-start gap-2.5">
        <HardDrive
          className="w-4 h-4 shrink-0 mt-0.5 text-slate-500 dark:text-dark-text-muted"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-700 dark:text-dark-text">Storage</p>
          <p className="opacity-80 mt-0.5 text-slate-600 dark:text-dark-text-muted leading-relaxed">
            The models sit in two places: loaded in RAM while you're using AI, and cached on disk (~
            {totalGb.toFixed(1)} GB) so future sessions skip the download.
          </p>
          <ul className="mt-2 space-y-1 text-slate-600 dark:text-dark-text-muted leading-relaxed">
            <li className="flex gap-1.5">
              <span aria-hidden="true">·</span>
              <span>
                <strong className="text-slate-700 dark:text-dark-text">Free memory</strong> —
                releases RAM only. The disk cache stays, so re-opening Ask&nbsp;PDF re-loads in
                seconds.
              </span>
            </li>
            <li className="flex gap-1.5">
              <span aria-hidden="true">·</span>
              <span>
                <strong className="text-slate-700 dark:text-dark-text">Delete cached models</strong>{" "}
                — frees RAM <em>and</em> the disk cache. Next use redownloads the full ~
                {totalGb.toFixed(1)} GB.
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        {onFreeMemory && (
          <button
            type="button"
            onClick={onFreeMemoryClick}
            disabled={disabled}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-dark-text bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border hover:border-slate-300 dark:hover:border-dark-text-muted hover:bg-slate-50 dark:hover:bg-dark-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <MemoryStick className="w-3.5 h-3.5" aria-hidden="true" />
            Free memory
          </button>
        )}
        {onDelete && !deleteArmed && (
          <button
            type="button"
            onClick={onDeleteClick}
            disabled={disabled}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 bg-white dark:bg-dark-surface border border-red-200 dark:border-red-800/60 hover:border-red-300 dark:hover:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            Delete cached models
          </button>
        )}
      </div>

      {onDelete && deleteArmed && (
        <div className="mt-3 rounded-lg border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-900/20 p-3">
          <div className="flex items-start gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="font-medium leading-relaxed">
              Delete the cached models? You'll need to redownload ~{totalGb.toFixed(1)} GB to use AI
              features again.
            </p>
          </div>
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={onCancelDelete}
              disabled={busy}
              className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-dark-text bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-dark-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onDeleteClick}
              disabled={busy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              {busy ? "Deleting…" : "Confirm delete"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
