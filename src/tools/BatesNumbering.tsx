/**
 * Bates Numbering tool.
 *
 * Stamps sequential identifiers (prefix + zero-padded number + suffix) on
 * every page of a PDF. Widely used in legal, compliance, and archival
 * workflows to uniquely label each page in a document set.
 */

import { ChevronLeft, ChevronRight, Move } from "lucide-react";
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
import type { BatesNumberOptions, BatesPosition } from "../types.ts";
import { downloadPdf, pdfFilename } from "../utils/file-helpers.ts";
import { addBatesNumbers } from "../utils/pdf-operations.ts";
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

const POSITIONS: { value: BatesPosition; label: string; title: string }[] = [
  { value: "top-left", label: "↖", title: "Top left" },
  { value: "top-center", label: "↑", title: "Top center" },
  { value: "top-right", label: "↗", title: "Top right" },
  { value: "bottom-left", label: "↙", title: "Bottom left" },
  { value: "bottom-center", label: "↓", title: "Bottom center" },
  { value: "bottom-right", label: "↘", title: "Bottom right" },
];

const DEFAULT_OPTIONS: BatesNumberOptions = {
  prefix: "BATES-",
  suffix: "",
  startNumber: 1,
  digits: 6,
  position: "bottom-right",
  fontSize: 10,
  color: { r: 30, g: 41, b: 59 },
  margin: 20,
};

/** CSS positioning for the Bates label overlay on a live thumbnail. */
function overlayStyle(
  pos: BatesPosition,
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

export default function BatesNumbering() {
  const [selectedPage, setSelectedPage] = useState(0);
  const [options, setOptions] = useState<BatesNumberOptions>(DEFAULT_OPTIONS);

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

  const handleReset = useCallback(() => {
    setOptions(DEFAULT_OPTIONS);
  }, []);

  const isDirty = JSON.stringify(options) !== JSON.stringify(DEFAULT_OPTIONS);

  const setOpt = useCallback(
    <K extends keyof BatesNumberOptions>(key: K, value: BatesNumberOptions[K]) => {
      setOptions((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleApply = useCallback(async () => {
    if (!pdf.file) return;
    const file = pdf.file;
    await task.run(async () => {
      const result = await addBatesNumbers(file, options);
      downloadPdf(result, pdfFilename(file, "_bates"));
    }, "Failed to add Bates numbering. Please try again.");
  }, [pdf.file, options, task]);

  const pageCount = thumbnails.length;

  // Bates label for the currently previewed page
  const previewLabel = `${options.prefix}${String(options.startNumber + selectedPage).padStart(options.digits, "0")}${options.suffix}`;

  const { r, g, b } = options.color;
  const labelColor = `rgb(${r},${g},${b})`;
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
          hint="Sequential Bates numbers will be stamped on every page"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={pdf.file.name}
            details={loading ? "loading…" : `${pageCount} pages`}
            onChangeFile={pdf.reset}
          />

          <div className="grid md:grid-cols-2 gap-6">
            {/* ── Left column: controls ── */}
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                  Configure Bates number format and position
                </p>
                {isDirty && <ResetButton onClick={handleReset} />}
              </div>

              {/* Prefix & Suffix */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                    Prefix
                  </label>
                  <input
                    type="text"
                    value={options.prefix}
                    onChange={(e) => setOpt("prefix", e.target.value)}
                    placeholder="e.g. CASE-"
                    className="w-full border border-slate-300 dark:border-dark-border rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-dark-surface text-slate-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                    Suffix
                  </label>
                  <input
                    type="text"
                    value={options.suffix}
                    onChange={(e) => setOpt("suffix", e.target.value)}
                    placeholder="Optional"
                    className="w-full border border-slate-300 dark:border-dark-border rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-dark-surface text-slate-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              {/* Start number & Digits */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                    Start number
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={options.startNumber}
                    onChange={(e) => setOpt("startNumber", Math.max(0, Number(e.target.value)))}
                    className="w-full border border-slate-300 dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-white dark:bg-dark-surface text-slate-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                    Digits (zero-padding)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={options.digits}
                    onChange={(e) =>
                      setOpt("digits", Math.min(12, Math.max(1, Number(e.target.value))))
                    }
                    className="w-full border border-slate-300 dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-white dark:bg-dark-surface text-slate-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-xs text-slate-400 dark:text-dark-text-muted mt-1">
                    e.g. 6 → 000001
                  </p>
                </div>
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

              <div className="grid grid-cols-2 gap-4">
                <LabeledSlider
                  id="bn-font-size"
                  label="Font size"
                  value={options.fontSize}
                  min={6}
                  max={18}
                  unit="pt"
                  onChange={(v) => setOpt("fontSize", v)}
                />
                <LabeledSlider
                  id="bn-margin"
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
                  onChange={(hex) => {
                    const { r, g, b } = hexToRgb(hex);
                    setOpt("color", { r, g, b });
                  }}
                />
              </div>
            </div>

            {/* ── Right column: live page preview ── */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                  Preview — Page {selectedPage + 1}
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
                  <LoadingSpinner />
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
                  <span
                    className="font-mono font-medium leading-none pointer-events-none"
                    style={{
                      ...overlayStyle(options.position, options.margin, pageDims[selectedPage]),
                      color: labelColor,
                      fontSize: displayFontSize,
                    }}
                  >
                    {previewLabel}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <ActionButton
            onClick={handleApply}
            processing={processing}
            disabled={processing || loading}
            label="Add Bates Numbers & Download"
            processingLabel="Adding Bates numbers…"
          />
        </>
      )}

      {error && <AlertBox message={error} />}
    </div>
  );
}
