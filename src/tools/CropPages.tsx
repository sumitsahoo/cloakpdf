/**
 * Crop Pages tool.
 *
 * Sets a crop box on pages to trim the visible area. Margins are entered in
 * millimetres and converted to PDF points internally. A live preview on the
 * first page uses a semi-transparent overlay to show what will be hidden.
 * The crop is non-destructive — hidden content stays in the file but is not
 * rendered or printed.
 */

import { Check, Scissors } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import { ResetButton } from "../components/ResetButton.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { usePdfFile } from "../hooks/usePdfFile.ts";
import type { CropMargins } from "../types.ts";
import { downloadPdf, formatFileSize, pdfFilename } from "../utils/file-helpers.ts";
import { cropPages, uncropPages } from "../utils/pdf-operations.ts";
import { PREVIEW_SCALE, renderAllThumbnails, revokeThumbnails } from "../utils/pdf-renderer.ts";

const MM_TO_PT = 2.83465;

interface PageDims {
  width: number;
  height: number;
}

/** Data loaded once per file: full thumbnails + first-page dimensions. */
interface LoadedPdf {
  thumbnails: string[];
  pageDims: PageDims;
}

/** Load all thumbnails plus the first page's dimensions in one pass. */
async function loadPdf(file: File): Promise<LoadedPdf> {
  const [thumbnails, { PDFDocument }] = await Promise.all([
    renderAllThumbnails(file, PREVIEW_SCALE),
    import("@pdfme/pdf-lib"),
  ]);
  const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
  const pageDims = pdfDoc.getPage(0).getSize();
  return { thumbnails, pageDims };
}

export default function CropPages() {
  // Margins in mm (user input)
  const [marginMode, setMarginMode] = useState<"uniform" | "custom">("uniform");
  const [allSides, setAllSides] = useState<number>(0);
  const [margins, setMargins] = useState<CropMargins>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [applyToAll, setApplyToAll] = useState(true);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const previewRef = useRef<HTMLDivElement>(null);

  const pdf = usePdfFile<LoadedPdf>({
    load: loadPdf,
    onReset: (data) => {
      revokeThumbnails(data?.thumbnails ?? []);
      setMarginMode("uniform");
      setAllSides(0);
      setMargins({ top: 0, right: 0, bottom: 0, left: 0 });
      setSelectedPages(new Set());
    },
  });
  const task = useAsyncProcess();

  const allThumbs = pdf.data?.thumbnails ?? [];
  const pageDims = pdf.data?.pageDims ?? null;
  const loading = pdf.loading;
  const processing = task.processing;
  const error = pdf.loadError ?? task.error;

  const handleReset = useCallback(() => {
    setMarginMode("uniform");
    setAllSides(0);
    setMargins({ top: 0, right: 0, bottom: 0, left: 0 });
    setApplyToAll(true);
    setSelectedPages(new Set());
  }, []);

  const isDirty =
    allSides > 0 ||
    margins.top > 0 ||
    margins.right > 0 ||
    margins.bottom > 0 ||
    margins.left > 0 ||
    !applyToAll;

  const setMargin = useCallback((side: keyof CropMargins, mm: number) => {
    setMargins((prev) => ({ ...prev, [side]: Math.max(0, mm) }));
  }, []);

  const setUniformMargin = useCallback((mm: number) => {
    const v = Math.max(0, mm);
    setAllSides(v);
    setMargins({ top: v, right: v, bottom: v, left: v });
  }, []);

  const togglePage = useCallback((index: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const handleApplyToAllChange = useCallback(
    (checked: boolean) => {
      setApplyToAll(checked);
      if (!checked && selectedPages.size === 0) {
        setSelectedPages(new Set(allThumbs.map((_, i) => i)));
      }
    },
    [allThumbs, selectedPages.size],
  );

  // Compute overlay percentages from mm margins relative to page dimensions in pt
  const overlay = pageDims
    ? {
        top: Math.min((margins.top * MM_TO_PT) / pageDims.height, 0.99) * 100,
        right: Math.min((margins.right * MM_TO_PT) / pageDims.width, 0.99) * 100,
        bottom: Math.min((margins.bottom * MM_TO_PT) / pageDims.height, 0.99) * 100,
        left: Math.min((margins.left * MM_TO_PT) / pageDims.width, 0.99) * 100,
      }
    : null;

  const marginsInPt = useMemo<CropMargins>(
    () => ({
      top: margins.top * MM_TO_PT,
      right: margins.right * MM_TO_PT,
      bottom: margins.bottom * MM_TO_PT,
      left: margins.left * MM_TO_PT,
    }),
    [margins],
  );

  const marginsValid =
    pageDims !== null &&
    marginsInPt.left + marginsInPt.right < pageDims.width &&
    marginsInPt.top + marginsInPt.bottom < pageDims.height;

  const isValid = marginsValid && (applyToAll || selectedPages.size > 0);

  const handleCrop = useCallback(async () => {
    if (!pdf.file || !isValid) return;
    const file = pdf.file;
    await task.run(async () => {
      const pageIndices = applyToAll ? undefined : Array.from(selectedPages).sort((a, b) => a - b);
      const result = await cropPages(file, marginsInPt, pageIndices);
      downloadPdf(result, pdfFilename(file, "_cropped"));
    }, "Failed to crop pages. Please try again.");
  }, [pdf.file, marginsInPt, applyToAll, selectedPages, isValid, task]);

  const handleUncrop = useCallback(async () => {
    if (!pdf.file) return;
    const file = pdf.file;
    await task.run(async () => {
      const pageIndices = applyToAll ? undefined : Array.from(selectedPages).sort((a, b) => a - b);
      const result = await uncropPages(file, pageIndices);
      downloadPdf(result, pdfFilename(file, "_uncropped"));
    }, "Failed to remove crop. Please try again.");
  }, [pdf.file, applyToAll, selectedPages, task]);

  const inputClass =
    "w-full border border-slate-300 dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-white dark:bg-dark-surface text-slate-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary-500";

  // Suppress unused ref warning — it's used for layout
  useEffect(() => void previewRef.current, []);

  const firstThumb = allThumbs[0] ?? null;

  return (
    <div className="space-y-6">
      {!pdf.file ? (
        <FileDropZone
          glowColor={categoryGlow.transform}
          iconColor={categoryAccent.transform}
          accept=".pdf,application/pdf"
          onFiles={pdf.onFiles}
          label="Drop a PDF file here"
          hint="Set margins to crop the visible area of each page"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={pdf.file.name}
            details={formatFileSize(pdf.file.size)}
            onChangeFile={pdf.reset}
          />

          {loading ? (
            <LoadingSpinner color="border-violet-200 border-t-violet-600" />
          ) : (
            <>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                  Set margins to crop the visible area of each page
                </p>
                {isDirty && <ResetButton onClick={handleReset} />}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left: controls */}
                <div className="space-y-4">
                  <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border shadow-sm p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-dark-text-muted">
                        <Scissors className="w-3.5 h-3.5" />
                        Margins to hide (mm)
                      </p>
                      {/* Mode toggle */}
                      <div className="inline-flex rounded-lg border border-slate-200 dark:border-dark-border p-0.5 bg-slate-100 dark:bg-dark-surface-alt">
                        <button
                          type="button"
                          onClick={() => {
                            setMarginMode("uniform");
                            setAllSides(0);
                            setMargins({ top: 0, right: 0, bottom: 0, left: 0 });
                          }}
                          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                            marginMode === "uniform"
                              ? "bg-white dark:bg-dark-surface text-slate-900 dark:text-dark-text shadow-sm"
                              : "text-slate-500 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text"
                          }`}
                        >
                          All Sides
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMarginMode("custom");
                            setMargins({
                              top: allSides,
                              right: allSides,
                              bottom: allSides,
                              left: allSides,
                            });
                          }}
                          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                            marginMode === "custom"
                              ? "bg-white dark:bg-dark-surface text-slate-900 dark:text-dark-text shadow-sm"
                              : "text-slate-500 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text"
                          }`}
                        >
                          Custom
                        </button>
                      </div>
                    </div>

                    {/* Uniform input */}
                    {marginMode === "uniform" && (
                      <div>
                        <label
                          htmlFor="crop-all"
                          className="flex justify-between text-sm text-slate-600 dark:text-dark-text-muted mb-1"
                        >
                          <span>All sides</span>
                          <span>{allSides} mm</span>
                        </label>
                        <input
                          id="crop-all"
                          type="number"
                          min={0}
                          step={1}
                          value={allSides}
                          onChange={(e) => setUniformMargin(Number(e.target.value))}
                          className={inputClass}
                        />
                      </div>
                    )}

                    {/* Custom inputs */}
                    {marginMode === "custom" && (
                      <>
                        {/* Top */}
                        <div>
                          <label
                            htmlFor="crop-top"
                            className="flex justify-between text-sm text-slate-600 dark:text-dark-text-muted mb-1"
                          >
                            <span>Top</span>
                            <span>{margins.top} mm</span>
                          </label>
                          <input
                            id="crop-top"
                            type="number"
                            min={0}
                            step={1}
                            value={margins.top}
                            onChange={(e) => setMargin("top", Number(e.target.value))}
                            className={inputClass}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          {/* Left */}
                          <div>
                            <label
                              htmlFor="crop-left"
                              className="flex justify-between text-sm text-slate-600 dark:text-dark-text-muted mb-1"
                            >
                              <span>Left</span>
                              <span>{margins.left} mm</span>
                            </label>
                            <input
                              id="crop-left"
                              type="number"
                              min={0}
                              step={1}
                              value={margins.left}
                              onChange={(e) => setMargin("left", Number(e.target.value))}
                              className={inputClass}
                            />
                          </div>
                          {/* Right */}
                          <div>
                            <label
                              htmlFor="crop-right"
                              className="flex justify-between text-sm text-slate-600 dark:text-dark-text-muted mb-1"
                            >
                              <span>Right</span>
                              <span>{margins.right} mm</span>
                            </label>
                            <input
                              id="crop-right"
                              type="number"
                              min={0}
                              step={1}
                              value={margins.right}
                              onChange={(e) => setMargin("right", Number(e.target.value))}
                              className={inputClass}
                            />
                          </div>
                        </div>

                        {/* Bottom */}
                        <div>
                          <label
                            htmlFor="crop-bottom"
                            className="flex justify-between text-sm text-slate-600 dark:text-dark-text-muted mb-1"
                          >
                            <span>Bottom</span>
                            <span>{margins.bottom} mm</span>
                          </label>
                          <input
                            id="crop-bottom"
                            type="number"
                            min={0}
                            step={1}
                            value={margins.bottom}
                            onChange={(e) => setMargin("bottom", Number(e.target.value))}
                            className={inputClass}
                          />
                        </div>
                      </>
                    )}

                    {!marginsValid &&
                      (margins.top > 0 ||
                        margins.right > 0 ||
                        margins.bottom > 0 ||
                        margins.left > 0) && (
                        <p className="text-sm text-red-500">
                          Margins exceed page dimensions — reduce them.
                        </p>
                      )}
                  </div>

                  <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border shadow-sm p-3 space-y-1">
                    <p className="text-xs text-slate-500 dark:text-dark-text-muted">
                      <strong>Crop</strong> sets a crop box that hides margins from view without
                      permanently removing them — the hidden content stays in the file.
                    </p>
                    <p className="text-xs text-slate-500 dark:text-dark-text-muted">
                      <strong>Remove crop</strong> deletes any existing crop box, restoring the full
                      visible area of each page.
                    </p>
                  </div>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyToAll}
                      onChange={(e) => handleApplyToAllChange(e.target.checked)}
                      className="w-4 h-4 text-primary-600 rounded"
                    />
                    <span className="text-sm text-slate-700 dark:text-dark-text">
                      Apply to all pages
                    </span>
                  </label>

                  {/* Per-page selector */}
                  {!applyToAll && allThumbs.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <p className="text-sm text-slate-600 dark:text-dark-text-muted break-all sm:break-normal">
                          Select pages to crop
                        </p>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => setSelectedPages(new Set(allThumbs.map((_, i) => i)))}
                            className="text-xs text-primary-600 hover:text-primary-700"
                          >
                            All
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedPages(new Set())}
                            className="text-xs text-primary-600 hover:text-primary-700"
                          >
                            None
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-dark-border p-2">
                        {allThumbs.map((thumb, i) => (
                          <PageThumbnail
                            key={thumb}
                            src={thumb}
                            pageNumber={i + 1}
                            selected={selectedPages.has(i)}
                            onClick={() => togglePage(i)}
                            overlay={
                              selectedPages.has(i) ? (
                                <div className="bg-primary-500/20 inset-0 absolute flex items-center justify-center">
                                  <div className="w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center">
                                    <Check className="w-3 h-3 text-white" strokeWidth={3} />
                                  </div>
                                </div>
                              ) : null
                            }
                          />
                        ))}
                      </div>
                      {selectedPages.size === 0 && (
                        <p className="text-xs text-red-500">Select at least one page.</p>
                      )}
                      {selectedPages.size > 0 && (
                        <p className="text-xs text-slate-500 dark:text-dark-text-muted">
                          {selectedPages.size} of {allThumbs.length} page
                          {allThumbs.length !== 1 ? "s" : ""} selected
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    <ActionButton
                      onClick={handleCrop}
                      processing={processing}
                      disabled={processing || !isValid}
                      label="Crop & Download"
                      processingLabel="Processing…"
                      color="bg-violet-600 hover:bg-violet-700"
                    />
                    <button
                      type="button"
                      onClick={handleUncrop}
                      disabled={processing || (!applyToAll && selectedPages.size === 0)}
                      className="w-full bg-slate-100 dark:bg-dark-surface text-slate-700 dark:text-dark-text py-3 px-6 rounded-xl font-medium hover:bg-slate-200 dark:hover:bg-dark-border disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-slate-200 dark:border-dark-border"
                    >
                      {processing ? "Processing…" : "Remove Crop & Download"}
                    </button>
                  </div>
                </div>

                {/* Right: preview */}
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-dark-text mb-2">
                    Preview (first page)
                  </p>
                  {firstThumb && (
                    <div
                      ref={previewRef}
                      className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-dark-border"
                    >
                      <img src={firstThumb} alt="Page preview" className="w-full block" />
                      {overlay && (
                        <>
                          {/* Top mask */}
                          <div
                            className="absolute top-0 left-0 right-0 bg-black/40"
                            style={{ height: `${overlay.top}%` }}
                          />
                          {/* Bottom mask */}
                          <div
                            className="absolute bottom-0 left-0 right-0 bg-black/40"
                            style={{ height: `${overlay.bottom}%` }}
                          />
                          {/* Left mask */}
                          <div
                            className="absolute bg-black/40"
                            style={{
                              top: `${overlay.top}%`,
                              bottom: `${overlay.bottom}%`,
                              left: 0,
                              width: `${overlay.left}%`,
                            }}
                          />
                          {/* Right mask */}
                          <div
                            className="absolute bg-black/40"
                            style={{
                              top: `${overlay.top}%`,
                              bottom: `${overlay.bottom}%`,
                              right: 0,
                              width: `${overlay.right}%`,
                            }}
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {error && <AlertBox message={error} />}
    </div>
  );
}
