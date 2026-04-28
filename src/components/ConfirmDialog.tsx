/**
 * Lightweight confirmation modal — a designed replacement for the
 * browser's native `window.confirm`.
 *
 * Visual language adapted from cloakresume's ConfirmDialog: a glass-
 * blur backdrop, scale-in card, danger / default tone. Translated to
 * CloakPDF's Tailwind tokens (`primary-*`, `slate-*`, `dark-*`) so it
 * matches the rest of the app instead of using cloakresume's CSS vars.
 *
 * Rendered via portal into `document.body` to overlay app chrome and
 * traps Escape/Enter so keyboard users stay oriented.
 */

import { AlertTriangle, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  const confirmStyles =
    tone === "danger"
      ? "bg-red-600 hover:bg-red-700 text-white shadow-sm shadow-red-500/30"
      : "bg-primary-600 hover:bg-primary-700 text-white shadow-sm shadow-primary-500/30";

  const iconStyles =
    tone === "danger"
      ? "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400"
      : "bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400";

  return createPortal(
    <div
      className="fixed inset-0 z-200 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      {/* Backdrop dim + blur — the layer below; click to dismiss. Inline
          backdrop-filter for the `-webkit-` prefix (Safari). */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-slate-900/30 dark:bg-black/50"
        style={{
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
      />
      <button
        type="button"
        onClick={onCancel}
        aria-label="Close"
        className="absolute inset-0 bg-transparent border-0 cursor-default"
      />

      <div className="relative w-full max-w-md rounded-2xl overflow-hidden border border-slate-200/80 dark:border-dark-border bg-white/85 dark:bg-dark-surface/85 backdrop-blur-xl shadow-2xl animate-scale-in">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <span
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconStyles}`}
            >
              <AlertTriangle className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <h2
                id="confirm-dialog-title"
                className="text-base font-semibold tracking-[-0.01em] text-slate-800 dark:text-dark-text"
              >
                {title}
              </h2>
              {description && (
                <p className="text-sm text-slate-500 dark:text-dark-text-muted mt-1.5 leading-relaxed wrap-anywhere">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close"
              className="p-1 rounded-md text-slate-400 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text hover:bg-slate-100 dark:hover:bg-dark-surface-alt transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50/55 dark:bg-dark-surface-alt/55 border-t border-slate-200/70 dark:border-dark-border/70 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-dark-text bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border hover:border-slate-300 dark:hover:border-dark-text-muted hover:bg-slate-50 dark:hover:bg-dark-surface-alt transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${confirmStyles}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
