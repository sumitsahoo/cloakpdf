/**
 * Small strip rendered below an AI tool's primary controls that shows
 * the model(s) currently in use, the total on-device footprint, and a
 * link to a per-model details modal.
 *
 * Layout intent: a single flex-wrapping row of segments separated by
 * subtle bullets, so the line breaks cleanly on phones (each segment
 * lands on its own row at the natural wrap point — no orphan bullets,
 * no half-rendered "≈" symbols, no awkward 3-line stack).
 *
 * Per-model details (names, repos, licences, Hugging Face links) live
 * in {@link AiModelDetailsDialog} one tap away.
 */
import { RefreshCcw, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { type AiModelInfo, formatApproxSize } from "../utils/ai-models.ts";
import { AiModelDetailsDialog } from "./AiModelDetailsDialog.tsx";

interface ActiveModelBarProps {
  /**
   * Active models for the running tool — typically `[chat, embed,
   * rerank]` for the RAG stack. `models[0]` drives the single-model
   * label when only one is loaded; multi-model bundles render a
   * count-aware "Running N AI models — ≈ X total" strip.
   */
  models: AiModelInfo[];
  /**
   * Optional role labels matching {@link models} by index, e.g.
   * `["chat", "retrieval", "rerank"]`. Used by the details modal —
   * the strip itself stays terse.
   */
  roles?: string[];
  /**
   * `true` when every pipeline is loaded and the tool is operational.
   * Drives the "Running" / "Selected" verb so users can distinguish
   * "downloaded and active" from "selected, waiting for download".
   */
  ready: boolean;
  /**
   * Fired when the user clicks "Change model". When omitted the
   * button is hidden — useful when only one tier is registered, since
   * "change" has nothing to swap to. Reintroduce by passing a handler.
   */
  onChange?: () => void;
  /**
   * Disables the change button. Set this while a tool task is
   * running so the user can't yank the model out from under it.
   * Ignored when `onChange` is omitted.
   */
  disabled?: boolean;
}

export function ActiveModelBar({ models, roles, ready, onChange, disabled }: ActiveModelBarProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const verb = ready ? "Running" : "Selected";

  const totalBytes = models.reduce((sum, m) => sum + m.approxSizeBytes, 0);
  const primary = models[0];

  // Build the line as discrete segments so the flex-wrap layout below
  // can break them onto separate rows naturally. `formatApproxSize`
  // already produces a leading "≈" — don't prepend another one here.
  const segments: string[] =
    models.length > 1
      ? [`${verb} ${models.length} AI models`, formatApproxSize(totalBytes), "on-device"]
      : [
          `${verb} ${primary.displayName}`,
          formatApproxSize(primary.approxSizeBytes),
          primary.license,
          "on-device",
        ];

  return (
    <>
      <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-dark-text-muted px-1">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary-600 dark:text-primary-400" />
        <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          {segments.map((seg, i) => (
            <span key={seg} className="inline-flex items-center gap-x-1.5">
              {i > 0 && (
                <span aria-hidden="true" className="text-slate-300 dark:text-dark-border">
                  ·
                </span>
              )}
              <span>{seg}</span>
            </span>
          ))}
          <span aria-hidden="true" className="text-slate-300 dark:text-dark-border">
            ·
          </span>
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium underline-offset-2 hover:underline"
          >
            View details
          </button>
        </div>
        {onChange && (
          <button
            type="button"
            onClick={onChange}
            disabled={disabled}
            aria-label="Change model"
            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-dark-border text-slate-600 dark:text-dark-text-muted hover:text-slate-800 dark:hover:text-dark-text hover:bg-slate-100 dark:hover:bg-dark-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCcw className="w-3 h-3" />
            <span className="hidden sm:inline">Change model</span>
          </button>
        )}
      </div>

      <AiModelDetailsDialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        models={models}
        roles={roles}
      />
    </>
  );
}
