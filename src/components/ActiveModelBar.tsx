/**
 * Small strip rendered below an AI tool's primary controls that shows
 * the model currently in use, its on-device footprint, and a button
 * to switch to a different tier.
 *
 * Driving these props from {@link useRagModels} keeps the strip in
 * sync with the active chat model; from the consumer's side this is
 * purely presentational.
 */
import { RefreshCcw, ShieldCheck } from "lucide-react";
import { type AiModelInfo, formatApproxSize } from "../utils/ai-models.ts";

interface ActiveModelBarProps {
  /**
   * Spec for the active model — passed straight through from
   * {@link useAiModel.info}. Widened so non-chat models can also
   * render the strip if a future tool ever needs to.
   */
  info: AiModelInfo;
  /**
   * `true` when the pipeline is loaded and the tool is operational.
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

export function ActiveModelBar({ info, ready, onChange, disabled }: ActiveModelBarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500 dark:text-dark-text-muted px-1">
      <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-primary-600 dark:text-primary-400" />
      <span>
        {ready ? "Running" : "Selected"}{" "}
        <span className="font-medium text-slate-700 dark:text-dark-text">{info.displayName}</span>{" "}
        on-device · {formatApproxSize(info.approxSizeBytes)} · {info.license}
      </span>
      {onChange && (
        <button
          type="button"
          onClick={onChange}
          disabled={disabled}
          className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-dark-border text-slate-600 dark:text-dark-text-muted hover:text-slate-800 dark:hover:text-dark-text hover:bg-slate-100 dark:hover:bg-dark-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCcw className="w-3 h-3" />
          Change model
        </button>
      )}
    </div>
  );
}
