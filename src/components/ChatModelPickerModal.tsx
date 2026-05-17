/**
 * Modal wrapper around {@link ChatModelPicker} for the
 * mid-session swap path.
 *
 * Used when the user clicks "Change model" in the active-model bar
 * — the consent dialog is reserved for download flow, so this
 * dialog handles the pure "which tier?" decision and hands off
 * back to the gate / consent flow once the user confirms.
 *
 * Visually matches `AiConsentModal` — same translucent backdrop,
 * same slide-up animation, same border/shadow palette — so swap and
 * consent read as one system.
 */
import { Cpu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ChatVariantId } from "../utils/ai-models.ts";
import { ChatModelPicker } from "./ChatModelPicker.tsx";

interface ChatModelPickerModalProps {
  open: boolean;
  /** The variant that's currently active — pre-selects it in the picker. */
  current: ChatVariantId;
  /** Fires when the user confirms a different tier; closes the dialog. */
  onConfirm: (next: ChatVariantId) => void;
  /** Fires when the user dismisses without changing. */
  onCancel: () => void;
}

export function ChatModelPickerModal({
  open,
  current,
  onConfirm,
  onCancel,
}: ChatModelPickerModalProps) {
  // Pending selection — only persisted via `onConfirm`. Re-init when the
  // dialog reopens so a cancel followed by a re-open shows the active
  // tier highlighted (not whatever the user was about to pick last time).
  const [pending, setPending] = useState<ChatVariantId>(current);
  useEffect(() => {
    if (open) setPending(current);
  }, [open, current]);

  // Lock body scroll + Escape to dismiss while open. Same pattern as
  // AiConsentModal.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onCancel]);

  if (!open) return null;

  const changed = pending !== current;

  return createPortal(
    <div
      className="fixed inset-0 z-200 flex items-end sm:items-center justify-center sm:px-3 md:px-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-model-picker-title"
      style={{
        background: "color-mix(in oklab, rgb(15 23 42) 30%, transparent)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      <button
        type="button"
        onClick={onCancel}
        aria-label="Close"
        tabIndex={-1}
        className="absolute inset-0"
        style={{ background: "transparent" }}
      />

      <div className="relative flex flex-col w-full sm:w-[min(520px,100%)] max-h-[88svh] sm:max-h-[min(640px,calc(100svh-64px))] overflow-hidden rounded-t-2xl sm:rounded-2xl border border-slate-200/80 dark:border-dark-border bg-white/85 dark:bg-dark-surface/85 backdrop-blur-xl shadow-2xl animate-slide-up-in overscroll-contain">
        <div aria-hidden="true" className="grid place-items-center pt-2.5 pb-1 sm:hidden">
          <span className="w-11 h-1 rounded-full bg-slate-300 dark:bg-dark-border" />
        </div>

        <div className="flex items-start gap-4 px-4 md:px-7 pt-2 sm:pt-5 pb-3.5 border-b border-slate-200/70 dark:border-dark-border/70">
          <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400">
            <Cpu className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <h2
              id="chat-model-picker-title"
              className="text-card-title sm:text-base font-semibold tracking-[-0.01em] text-slate-800 dark:text-dark-text"
            >
              Pick a chat model
            </h2>
            <p className="text-card-desc text-slate-500 dark:text-dark-text-muted mt-0.5 leading-relaxed">
              Pick the tier that matches your device. Switching unloads the current model from
              memory; the new one downloads if you haven't used it before.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="w-9 h-9 rounded-lg grid place-items-center text-slate-400 dark:text-dark-text-muted hover:bg-slate-100 dark:hover:bg-dark-surface-alt hover:text-slate-700 dark:hover:text-dark-text transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-4 md:px-7 py-4 md:py-5 thin-scrollbar">
          <ChatModelPicker value={pending} onChange={setPending} />
        </div>

        <div className="px-4 md:px-7 py-4 bg-slate-50/55 dark:bg-dark-surface-alt/55 border-t border-slate-200/70 dark:border-dark-border/70 flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-dark-text bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border hover:border-slate-300 dark:hover:border-dark-text-muted hover:bg-slate-50 dark:hover:bg-dark-surface-alt transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(pending)}
            disabled={!changed}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors bg-primary-600 hover:bg-primary-700 text-white shadow-sm shadow-primary-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Switch model
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
