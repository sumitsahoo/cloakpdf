/**
 * Compare PDFs tool.
 *
 * Accepts two PDF files and renders a side-by-side visual comparison.
 * For each pair of corresponding pages, a pixel-level difference is
 * computed and displayed as an overlay with a percentage change score.
 * Extra pages (when page counts differ) are shown with a notice.
 */

import { ArrowLeftRight, ChevronLeft, ChevronRight, Eye, EyeOff, Layers } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useMemo, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { canvas as canvasColors, categoryAccent, categoryGlow } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { formatFileSize } from "../utils/file-helpers.ts";
import { pdfjsLib } from "../utils/pdf-renderer.ts";

/**
 * Convert a canvas to a Blob URL (more memory-efficient than data-URLs).
 * The caller is responsible for revoking the URL via `URL.revokeObjectURL`.
 */
async function canvasToBlobUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(URL.createObjectURL(blob));
      else reject(new Error("Canvas toBlob returned null"));
    }, "image/png");
  });
}

/** Rendered data for a single page pair. */
interface PageComparison {
  /** 1-based page number. */
  page: number;
  /** Blob URL of the rendered page from the first PDF (or null if beyond its page count). */
  thumbA: string | null;
  /** Blob URL of the rendered page from the second PDF (or null if beyond its page count). */
  thumbB: string | null;
  /** Blob URL of the pixel-diff overlay (red highlight on transparent). */
  diffThumb: string | null;
  /** Percentage of pixels that differ (0–100). */
  diffPercent: number;
}

/**
 * Render a single page of a PDF at the given scale and return the canvas.
 * The caller owns the canvas and must release its memory.
 */
async function renderPageToCanvas(
  pdf: PDFDocumentProxy,
  pageNum: number,
  scale: number,
): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(`Failed to acquire 2D context for page ${pageNum}`);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas;
}

/**
 * Compare two canvases pixel-by-pixel. Returns a diff canvas (changed
 * pixels drawn in red over a dimmed composite) and the percentage of
 * pixels that differ beyond the colour threshold.
 */
function diffCanvases(
  canvasA: HTMLCanvasElement,
  canvasB: HTMLCanvasElement,
  threshold = 30,
): { diffCanvas: HTMLCanvasElement; diffPercent: number } {
  // Use the larger dimensions to handle mismatched sizes
  const w = Math.max(canvasA.width, canvasB.width);
  const h = Math.max(canvasA.height, canvasB.height);

  const diffCanvas = document.createElement("canvas");
  diffCanvas.width = w;
  diffCanvas.height = h;
  const diffCtx = diffCanvas.getContext("2d");
  if (!diffCtx) throw new Error("Failed to acquire 2D context for diff canvas");

  // Get pixel data from both canvases (resized to common dimensions)
  const tmpA = document.createElement("canvas");
  tmpA.width = w;
  tmpA.height = h;
  const ctxA = tmpA.getContext("2d");
  if (!ctxA) throw new Error("Failed to acquire 2D context");
  ctxA.drawImage(canvasA, 0, 0, w, h);
  const dataA = ctxA.getImageData(0, 0, w, h).data;

  const tmpB = document.createElement("canvas");
  tmpB.width = w;
  tmpB.height = h;
  const ctxB = tmpB.getContext("2d");
  if (!ctxB) throw new Error("Failed to acquire 2D context");
  ctxB.drawImage(canvasB, 0, 0, w, h);
  const dataB = ctxB.getImageData(0, 0, w, h).data;

  // Build the diff overlay
  const diffImgData = diffCtx.createImageData(w, h);
  const out = diffImgData.data;
  let changedPixels = 0;
  const totalPixels = w * h;

  for (let i = 0; i < dataA.length; i += 4) {
    const dr = Math.abs(dataA[i] - dataB[i]);
    const dg = Math.abs(dataA[i + 1] - dataB[i + 1]);
    const db = Math.abs(dataA[i + 2] - dataB[i + 2]);

    if (dr > threshold || dg > threshold || db > threshold) {
      // Mark changed pixel with diff highlight colour
      out[i] = canvasColors.diffHighlight.r;
      out[i + 1] = canvasColors.diffHighlight.g;
      out[i + 2] = canvasColors.diffHighlight.b;
      out[i + 3] = canvasColors.diffHighlight.a;
      changedPixels++;
    } else {
      // Unchanged — transparent
      out[i + 3] = 0;
    }
  }

  diffCtx.putImageData(diffImgData, 0, 0);

  // Release temp canvases
  tmpA.width = 0;
  tmpA.height = 0;
  tmpB.width = 0;
  tmpB.height = 0;

  return {
    diffCanvas,
    diffPercent: totalPixels > 0 ? (changedPixels / totalPixels) * 100 : 0,
  };
}

/**
 * Compare all pages of two PDFs and return per-page comparison data.
 */
async function comparePdfs(
  pdfA: PDFDocumentProxy,
  pdfB: PDFDocumentProxy,
  scale: number,
  onProgress?: (done: number, total: number) => void,
): Promise<PageComparison[]> {
  const maxPages = Math.max(pdfA.numPages, pdfB.numPages);
  const results: PageComparison[] = [];

  for (let p = 1; p <= maxPages; p++) {
    let canvasA: HTMLCanvasElement | null = null;
    let canvasB: HTMLCanvasElement | null = null;

    if (p <= pdfA.numPages) canvasA = await renderPageToCanvas(pdfA, p, scale);
    if (p <= pdfB.numPages) canvasB = await renderPageToCanvas(pdfB, p, scale);

    let thumbA: string | null = null;
    let thumbB: string | null = null;
    let diffThumb: string | null = null;
    let diffPercent = 0;

    if (canvasA) thumbA = await canvasToBlobUrl(canvasA);
    if (canvasB) thumbB = await canvasToBlobUrl(canvasB);

    if (canvasA && canvasB) {
      const { diffCanvas, diffPercent: pct } = diffCanvases(canvasA, canvasB);
      diffThumb = await canvasToBlobUrl(diffCanvas);
      diffPercent = pct;
      diffCanvas.width = 0;
      diffCanvas.height = 0;
    } else {
      // One side is missing — 100% different
      diffPercent = 100;
    }

    // Release canvas memory
    if (canvasA) {
      canvasA.width = 0;
      canvasA.height = 0;
    }
    if (canvasB) {
      canvasB.width = 0;
      canvasB.height = 0;
    }

    results.push({ page: p, thumbA, thumbB, diffThumb, diffPercent });
    onProgress?.(p, maxPages);
  }

  return results;
}

/** Badge colour based on diff percentage. */
function diffBadgeClass(pct: number): string {
  if (pct === 0)
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (pct < 5) return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
}

type ViewMode = "side-by-side" | "diff-overlay";

export default function ComparePdf() {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [comparisons, setComparisons] = useState<PageComparison[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("side-by-side");
  const [currentPage, setCurrentPage] = useState(0);
  const [showDiffOverlay, setShowDiffOverlay] = useState(true);

  // The compare workflow aliases the shared hook's "processing" as "loading"
  // to match this tool's pre-existing vocabulary (there's no separate upload
  // step — comparison runs in one shot).
  const task = useAsyncProcess();
  const loading = task.processing;
  const error = task.error;
  const setError = task.setError;

  const handleFileA = useCallback(
    (files: File[]) => {
      if (files[0]) {
        setFileA(files[0]);
        setComparisons([]);
        setError(null);
      }
    },
    [setError],
  );

  const handleFileB = useCallback(
    (files: File[]) => {
      if (files[0]) {
        setFileB(files[0]);
        setComparisons([]);
        setError(null);
      }
    },
    [setError],
  );

  const handleCompare = useCallback(async () => {
    if (!fileA || !fileB) return;
    // Revoke any existing blob URLs before starting a new comparison
    for (const c of comparisons) {
      if (c.thumbA) URL.revokeObjectURL(c.thumbA);
      if (c.thumbB) URL.revokeObjectURL(c.thumbB);
      if (c.diffThumb) URL.revokeObjectURL(c.diffThumb);
    }
    setProgress(null);
    setComparisons([]);
    setCurrentPage(0);

    const ok = await task.run(async () => {
      const [bufA, bufB] = await Promise.all([fileA.arrayBuffer(), fileB.arrayBuffer()]);
      const [pdfA, pdfB] = await Promise.all([
        pdfjsLib.getDocument({ data: bufA }).promise,
        pdfjsLib.getDocument({ data: bufB }).promise,
      ]);

      const results = await comparePdfs(pdfA, pdfB, 1.5, (done, total) =>
        setProgress({ done, total }),
      );

      void pdfA.destroy();
      void pdfB.destroy();

      setComparisons(results);
    }, "Failed to compare PDFs. One of the files may be corrupted or password-protected.");
    void ok;
    setProgress(null);
  }, [fileA, fileB, comparisons, task]);

  const reset = useCallback(() => {
    // Revoke blob URLs to free memory
    for (const c of comparisons) {
      if (c.thumbA) URL.revokeObjectURL(c.thumbA);
      if (c.thumbB) URL.revokeObjectURL(c.thumbB);
      if (c.diffThumb) URL.revokeObjectURL(c.diffThumb);
    }
    setFileA(null);
    setFileB(null);
    setComparisons([]);
    setError(null);
    setCurrentPage(0);
  }, [comparisons, setError]);

  const summary = useMemo(() => {
    if (comparisons.length === 0) return null;
    const identical = comparisons.filter((c) => c.diffPercent === 0).length;
    const changed = comparisons.length - identical;
    const avgDiff = comparisons.reduce((sum, c) => sum + c.diffPercent, 0) / comparisons.length;
    return { identical, changed, avgDiff, total: comparisons.length };
  }, [comparisons]);

  const current = comparisons[currentPage] as PageComparison | undefined;

  // ── Upload screen (no files, or files loaded but not yet compared / still comparing) ──
  if (!fileA || !fileB || comparisons.length === 0 || loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* File A */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-dark-text flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-xs font-bold">
                A
              </span>
              Original PDF
            </p>
            {fileA ? (
              <div className="flex items-center justify-between bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border p-3">
                <p className="text-sm text-slate-600 dark:text-dark-text-muted truncate">
                  <span className="font-medium">{fileA.name}</span> — {formatFileSize(fileA.size)}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setFileA(null);
                    setComparisons([]);
                  }}
                  className="text-sm text-primary-600 hover:text-primary-700 shrink-0 ml-2"
                >
                  Change
                </button>
              </div>
            ) : (
              <FileDropZone
                glowColor={categoryGlow.security}
                iconColor={categoryAccent.security}
                accept=".pdf,application/pdf"
                onFiles={handleFileA}
                label="Drop the original PDF"
                hint="First document to compare"
              />
            )}
          </div>

          {/* File B */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-dark-text flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-xs font-bold">
                B
              </span>
              Modified PDF
            </p>
            {fileB ? (
              <div className="flex items-center justify-between bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border p-3">
                <p className="text-sm text-slate-600 dark:text-dark-text-muted truncate">
                  <span className="font-medium">{fileB.name}</span> — {formatFileSize(fileB.size)}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setFileB(null);
                    setComparisons([]);
                  }}
                  className="text-sm text-primary-600 hover:text-primary-700 shrink-0 ml-2"
                >
                  Change
                </button>
              </div>
            ) : (
              <FileDropZone
                glowColor={categoryGlow.security}
                iconColor={categoryAccent.security}
                accept=".pdf,application/pdf"
                onFiles={handleFileB}
                label="Drop the modified PDF"
                hint="Second document to compare"
              />
            )}
          </div>
        </div>

        {fileA && fileB && (
          <>
            <ActionButton
              onClick={handleCompare}
              processing={loading}
              label="Compare PDFs"
              processingLabel="Comparing…"
            />

            {loading && progress && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-slate-600 dark:text-dark-text-muted">
                  <span>Comparing pages…</span>
                  <span>
                    {progress.done} / {progress.total}
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-dark-border rounded-full h-2">
                  <div
                    className="bg-primary-600 h-2 rounded-full transition-all"
                    style={{ width: `${(progress.done / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {error && <AlertBox message={error} />}
      </div>
    );
  }

  // ── Comparison results ───────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Summary banner */}
      {summary && (
        <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border shadow-sm p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="text-sm text-slate-600 dark:text-dark-text-muted">
                <span className="font-semibold text-slate-800 dark:text-dark-text">
                  {summary.total}
                </span>{" "}
                page{summary.total !== 1 && "s"} compared
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  {summary.identical} identical
                </span>
                {summary.changed > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                    {summary.changed} changed
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={reset}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              New comparison
            </button>
          </div>
        </div>
      )}

      {/* View mode toggle & page nav */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="inline-flex items-center gap-0.5 rounded-xl bg-slate-100 dark:bg-dark-bg p-1 border border-slate-200 dark:border-dark-border">
          <button
            type="button"
            onClick={() => setViewMode("side-by-side")}
            className={`flex items-center gap-1.5 rounded-lg py-1.5 px-3 text-sm transition-all duration-150 ${
              viewMode === "side-by-side"
                ? "font-semibold text-white bg-primary-600 shadow-sm"
                : "font-medium text-slate-500 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text hover:bg-white/60 dark:hover:bg-dark-surface-alt"
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Side by Side
          </button>
          <button
            type="button"
            onClick={() => setViewMode("diff-overlay")}
            className={`flex items-center gap-1.5 rounded-lg py-1.5 px-3 text-sm transition-all duration-150 ${
              viewMode === "diff-overlay"
                ? "font-semibold text-white bg-primary-600 shadow-sm"
                : "font-medium text-slate-500 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text hover:bg-white/60 dark:hover:bg-dark-surface-alt"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Diff Overlay
          </button>
        </div>

        {/* Page navigation */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-dark-border hover:bg-slate-50 dark:hover:bg-dark-surface-alt disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-dark-text-muted" />
          </button>
          <span className="text-sm font-medium text-slate-700 dark:text-dark-text tabular-nums min-w-20 text-center">
            Page {currentPage + 1} of {comparisons.length}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(comparisons.length - 1, p + 1))}
            disabled={currentPage === comparisons.length - 1}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-dark-border hover:bg-slate-50 dark:hover:bg-dark-surface-alt disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4 text-slate-600 dark:text-dark-text-muted" />
          </button>
        </div>
      </div>

      {/* Current page comparison */}
      {current && (
        <div className="space-y-3">
          {/* Diff badge */}
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${diffBadgeClass(current.diffPercent)}`}
            >
              {current.diffPercent === 0
                ? "Identical"
                : `${current.diffPercent.toFixed(1)}% changed`}
            </span>
            {!current.thumbA && (
              <span className="text-xs text-slate-400 dark:text-dark-text-muted">
                Page only in modified PDF
              </span>
            )}
            {!current.thumbB && (
              <span className="text-xs text-slate-400 dark:text-dark-text-muted">
                Page only in original PDF
              </span>
            )}
          </div>

          {viewMode === "side-by-side" ? (
            <div className="grid grid-cols-2 gap-4">
              {/* File A */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-500 dark:text-dark-text-muted flex items-center gap-1.5">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-[10px] font-bold">
                    A
                  </span>
                  Original
                </p>
                <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface">
                  {current.thumbA ? (
                    <img
                      src={current.thumbA}
                      alt={`Original — page ${current.page}`}
                      className="w-full h-auto"
                    />
                  ) : (
                    <div className="aspect-3/4 flex items-center justify-center text-slate-400 dark:text-dark-text-muted text-sm">
                      No page
                    </div>
                  )}
                </div>
              </div>

              {/* File B */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-500 dark:text-dark-text-muted flex items-center gap-1.5">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-[10px] font-bold">
                    B
                  </span>
                  Modified
                </p>
                <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface">
                  {current.thumbB ? (
                    <img
                      src={current.thumbB}
                      alt={`Modified — page ${current.page}`}
                      className="w-full h-auto"
                    />
                  ) : (
                    <div className="aspect-3/4 flex items-center justify-center text-slate-400 dark:text-dark-text-muted text-sm">
                      No page
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Diff overlay view */
            <div className="space-y-2">
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setShowDiffOverlay((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text transition-colors"
                >
                  {showDiffOverlay ? (
                    <Eye className="w-3.5 h-3.5" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5" />
                  )}
                  {showDiffOverlay ? "Diff on" : "Diff off"}
                </button>
              </div>
              <div className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface max-w-2xl mx-auto">
                {current.thumbA ? (
                  <img
                    src={current.thumbA}
                    alt={`Original — page ${current.page}`}
                    className="w-full h-auto"
                  />
                ) : current.thumbB ? (
                  <img
                    src={current.thumbB}
                    alt={`Modified — page ${current.page}`}
                    className="w-full h-auto"
                  />
                ) : null}
                {showDiffOverlay && current.diffThumb && (
                  <img
                    src={current.diffThumb}
                    alt="Difference overlay"
                    className="absolute inset-0 w-full h-full"
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Page strip — mini thumbnails for quick navigation */}
      <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border shadow-sm p-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-dark-text-muted mb-2">
          All Pages
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {comparisons.map((comp) => (
            <button
              type="button"
              key={comp.page}
              onClick={() => setCurrentPage(comp.page - 1)}
              className={`relative shrink-0 w-14 rounded-md overflow-hidden border-2 transition-[border-color,box-shadow] ${
                comp.page - 1 === currentPage
                  ? "border-primary-500 ring-2 ring-primary-200 dark:ring-primary-800"
                  : "border-slate-200 dark:border-dark-border hover:border-primary-300"
              }`}
              aria-label={`Page ${comp.page}`}
            >
              <div className="aspect-3/4 bg-slate-50 dark:bg-dark-bg flex items-center justify-center">
                {comp.thumbA ? (
                  <img
                    src={comp.thumbA}
                    alt={`Page ${comp.page}`}
                    className="w-full h-full object-cover"
                  />
                ) : comp.thumbB ? (
                  <img
                    src={comp.thumbB}
                    alt={`Page ${comp.page}`}
                    className="w-full h-full object-cover"
                  />
                ) : null}
              </div>
              <div
                className={`absolute bottom-0 left-0 right-0 h-1 ${
                  comp.diffPercent === 0
                    ? "bg-emerald-400"
                    : comp.diffPercent < 5
                      ? "bg-amber-400"
                      : "bg-red-400"
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      {error && <AlertBox message={error} />}
    </div>
  );
}
