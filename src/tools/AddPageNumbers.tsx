/**
 * Add Page Numbers tool.
 *
 * Lets the user choose a position (6-point grid), format, font size, colour,
 * margin, starting number, and which page to begin numbering from. The result
 * is downloaded immediately after processing.
 */

import { ChevronLeft, ChevronRight, Hash, Move } from "lucide-react";
import { useCallback, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
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
import type { PageNumberFormat, PageNumberOptions, PageNumberPosition } from "../types.ts";
import { downloadPdf, pdfFilename } from "../utils/file-helpers.ts";
import { addPageNumbers } from "../utils/pdf-operations.ts";
import { PREVIEW_SCALE, renderAllThumbnails, revokeThumbnails } from "../utils/pdf-renderer.ts";

/** Data loaded once per file: thumbnails + per-page dimensions in PDF points. */
interface LoadedPdf {
  thumbnails: string[];
  pageDims: { width: number; height: number }[];
}

const POSITIONS: { value: PageNumberPosition; label: string; title: string }[] = [
  { value: "top-left", label: "↖", title: "Top left" },
  { value: "top-center", label: "↑", title: "Top center" },
  { value: "top-right", label: "↗", title: "Top right" },
  { value: "bottom-left", label: "↙", title: "Bottom left" },
  { value: "bottom-center", label: "↓", title: "Bottom center" },
  { value: "bottom-right", label: "↘", title: "Bottom right" },
];

const FORMATS: PageNumberFormat[] = ["1", "Page 1", "1 / N", "Page 1 of N"];

function formatLabel(format: PageNumberFormat, currentNum: number, totalNum: number): string {
  switch (format) {
    case "1":
      return String(currentNum);
    case "Page 1":
      return `Page ${currentNum}`;
    case "1 / N":
      return `${currentNum} / ${totalNum}`;
    case "Page 1 of N":
      return `Page ${currentNum} of ${totalNum}`;
  }
}

/** CSS positioning for the page number overlay on a live thumbnail. */
function overlayStyle(
  pos: PageNumberPosition,
  marginPt: number,
  pageDim: { width: number; height: number } | undefined,
): React.CSSProperties {
  const mV = pageDim ? `${(marginPt / pageDim.height) * 100}%` : "3%";
  const mH = pageDim ? `${(marginPt / pageDim.width) * 100}%` : "3%";

  const base: React.CSSProperties = { position: "absolute", whiteSpace: "nowrap" };

  if (pos.startsWith("top")) base.top = mV;
  else base.bottom = mV;

  if (pos.endsWith("left")) {
    base.left = mH;
    base.textAlign = "left";
  } else if (pos.endsWith("right")) {
    base.right = mH;
    base.textAlign = "right";
  } else {
    base.left = "50%";
    base.transform = "translateX(-50%)";
    base.textAlign = "center";
  }

  return base;
}

const DEFAULT_OPTIONS: PageNumberOptions = {
  position: "bottom-center",
  format: "1",
  fontSize: 12,
  color: { r: 30, g: 41, b: 59 },
  margin: 20,
  startNumber: 1,
  firstPage: 1,
};

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

export default function AddPageNumbers() {
  const [selectedPage, setSelectedPage] = useState(0);
  const [options, setOptions] = useState<PageNumberOptions>(DEFAULT_OPTIONS);

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
  const pageCount = thumbnails.length;

  // Scale factor: preview px / page pt — used to size the font overlay correctly
  const [previewScale, previewContainerRef] = usePreviewScale(pageDims[selectedPage]);

  const handleReset = useCallback(() => setOptions(DEFAULT_OPTIONS), []);

  const isDirty = JSON.stringify(options) !== JSON.stringify(DEFAULT_OPTIONS);

  const setOpt = useCallback(
    <K extends keyof PageNumberOptions>(key: K, value: PageNumberOptions[K]) => {
      setOptions((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleApply = useCallback(async () => {
    if (!pdf.file) return;
    const file = pdf.file;
    await task.run(async () => {
      const result = await addPageNumbers(file, options);
      downloadPdf(result, pdfFilename(file, "_numbered"));
    }, "Failed to add page numbers. Please try again.");
  }, [pdf.file, options, task]);

  // Page number that appears on the currently previewed page (undefined if before firstPage)
  const previewPageNum =
    selectedPage >= options.firstPage - 1
      ? options.startNumber + (selectedPage - (options.firstPage - 1))
      : null;

  // Last page number (for N in "1 / N")
  const lastPageNum =
    pageCount > 0
      ? options.startNumber + (pageCount - options.firstPage)
      : options.startNumber + 11;

  const { r, g, b } = options.color;
  const numberColor = `rgb(${r},${g},${b})`;
  const displayFontSize = Math.max(6, Math.round(options.fontSize * previewScale));

  return (
    <div className="space-y-6">
      {!pdf.file ? (
        <FileDropZone
          glowColor={categoryGlow.annotate}
          iconColor={categoryAccent.annotate}
          accept=".pdf,application/pdf"
          onFiles={pdf.onFiles}
          label="Drop a PDF file here"
          hint="Page numbers will be drawn on every page"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={pdf.file.name}
            details={pdf.loading ? "loading…" : `${pageCount} pages`}
            onChangeFile={pdf.reset}
          />

          <div className="grid md:grid-cols-2 gap-6">
            {/* ── Left column: controls ── */}
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                  Configure style and position
                </p>
                {isDirty && <ResetButton onClick={handleReset} />}
              </div>

              {/* Position grid */}
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-dark-text-muted mb-2">
                  <Move className="w-3.5 h-3.5" />
                  Position
                </p>
                <div className="grid grid-cols-3 gap-2 max-w-45">
                  {POSITIONS.map(({ value, label, title }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setOpt("position", value)}
                      title={title}
                      className={`h-10 rounded-lg text-base font-bold border-2 transition-all duration-150 ${
                        options.position === value
                          ? "border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300"
                          : "border-slate-200 dark:border-dark-border text-slate-400 dark:text-dark-text-muted hover:border-slate-300 dark:hover:border-slate-500 bg-white dark:bg-dark-surface"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Format */}
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-dark-text-muted mb-2">
                  <Hash className="w-3.5 h-3.5" />
                  Format
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {FORMATS.map((f) => {
                    const example = formatLabel(f, options.startNumber, lastPageNum);
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setOpt("format", f)}
                        className={`py-2 px-3 rounded-xl text-sm text-center border-2 transition-all duration-150 ${
                          options.format === f
                            ? "font-semibold border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 ring-1 ring-primary-300 dark:ring-primary-700"
                            : "font-medium border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface text-slate-600 dark:text-dark-text-muted hover:border-slate-300 dark:hover:border-slate-500"
                        }`}
                      >
                        <span className="block">{example}</span>
                        {f.includes("N") && (
                          <span className="block text-xs opacity-50 mt-0.5">{f}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <LabeledSlider
                  id="pn-font-size"
                  label="Font size"
                  value={options.fontSize}
                  min={8}
                  max={24}
                  unit="pt"
                  onChange={(v) => setOpt("fontSize", v)}
                />
                <LabeledSlider
                  id="pn-margin"
                  label="Margin"
                  value={options.margin}
                  min={5}
                  max={72}
                  unit="pt"
                  onChange={(v) => setOpt("margin", v)}
                />
              </div>

              {/* Color */}
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text mb-2">
                  Colour
                </p>
                <ColorPicker
                  value={rgbToHex(options.color.r, options.color.g, options.color.b)}
                  onChange={(hex) => setOpt("color", hexToRgb(hex))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Start number */}
                <div>
                  <label
                    htmlFor="pn-start-number"
                    className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5"
                  >
                    Start number
                  </label>
                  <input
                    id="pn-start-number"
                    type="number"
                    min={1}
                    value={options.startNumber}
                    onChange={(e) => setOpt("startNumber", Math.max(1, Number(e.target.value)))}
                    className="w-full border border-slate-300 dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-white dark:bg-dark-surface text-slate-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                {/* First page */}
                <div>
                  <label
                    htmlFor="pn-first-page"
                    className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5"
                  >
                    Start from page
                  </label>
                  <input
                    id="pn-first-page"
                    type="number"
                    min={1}
                    max={pageCount || 1}
                    value={options.firstPage}
                    onChange={(e) =>
                      setOpt(
                        "firstPage",
                        Math.min(Math.max(1, Number(e.target.value)), pageCount || 1),
                      )
                    }
                    className="w-full border border-slate-300 dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-white dark:bg-dark-surface text-slate-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-xs text-slate-400 dark:text-dark-text-muted mt-1">
                    Set to 2 to skip a cover page
                  </p>
                </div>
              </div>
            </div>

            {/* ── Right column: live page preview ── */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                  {previewPageNum !== null
                    ? `Preview — Page ${selectedPage + 1}`
                    : `Preview — Page ${selectedPage + 1} (no number)`}
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

              {pdf.loading ? (
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
                  {previewPageNum !== null && (
                    <span
                      className="font-medium leading-none pointer-events-none"
                      style={{
                        ...overlayStyle(options.position, options.margin, pageDims[selectedPage]),
                        color: numberColor,
                        fontSize: displayFontSize,
                      }}
                    >
                      {formatLabel(options.format, previewPageNum, lastPageNum)}
                    </span>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <ActionButton
            onClick={handleApply}
            processing={task.processing}
            disabled={task.processing || pdf.loading}
            label="Add Page Numbers & Download"
            processingLabel="Adding numbers…"
            color="bg-emerald-600 hover:bg-emerald-700"
          />
        </>
      )}

      {(pdf.loadError || task.error) && <AlertBox message={pdf.loadError ?? task.error ?? ""} />}
    </div>
  );
}
