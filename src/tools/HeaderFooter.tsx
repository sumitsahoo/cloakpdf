/**
 * Header & Footer tool.
 *
 * Adds repeating text at the top and/or bottom of every page in a PDF.
 * Each row has three alignment slots (left / centre / right). Supports
 * {{page}} and {{total}} tokens that expand per page. Optionally skips
 * the first page (e.g. for cover pages or title pages).
 */

import { ChevronLeft, ChevronRight, PanelBottom, PanelTop } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { CheckboxField } from "../components/CheckboxField.tsx";
import { ColorPicker, hexToRgb, rgbToHex } from "../components/ColorPicker.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { LabeledSlider } from "../components/LabeledSlider.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { ResetButton } from "../components/ResetButton.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { usePdfFile } from "../hooks/usePdfFile.ts";
import { usePreviewScale } from "../hooks/usePreviewScale.ts";
import type { HeaderFooterOptions } from "../types.ts";
import { downloadPdf, formatFileSize, pdfFilename } from "../utils/file-helpers.ts";
import { addHeaderFooter } from "../utils/pdf-operations.ts";
import { PREVIEW_SCALE, renderAllThumbnails, revokeThumbnails } from "../utils/pdf-renderer.ts";

/** Data loaded once per file: thumbnails + per-page dimensions in PDF points. */
interface LoadedPdf {
  thumbnails: string[];
  pageDims: { width: number; height: number }[];
}

/** Load thumbnails and page dimensions together in a single pass. */
async function loadPdfWithDims(file: File): Promise<LoadedPdf> {
  const [thumbnails, { PDFDocument }] = await Promise.all([
    renderAllThumbnails(file, PREVIEW_SCALE),
    import("@pdfme/pdf-lib"),
  ]);
  const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
  const pageDims = pdfDoc.getPages().map((p) => p.getSize());
  return { thumbnails, pageDims };
}

const DEFAULT_OPTIONS: HeaderFooterOptions = {
  headerLeft: "",
  headerCenter: "",
  headerRight: "",
  footerLeft: "",
  footerCenter: "{{page}}",
  footerRight: "",
  fontSize: 10,
  color: { r: 100, g: 116, b: 139 },
  margin: 20,
  skipFirstPage: false,
};

const TOKENS = [
  { token: "{{page}}", label: "{{page}}", description: "Current page number" },
  { token: "{{total}}", label: "{{total}}", description: "Total page count" },
];

/** Resolve tokens for preview display */
function resolveTokens(text: string, page: number, total: number): string {
  return text.replace(/\{\{page\}\}/g, String(page)).replace(/\{\{total\}\}/g, String(total));
}

export default function HeaderFooter() {
  const [selectedPage, setSelectedPage] = useState(0);
  const [options, setOptions] = useState<HeaderFooterOptions>(DEFAULT_OPTIONS);

  const pdf = usePdfFile<LoadedPdf>({
    load: loadPdfWithDims,
    onReset: (data) => {
      revokeThumbnails(data?.thumbnails ?? []);
      setSelectedPage(0);
    },
  });
  const task = useAsyncProcess();

  const thumbnails = pdf.data?.thumbnails ?? [];
  const pageDims = pdf.data?.pageDims ?? [];
  const loading = pdf.loading;
  const processing = task.processing;
  const error = pdf.loadError ?? task.error;

  // Scale factor: preview px / page pt — used to size the font overlay correctly
  const [previewScale, previewContainerRef] = usePreviewScale(pageDims[selectedPage]);

  // Track the last focused text input for token insertion
  const lastFocusedRef = useRef<{
    field: keyof HeaderFooterOptions;
    el: HTMLInputElement;
  } | null>(null);

  const handleReset = useCallback(() => {
    setOptions(DEFAULT_OPTIONS);
  }, []);

  const isDirty = JSON.stringify(options) !== JSON.stringify(DEFAULT_OPTIONS);

  const setOpt = useCallback(
    <K extends keyof HeaderFooterOptions>(key: K, value: HeaderFooterOptions[K]) => {
      setOptions((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const insertToken = useCallback(
    (token: string) => {
      if (!lastFocusedRef.current) return;
      const { field, el } = lastFocusedRef.current;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const newValue = el.value.slice(0, start) + token + el.value.slice(end);
      setOpt(field as keyof HeaderFooterOptions, newValue as HeaderFooterOptions[typeof field]);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      });
    },
    [setOpt],
  );

  const handleApply = useCallback(async () => {
    if (!pdf.file) return;
    const hasContent = [
      options.headerLeft,
      options.headerCenter,
      options.headerRight,
      options.footerLeft,
      options.footerCenter,
      options.footerRight,
    ].some((s) => s.trim());
    if (!hasContent) {
      task.setError("Please enter at least one header or footer text.");
      return;
    }
    const file = pdf.file;
    await task.run(async () => {
      const result = await addHeaderFooter(file, options);
      downloadPdf(result, pdfFilename(file, "_header_footer"));
    }, "Failed to add header/footer. Please try again.");
  }, [pdf.file, options, task]);

  const slotClass =
    "w-full border border-slate-300 dark:border-dark-border rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-dark-surface text-slate-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-400 placeholder:text-slate-300 dark:placeholder:text-dark-text-muted transition-colors";

  const makeInputProps = (field: keyof HeaderFooterOptions) => ({
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      lastFocusedRef.current = { field, el: e.currentTarget };
    },
  });

  const pageCount = thumbnails.length;
  const pageDim = pageDims[selectedPage];

  // Whether the selected page has header/footer applied
  const isSkipped = options.skipFirstPage && selectedPage === 0;

  // Resolved page number shown in preview (accounts for skipFirstPage — skipped page shows nothing)
  const previewPageNum = isSkipped ? null : selectedPage + 1;
  const previewTotal = pageCount || 5;

  // CSS percentage values for overlay positioning
  const mV = pageDim ? `${(options.margin / pageDim.height) * 100}%` : "3%";
  const mH = pageDim ? `${(options.margin / pageDim.width) * 100}%` : "3%";
  const displayFontSize = Math.max(6, Math.round(options.fontSize * previewScale));
  const textColor = `rgb(${options.color.r},${options.color.g},${options.color.b})`;

  return (
    <div className="space-y-6">
      {!pdf.file ? (
        <FileDropZone
          glowColor={categoryGlow.annotate}
          iconColor={categoryAccent.annotate}
          accept=".pdf,application/pdf"
          onFiles={pdf.onFiles}
          label="Drop a PDF file here"
          hint="Header and footer text will be added to every page"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={pdf.file.name}
            details={loading ? "loading…" : formatFileSize(pdf.file.size)}
            onChangeFile={pdf.reset}
          />

          <div className="grid md:grid-cols-2 gap-6 items-start">
            {/* ── Left column: controls ── */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                  Configure header and footer text below
                </p>
                {isDirty && <ResetButton onClick={handleReset} />}
              </div>

              {/* Header row */}
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-800/40">
                  <PanelTop className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                    Header
                  </p>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Left"
                      value={options.headerLeft}
                      onChange={(e) => setOpt("headerLeft", e.target.value)}
                      className={slotClass}
                      {...makeInputProps("headerLeft")}
                    />
                    <input
                      type="text"
                      placeholder="Centre"
                      value={options.headerCenter}
                      onChange={(e) => setOpt("headerCenter", e.target.value)}
                      className={slotClass}
                      {...makeInputProps("headerCenter")}
                    />
                    <input
                      type="text"
                      placeholder="Right"
                      value={options.headerRight}
                      onChange={(e) => setOpt("headerRight", e.target.value)}
                      className={slotClass}
                      {...makeInputProps("headerRight")}
                    />
                  </div>
                </div>
              </div>

              {/* Footer row */}
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-800/40">
                  <PanelBottom className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                    Footer
                  </p>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Left"
                      value={options.footerLeft}
                      onChange={(e) => setOpt("footerLeft", e.target.value)}
                      className={slotClass}
                      {...makeInputProps("footerLeft")}
                    />
                    <input
                      type="text"
                      placeholder="Centre"
                      value={options.footerCenter}
                      onChange={(e) => setOpt("footerCenter", e.target.value)}
                      className={slotClass}
                      {...makeInputProps("footerCenter")}
                    />
                    <input
                      type="text"
                      placeholder="Right"
                      value={options.footerRight}
                      onChange={(e) => setOpt("footerRight", e.target.value)}
                      className={slotClass}
                      {...makeInputProps("footerRight")}
                    />
                  </div>
                </div>
              </div>

              {/* Token insert pills */}
              <div className="bg-slate-50 dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border p-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-dark-text-muted">
                  Insert token:
                </span>
                {TOKENS.map(({ token, label, description }) => (
                  <button
                    key={token}
                    type="button"
                    title={description}
                    onClick={() => insertToken(token)}
                    className="inline-flex items-center gap-1 rounded-md bg-white dark:bg-dark-surface border border-slate-300 dark:border-dark-border px-2 py-0.5 text-xs font-mono text-slate-700 dark:text-dark-text hover:border-emerald-400 hover:text-emerald-700 dark:hover:border-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors cursor-pointer shadow-sm"
                  >
                    {label}
                  </button>
                ))}
                <span className="text-xs text-slate-400 dark:text-dark-text-muted">
                  — click a token to insert at cursor
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <LabeledSlider
                  id="hf-font-size"
                  label="Font size"
                  value={options.fontSize}
                  min={7}
                  max={20}
                  unit="pt"
                  onChange={(v) => setOpt("fontSize", v)}
                  accent="accent-emerald-600"
                />
                <LabeledSlider
                  id="hf-margin"
                  label="Margin"
                  value={options.margin}
                  min={5}
                  max={72}
                  unit="pt"
                  onChange={(v) => setOpt("margin", v)}
                  accent="accent-emerald-600"
                />
              </div>

              {/* Colour */}
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text mb-2">
                  Colour
                </p>
                <ColorPicker
                  value={rgbToHex(options.color.r, options.color.g, options.color.b)}
                  onChange={(hex) => {
                    const { r, g, b } = hexToRgb(hex);
                    setOpt("color", { r, g, b });
                  }}
                />
              </div>

              {/* Skip first page */}
              <CheckboxField
                label="Skip first page"
                description="Useful when the first page is a cover or title page"
                checked={options.skipFirstPage}
                onChange={(v) => setOpt("skipFirstPage", v)}
                accent="accent-emerald-600"
              />
            </div>

            {/* ── Right column: live page preview ── */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                  {isSkipped
                    ? `Preview — Page ${selectedPage + 1} (skipped)`
                    : `Preview — Page ${selectedPage + 1}`}
                </p>
                {pageCount > 1 && (
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      disabled={selectedPage === 0}
                      onClick={() => setSelectedPage((p) => p - 1)}
                      className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-dark-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-slate-400 dark:text-dark-text-muted tabular-nums px-1">
                      {selectedPage + 1} / {pageCount}
                    </span>
                    <button
                      type="button"
                      disabled={selectedPage === pageCount - 1}
                      onClick={() => setSelectedPage((p) => p + 1)}
                      className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-dark-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {loading ? (
                <div className="aspect-3/4 bg-slate-100 dark:bg-dark-surface-alt rounded-lg flex items-center justify-center">
                  <LoadingSpinner color="border-emerald-200 border-t-emerald-600" />
                </div>
              ) : thumbnails[selectedPage] ? (
                <div
                  ref={previewContainerRef}
                  className="relative aspect-3/4 bg-white dark:bg-dark-surface rounded-lg border border-slate-200 dark:border-dark-border overflow-hidden"
                >
                  <img
                    src={thumbnails[selectedPage]}
                    alt={`Page ${selectedPage + 1}`}
                    className="w-full h-full object-contain"
                  />

                  {!isSkipped && (
                    <>
                      {/* Header overlays */}
                      {options.headerLeft.trim() && (
                        <span
                          className="absolute font-medium leading-none pointer-events-none whitespace-nowrap"
                          style={{ top: mV, left: mH, color: textColor, fontSize: displayFontSize }}
                        >
                          {resolveTokens(options.headerLeft, previewPageNum ?? 1, previewTotal)}
                        </span>
                      )}
                      {options.headerCenter.trim() && (
                        <span
                          className="absolute font-medium leading-none pointer-events-none whitespace-nowrap"
                          style={{
                            top: mV,
                            left: "50%",
                            transform: "translateX(-50%)",
                            color: textColor,
                            fontSize: displayFontSize,
                          }}
                        >
                          {resolveTokens(options.headerCenter, previewPageNum ?? 1, previewTotal)}
                        </span>
                      )}
                      {options.headerRight.trim() && (
                        <span
                          className="absolute font-medium leading-none pointer-events-none whitespace-nowrap"
                          style={{
                            top: mV,
                            right: mH,
                            color: textColor,
                            fontSize: displayFontSize,
                          }}
                        >
                          {resolveTokens(options.headerRight, previewPageNum ?? 1, previewTotal)}
                        </span>
                      )}

                      {/* Footer overlays */}
                      {options.footerLeft.trim() && (
                        <span
                          className="absolute font-medium leading-none pointer-events-none whitespace-nowrap"
                          style={{
                            bottom: mV,
                            left: mH,
                            color: textColor,
                            fontSize: displayFontSize,
                          }}
                        >
                          {resolveTokens(options.footerLeft, previewPageNum ?? 1, previewTotal)}
                        </span>
                      )}
                      {options.footerCenter.trim() && (
                        <span
                          className="absolute font-medium leading-none pointer-events-none whitespace-nowrap"
                          style={{
                            bottom: mV,
                            left: "50%",
                            transform: "translateX(-50%)",
                            color: textColor,
                            fontSize: displayFontSize,
                          }}
                        >
                          {resolveTokens(options.footerCenter, previewPageNum ?? 1, previewTotal)}
                        </span>
                      )}
                      {options.footerRight.trim() && (
                        <span
                          className="absolute font-medium leading-none pointer-events-none whitespace-nowrap"
                          style={{
                            bottom: mV,
                            right: mH,
                            color: textColor,
                            fontSize: displayFontSize,
                          }}
                        >
                          {resolveTokens(options.footerRight, previewPageNum ?? 1, previewTotal)}
                        </span>
                      )}
                    </>
                  )}

                  {isSkipped && (
                    <div className="absolute inset-x-0 bottom-2 flex justify-center pointer-events-none">
                      <span className="text-[10px] bg-slate-800/60 text-white rounded px-1.5 py-0.5">
                        skipped
                      </span>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <ActionButton
            onClick={handleApply}
            processing={processing}
            disabled={processing || loading}
            label="Apply Header & Footer & Download"
            processingLabel="Applying…"
            color="bg-emerald-600 hover:bg-emerald-700"
          />
        </>
      )}

      {error && <AlertBox message={error} />}
    </div>
  );
}
