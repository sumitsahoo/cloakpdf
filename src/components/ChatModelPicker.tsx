/**
 * Tier-selector for the on-device chat model.
 *
 * Two tiers, each backed by an entry in `src/utils/ai-models.ts`:
 *
 *   - Compact  → LFM2.5-1.2B-Instruct (~1.2 GB / ~2 GB peak)
 *   - Quality  → LFM2-2.6B  (~1.5 GB / ~3.5 GB peak)
 *
 * The picker shows download size and peak RAM so users can see what
 * they're committing to. We deliberately do **not** auto-recommend a
 * tier based on `navigator.deviceMemory` — Chrome caps the reading at
 * 8 GB for privacy (a 32 GB desktop reports identical to an 8 GB
 * laptop) and Firefox / Safari don't ship the API at all. Surfacing a
 * misleading "Recommended for your device" badge from a broken signal
 * would be worse than letting the user pick. The choice persists in
 * localStorage so it's a one-time decision per browser.
 *
 * Pure presentational — no localStorage / state. Caller (the gate or
 * the swap dialog) owns the selection and persistence.
 */
import { Check, Cpu, Download, MemoryStick } from "lucide-react";
import {
  AI_MODELS,
  CHAT_VARIANT_IDS,
  CHAT_VARIANT_TIER_LABEL,
  type ChatVariantId,
  formatApproxSize,
  getChatModelId,
} from "../utils/ai-models.ts";

interface ChatModelPickerProps {
  /** Currently-selected tier. */
  value: ChatVariantId;
  /** Fires when the user picks a different tier. */
  onChange: (next: ChatVariantId) => void;
  /** Disable interaction (e.g. while a download is in flight). */
  disabled?: boolean;
}

export function ChatModelPicker({ value, onChange, disabled }: ChatModelPickerProps) {
  return (
    <fieldset className="space-y-2" aria-label="Chat model tier" disabled={disabled}>
      <legend className="sr-only">Chat model tier</legend>
      {CHAT_VARIANT_IDS.map((variant) => {
        const info = AI_MODELS[getChatModelId(variant)];
        const selected = variant === value;
        return (
          <button
            key={variant}
            type="button"
            onClick={() => onChange(variant)}
            disabled={disabled}
            aria-pressed={selected}
            className={[
              "w-full text-left rounded-xl border p-3 transition-colors flex items-start gap-3",
              selected
                ? "border-primary-500 dark:border-primary-400 bg-primary-50/70 dark:bg-primary-900/20"
                : "border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface hover:border-slate-300 dark:hover:border-dark-text-muted hover:bg-slate-50 dark:hover:bg-dark-surface-alt",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            ].join(" ")}
          >
            <span
              aria-hidden="true"
              className={[
                "shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 grid place-items-center transition-colors",
                selected
                  ? "border-primary-600 dark:border-primary-400 bg-primary-600 dark:bg-primary-500 text-white"
                  : "border-slate-300 dark:border-dark-border bg-white dark:bg-dark-surface",
              ].join(" ")}
            >
              {selected && <Check className="w-3 h-3" />}
            </span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-slate-800 dark:text-dark-text text-sm">
                  {CHAT_VARIANT_TIER_LABEL[variant]}
                </span>
                <span className="text-xs text-slate-500 dark:text-dark-text-muted">
                  · {info.displayName}
                </span>
              </span>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-dark-text-muted leading-relaxed">
                {info.description}
              </p>
              {/*
                Size + RAM strip. Earlier rev used a `·` between the
                two values; against the slate-500 text colour the dot
                disappeared into the line and users couldn't see where
                one metric ended and the next began. Icons fix it two
                ways: (a) they create a clear visual gap on their own,
                so no fragile mid-sentence separator is needed, and
                (b) each metric self-labels via its icon (download
                arrow vs memory stick) so a user can parse the line
                at a glance without reading the suffix word.
              */}
              <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xxs text-slate-500 dark:text-dark-text-muted tabular-nums">
                <span className="inline-flex items-center gap-1">
                  <Download className="w-3 h-3" aria-hidden="true" />
                  {formatApproxSize(info.approxSizeBytes)} download
                </span>
                <span className="inline-flex items-center gap-1">
                  <MemoryStick className="w-3 h-3" aria-hidden="true" />
                  {formatApproxSize(info.approxPeakRamBytes)} RAM
                </span>
              </span>
            </span>
          </button>
        );
      })}
      <p className="flex items-start gap-1.5 text-xxs text-slate-500 dark:text-dark-text-muted px-1 pt-1">
        <Cpu className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Pick the tier that matches your RAM headroom. You can switch anytime — previously
          downloaded models stay cached, so re-selecting one loads in seconds.
        </span>
      </p>
    </fieldset>
  );
}
