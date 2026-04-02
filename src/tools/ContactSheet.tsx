/**
 * Contact Sheet tool.
 *
 * Renders all pages of a PDF as thumbnails arranged in a grid on a single
 * image (PNG) or a single-page PDF. Useful for quickly reviewing a long
 * document's structure at a glance — like a photographic contact sheet.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Grid3X3, Image, Tag } from "lucide-react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { downloadBlob, formatFileSize } from "../utils/file-helpers.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";

type GridLayout = "2x2" | "3x3" | "4x4" | "5x5";
type OutputFormat = "png" | "pdf";

const GRID_OPTIONS: { value: GridLayout; label: string; pages: number }[] = [
  { value: "2x2", label: "2 × 2", pages: 4 },
  { value: "3x3", label: "3 × 3", pages: 9 },
  { value: "4x4", label: "4 × 4", pages: 16 },
  { value: "5x5", label: "5 × 5", pages: 25 },
];

export default function ContactSheet() {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [grid, setGrid] = useState<GridLayout>("3x3");
  const [output, setOutput] = useState<OutputFormat>("png");
  const [showLabels, setShowLabels] = useState(true);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(0);

  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setError(null);
    setLoading(true);
    try {
      const thumbs = await renderAllThumbnails(pdf, 0.5);
      setThumbnails(thumbs);
      setPageCount(thumbs.length);
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

  // Track preview container width for responsive sizing
  useEffect(() => {
    if (!previewRef.current) return;
    const el = previewRef.current;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width) setPreviewWidth(rect.width);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [thumbnails]);

  const cols = Number(grid[0]);
  const perSheet = cols * cols;
  const sheetsNeeded = pageCount > 0 ? Math.ceil(pageCount / perSheet) : 0;

  // Thumbnails for the first sheet preview (cap at perSheet)
  const previewThumbs = useMemo(() => thumbnails.slice(0, perSheet), [thumbnails, perSheet]);

  // Calculate cell dimensions for the preview grid
  const previewPad = Math.max(4, Math.round(previewWidth * 0.015));
  const cellSize =
    previewWidth > 0 ? Math.floor((previewWidth - previewPad * (cols + 1)) / cols) : 0;
  const labelFontSize = Math.max(8, Math.round(cellSize * 0.09));
  const labelHeight = showLabels ? labelFontSize + 6 : 0;

  const handleGenerate = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setProgress({ current: 0, total: pageCount });
    setError(null);

    try {
      const totalSheets = Math.ceil(pageCount / perSheet);

      // Render all pages via PDF.js
      const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?worker&url");
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;

      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      // Decide thumbnail render scale based on grid density
      const thumbScale = cols <= 2 ? 1.5 : cols <= 3 ? 1.0 : cols <= 4 ? 0.8 : 0.6;

      // Sheet dimensions: A4-ish at 150 DPI
      const sheetW = 2480;
      const sheetH = 3508;
      const pad = 40;
      const genLabelH = showLabels ? 28 : 0;
      const genCellW = Math.floor((sheetW - pad * (cols + 1)) / cols);
      const genCellH = Math.floor((sheetH - pad * (cols + 1)) / cols);

      const sheets: Blob[] = [];

      for (let sheet = 0; sheet < totalSheets; sheet++) {
        const canvas = document.createElement("canvas");
        canvas.width = sheetW;
        canvas.height = sheetH;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Failed to create canvas context");

        // White background
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, sheetW, sheetH);

        for (let slot = 0; slot < perSheet; slot++) {
          const pageIdx = sheet * perSheet + slot;
          if (pageIdx >= pageCount) break;

          const page = await pdfDoc.getPage(pageIdx + 1);
          const viewport = page.getViewport({ scale: thumbScale });

          // Render page to offscreen canvas
          const thumbCanvas = document.createElement("canvas");
          thumbCanvas.width = viewport.width;
          thumbCanvas.height = viewport.height;
          const thumbCtx = thumbCanvas.getContext("2d");
          if (!thumbCtx) continue;

          await page.render({
            canvasContext: thumbCtx,
            viewport,
            canvas: thumbCanvas,
          }).promise;

          // Calculate cell position
          const col = slot % cols;
          const row = Math.floor(slot / cols);
          const cellX = pad + col * (genCellW + pad);
          const cellY = pad + row * (genCellH + pad);

          // Scale thumbnail to fit cell while maintaining aspect ratio
          const drawAreaH = genCellH - genLabelH;
          const scale = Math.min(genCellW / viewport.width, drawAreaH / viewport.height);
          const drawW = viewport.width * scale;
          const drawH = viewport.height * scale;
          const drawX = cellX + (genCellW - drawW) / 2;
          const drawY = cellY + (drawAreaH - drawH) / 2;

          // Light border around the thumbnail
          ctx.strokeStyle = "#e2e8f0";
          ctx.lineWidth = 2;
          ctx.strokeRect(drawX - 1, drawY - 1, drawW + 2, drawH + 2);

          // Draw the thumbnail
          ctx.drawImage(thumbCanvas, drawX, drawY, drawW, drawH);

          // Page label
          if (showLabels) {
            ctx.fillStyle = "#64748b";
            ctx.font = "bold 20px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(`Page ${pageIdx + 1}`, cellX + genCellW / 2, cellY + genCellH - 6);
          }

          // Release thumbnail canvas memory
          thumbCanvas.width = 0;
          thumbCanvas.height = 0;

          setProgress({ current: pageIdx + 1, total: pageCount });
        }

        // Convert sheet canvas to blob
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => {
            if (b) resolve(b);
            else reject(new Error("Failed to render contact sheet"));
          }, "image/png");
        });
        sheets.push(blob);

        canvas.width = 0;
        canvas.height = 0;
      }

      void pdfDoc.destroy();

      const baseName = file.name.replace(/\.pdf$/i, "");

      if (output === "pdf") {
        // Build a PDF containing each sheet as a page
        const { PDFDocument } = await import("pdf-lib");
        const pdfOut = await PDFDocument.create();

        for (const sheetBlob of sheets) {
          const bytes = new Uint8Array(await sheetBlob.arrayBuffer());
          const img = await pdfOut.embedPng(bytes);
          const page = pdfOut.addPage([img.width, img.height]);
          page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
        }

        const pdfBytes = await pdfOut.save();
        const pdfBlob = new Blob([pdfBytes as BlobPart], { type: "application/pdf" });
        downloadBlob(pdfBlob, `${baseName}_contact_sheet.pdf`);
      } else {
        // PNG: single image or ZIP
        if (sheets.length === 1) {
          downloadBlob(sheets[0], `${baseName}_contact_sheet.png`);
        } else {
          const JSZip = (await import("jszip")).default;
          const zip = new JSZip();
          for (let i = 0; i < sheets.length; i++) {
            const padded = String(i + 1).padStart(2, "0");
            zip.file(`${baseName}_contact_sheet_${padded}.png`, sheets[i]);
          }
          const zipBlob = await zip.generateAsync({ type: "blob" });
          downloadBlob(zipBlob, `${baseName}_contact_sheets.zip`);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate contact sheet.");
    } finally {
      setProcessing(false);
      setProgress(null);
    }
  }, [file, pageCount, grid, output, showLabels, cols, perSheet]);

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="All pages will be arranged into a visual thumbnail grid"
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted">
              <span className="font-medium">{file.name}</span>
              {loading ? " — loading…" : ` — ${pageCount} pages`}
              {!loading && pageCount > 0 && (
                <span className="text-primary-600 ml-2">({formatFileSize(file.size)})</span>
              )}
            </p>
            <button
              onClick={() => {
                setFile(null);
                setThumbnails([]);
                setPageCount(0);
              }}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              Change file
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-6 items-start">
            {/* Left column: controls */}
            <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border shadow-sm p-4 space-y-5">
              {/* Grid size */}
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-dark-text-muted mb-2">
                  <Grid3X3 className="w-3.5 h-3.5" />
                  Grid Layout
                </p>
                <div className="inline-flex w-full items-center gap-0.5 rounded-xl bg-slate-100 dark:bg-dark-bg p-1 border border-slate-200 dark:border-dark-border">
                  {GRID_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setGrid(opt.value)}
                      className={`flex-1 rounded-lg py-1.5 px-3 text-sm transition-all duration-150 ${
                        grid === opt.value
                          ? "font-semibold text-white bg-primary-600 shadow-sm"
                          : "font-medium text-slate-500 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text hover:bg-white/60 dark:hover:bg-dark-surface-alt"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {pageCount > 0 && (
                  <p className="text-xs text-slate-400 dark:text-dark-text-muted mt-1.5">
                    {perSheet} pages per sheet · {sheetsNeeded}{" "}
                    {sheetsNeeded === 1 ? "sheet" : "sheets"} total
                  </p>
                )}
              </div>

              {/* Output format */}
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-dark-text-muted mb-2">
                  <Image className="w-3.5 h-3.5" />
                  Output Format
                </p>
                <div className="inline-flex w-full items-center gap-0.5 rounded-xl bg-slate-100 dark:bg-dark-bg p-1 border border-slate-200 dark:border-dark-border">
                  {(["png", "pdf"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setOutput(f)}
                      className={`flex-1 rounded-lg py-1.5 px-3 text-sm transition-all duration-150 ${
                        output === f
                          ? "font-semibold text-white bg-primary-600 shadow-sm"
                          : "font-medium text-slate-500 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text hover:bg-white/60 dark:hover:bg-dark-surface-alt"
                      }`}
                    >
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Page labels toggle */}
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-dark-text-muted mb-2">
                  <Tag className="w-3.5 h-3.5" />
                  Page Labels
                </p>
                <div className="inline-flex w-full items-center gap-0.5 rounded-xl bg-slate-100 dark:bg-dark-bg p-1 border border-slate-200 dark:border-dark-border">
                  {([true, false] as const).map((val) => (
                    <button
                      key={String(val)}
                      onClick={() => setShowLabels(val)}
                      className={`flex-1 rounded-lg py-1.5 px-3 text-sm transition-all duration-150 ${
                        showLabels === val
                          ? "font-semibold text-white bg-primary-600 shadow-sm"
                          : "font-medium text-slate-500 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text hover:bg-white/60 dark:hover:bg-dark-surface-alt"
                      }`}
                    >
                      {val ? "Show labels" : "Hide labels"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right column: live preview */}
            <div className="sticky top-4">
              <p className="text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                Preview — Sheet 1{sheetsNeeded > 1 ? ` of ${sheetsNeeded}` : ""}
              </p>
              {loading ? (
                <div className="aspect-[7/10] bg-slate-100 dark:bg-dark-surface-alt rounded-lg flex items-center justify-center">
                  <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                </div>
              ) : (
                <div
                  ref={previewRef}
                  className="relative bg-white dark:bg-dark-surface rounded-lg border border-slate-200 dark:border-dark-border overflow-hidden shadow-sm"
                  style={{ aspectRatio: "7 / 10" }}
                >
                  {/* Grid of actual page thumbnails */}
                  <div className="absolute inset-0" style={{ padding: `${previewPad}px` }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${cols}, 1fr)`,
                        gridTemplateRows: `repeat(${cols}, 1fr)`,
                        gap: `${previewPad}px`,
                        width: "100%",
                        height: "100%",
                      }}
                    >
                      {Array.from({ length: perSheet }).map((_, idx) => {
                        const thumb = previewThumbs[idx];
                        const isOccupied = !!thumb;
                        return (
                          <div
                            key={idx}
                            className="flex flex-col items-center justify-center overflow-hidden"
                            style={{ minHeight: 0 }}
                          >
                            {isOccupied ? (
                              <>
                                <div
                                  className="relative flex-1 w-full flex items-center justify-center overflow-hidden"
                                  style={{ minHeight: 0 }}
                                >
                                  <img
                                    src={thumb}
                                    alt={`Page ${idx + 1}`}
                                    className="max-w-full max-h-full object-contain rounded-[2px]"
                                    style={{
                                      border: "1px solid #e2e8f0",
                                      display: "block",
                                    }}
                                    draggable={false}
                                  />
                                </div>
                                {showLabels && (
                                  <span
                                    className="text-slate-500 dark:text-dark-text-muted font-medium shrink-0 mt-0.5"
                                    style={{
                                      fontSize: `${labelFontSize}px`,
                                      lineHeight: `${labelHeight}px`,
                                    }}
                                  >
                                    {idx + 1}
                                  </span>
                                )}
                              </>
                            ) : (
                              <div className="w-full h-full rounded border border-dashed border-slate-200 dark:border-dark-border" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
              {sheetsNeeded > 1 && !loading && (
                <p className="text-xs text-slate-400 dark:text-dark-text-muted mt-2 text-center">
                  {pageCount - perSheet} more {pageCount - perSheet === 1 ? "page" : "pages"} on{" "}
                  {sheetsNeeded - 1} additional {sheetsNeeded - 1 === 1 ? "sheet" : "sheets"}
                </p>
              )}
            </div>
          </div>

          {/* Progress */}
          {processing && progress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-slate-600 dark:text-dark-text-muted">
                <span>Rendering pages…</span>
                <span>
                  {progress.current} / {progress.total}
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-dark-border rounded-full h-2">
                <div
                  className="bg-primary-600 h-2 rounded-full transition-all"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={processing || loading || pageCount === 0}
            className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? "Generating…" : `Generate Contact Sheet${sheetsNeeded > 1 ? "s" : ""}`}
          </button>
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
