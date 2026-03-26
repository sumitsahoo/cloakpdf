/**
 * Crop Pages tool.
 *
 * Sets a crop box on pages to trim the visible area. Margins are entered in
 * millimetres and converted to PDF points internally. A live preview on the
 * first page uses a semi-transparent overlay to show what will be hidden.
 * The crop is non-destructive — hidden content stays in the file but is not
 * rendered or printed.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { cropPages } from "../utils/pdf-operations.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";
import type { CropMargins } from "../types.ts";

const MM_TO_PT = 2.83465;

interface PageDims {
  width: number;
  height: number;
}

export default function CropPages() {
  const [file, setFile] = useState<File | null>(null);
  const [firstThumb, setFirstThumb] = useState<string | null>(null);
  const [pageDims, setPageDims] = useState<PageDims | null>(null);
  // Margins in mm (user input)
  const [margins, setMargins] = useState<CropMargins>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [applyToAll, setApplyToAll] = useState(true);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setFirstThumb(null);
    setPageDims(null);
    setMargins({ top: 0, right: 0, bottom: 0, left: 0 });
    setError(null);
    setLoading(true);
    try {
      const thumbs = await renderAllThumbnails(pdf, 0.5);
      if (thumbs[0]) setFirstThumb(thumbs[0]);

      // Get page dimensions from pdf-lib
      const { PDFDocument } = await import("pdf-lib");
      const arrayBuffer = await pdf.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const dims = pdfDoc.getPage(0).getSize();
      setPageDims(dims);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to load PDF. The file may be corrupted or password-protected.",
      );
      setFile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const setMargin = useCallback((side: keyof CropMargins, mm: number) => {
    setMargins((prev) => ({ ...prev, [side]: Math.max(0, mm) }));
  }, []);

  // Compute overlay percentages from mm margins relative to page dimensions in pt
  const overlay = pageDims
    ? {
        top: Math.min((margins.top * MM_TO_PT) / pageDims.height, 0.99) * 100,
        right: Math.min((margins.right * MM_TO_PT) / pageDims.width, 0.99) * 100,
        bottom: Math.min((margins.bottom * MM_TO_PT) / pageDims.height, 0.99) * 100,
        left: Math.min((margins.left * MM_TO_PT) / pageDims.width, 0.99) * 100,
      }
    : null;

  const marginsInPt: CropMargins = {
    top: margins.top * MM_TO_PT,
    right: margins.right * MM_TO_PT,
    bottom: margins.bottom * MM_TO_PT,
    left: margins.left * MM_TO_PT,
  };

  const isValid =
    pageDims !== null &&
    marginsInPt.left + marginsInPt.right < pageDims.width &&
    marginsInPt.top + marginsInPt.bottom < pageDims.height;

  const handleCrop = useCallback(async () => {
    if (!file || !isValid) return;
    setProcessing(true);
    setError(null);
    try {
      const result = await cropPages(file, marginsInPt, applyToAll ? undefined : [0]);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_cropped.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to crop pages. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file, marginsInPt, applyToAll, isValid]);

  const inputClass =
    "w-full border border-slate-300 dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-white dark:bg-dark-surface text-slate-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary-500";

  // Suppress unused ref warning — it's used for layout
  useEffect(() => void previewRef.current, []);

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Set margins to crop the visible area of each page"
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted">
              <span className="font-medium">{file.name}</span> — {formatFileSize(file.size)}
            </p>
            <button
              onClick={() => setFile(null)}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              Change file
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: controls */}
              <div className="space-y-4">
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                  Margins to hide (mm)
                </p>

                {/* Top */}
                <div>
                  <label className="flex justify-between text-sm text-slate-600 dark:text-dark-text-muted mb-1">
                    <span>Top</span>
                    <span>{margins.top} mm</span>
                  </label>
                  <input
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
                    <label className="flex justify-between text-sm text-slate-600 dark:text-dark-text-muted mb-1">
                      <span>Left</span>
                      <span>{margins.left} mm</span>
                    </label>
                    <input
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
                    <label className="flex justify-between text-sm text-slate-600 dark:text-dark-text-muted mb-1">
                      <span>Right</span>
                      <span>{margins.right} mm</span>
                    </label>
                    <input
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
                  <label className="flex justify-between text-sm text-slate-600 dark:text-dark-text-muted mb-1">
                    <span>Bottom</span>
                    <span>{margins.bottom} mm</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={margins.bottom}
                    onChange={(e) => setMargin("bottom", Number(e.target.value))}
                    className={inputClass}
                  />
                </div>

                {!isValid &&
                  (margins.top > 0 ||
                    margins.right > 0 ||
                    margins.bottom > 0 ||
                    margins.left > 0) && (
                    <p className="text-sm text-red-500">
                      Margins exceed page dimensions — reduce them.
                    </p>
                  )}

                <div className="bg-slate-50 dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border p-3">
                  <p className="text-xs text-slate-500 dark:text-dark-text-muted">
                    Cropping is <strong>non-destructive</strong>: it sets a crop box that hides
                    content from view without permanently removing it. The hidden area remains in
                    the file.
                  </p>
                </div>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyToAll}
                    onChange={(e) => setApplyToAll(e.target.checked)}
                    className="w-4 h-4 text-primary-600 rounded"
                  />
                  <span className="text-sm text-slate-700 dark:text-dark-text">
                    Apply to all pages
                  </span>
                </label>

                <button
                  onClick={handleCrop}
                  disabled={processing || !isValid}
                  className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {processing ? "Cropping…" : "Crop & Download"}
                </button>
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
          )}
        </>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}
    </div>
  );
}
