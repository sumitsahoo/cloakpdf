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
 * Different from {@link AiConsentDialog}: that dialog drives the
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
import { MemoryStick, ShieldCheck, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { type AiModelInfo, formatApproxSize } from "../utils/ai-models.ts";
import { ModelCard } from "./ModelCard.tsx";

interface AiModelDetailsDialogProps {
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
}

export function AiModelDetailsDialog({ open, onClose, models, roles }: AiModelDetailsDialogProps) {
  // Lock body scroll + wire Escape while open. Matches the workflow
  // ToolPickerModal pattern so the two dialogs feel like one system.
  useEffect(() => {
    if (!open) return;
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
