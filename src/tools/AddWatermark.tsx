/**
 * Add Watermark tool.
 *
 * Provides a form to configure watermark text, font size, opacity, rotation,
 * and colour (from preset options). A live preview overlays the watermark on
 * the first page's thumbnail using CSS transforms so the user can see how
 * it will look before committing. The actual watermark is drawn into the PDF
 * using pdf-lib.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ColorPicker, hexToRgb, rgbToHex } from "../components/ColorPicker.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import type { WatermarkOptions } from "../types.ts";
import { downloadPdf } from "../utils/file-helpers.ts";
import { addWatermark } from "../utils/pdf-operations.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";

export default function AddWatermark() {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [selectedPage, setSelectedPage] = useState(0);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [applyToAllPages, setApplyToAllPages] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<WatermarkOptions>({
    text: "CONFIDENTIAL",
    fontSize: 48,
    color: { r: 30, g: 41, b: 59 },
    opacity: 0.3,
    rotation: -45,
  });
  const fileDataRef = useRef<ArrayBuffer | null>(null);
  const [pageDims, setPageDims] = useState<{ width: number; height: number }[]>([]);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(0.4);

  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setSelectedPage(0);
    setSelectedPages(new Set());
    setLoading(true);
    setError(null);
    try {
      const data = await pdf.arrayBuffer();
      fileDataRef.current = data;
      const thumbs = await renderAllThumbnails(pdf);
      setThumbnails(thumbs);
      const { PDFDocument } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.load(data);
      setPageDims(pdfDoc.getPages().map((p) => p.getSize()));
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

  useEffect(() => {
    if (!previewRef.current || !pageDims[selectedPage]) return;
    const el = previewRef.current;
    const updateScale = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width) setPreviewScale(rect.width / pageDims[selectedPage].width);
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pageDims, selectedPage]);

  const togglePage = useCallback((index: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
    setSelectedPage(index);
  }, []);

  const handleApply = useCallback(async () => {
    if (!file || !options.text.trim()) return;
    setProcessing(true);
    setError(null);
    try {
      const pageIndices = applyToAllPages ? undefined : [...selectedPages].sort((a, b) => a - b);
      const result = await addWatermark(file, options, pageIndices);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_watermarked.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add watermark. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file, options, applyToAllPages, selectedPages]);

  const canApply = applyToAllPages || selectedPages.size > 0;

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Add a text watermark to all pages"
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted">
              <span className="font-medium">{file.name}</span> — {thumbnails.length} pages
            </p>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setThumbnails([]);
                setPageDims([]);
                setSelectedPages(new Set());
                fileDataRef.current = null;
              }}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              Change file
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-6 items-start">
            {/* Left column: controls + page selection */}
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="watermark-text"
                  className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5"
                >
                  Watermark Text
                </label>
                <input
                  id="watermark-text"
                  type="text"
                  value={options.text}
                  onChange={(e) => setOptions((o) => ({ ...o, text: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-dark-border dark:bg-dark-surface dark:text-dark-text rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Enter watermark text"
                />
              </div>

              <div>
                <label
                  htmlFor="watermark-font-size"
                  className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5"
                >
                  Font Size: {options.fontSize}px
                </label>
                <input
                  id="watermark-font-size"
                  type="range"
                  min={12}
                  max={120}
                  value={options.fontSize}
                  onChange={(e) => setOptions((o) => ({ ...o, fontSize: Number(e.target.value) }))}
                  className="w-full accent-primary-600"
                />
              </div>

              <div>
                <label
                  htmlFor="watermark-opacity"
                  className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5"
                >
                  Opacity: {Math.round(options.opacity * 100)}%
                </label>
                <input
                  id="watermark-opacity"
                  type="range"
                  min={5}
                  max={100}
                  value={Math.round(options.opacity * 100)}
                  onChange={(e) =>
                    setOptions((o) => ({ ...o, opacity: Number(e.target.value) / 100 }))
                  }
                  className="w-full accent-primary-600"
                />
              </div>

              <div>
                <label
                  htmlFor="watermark-rotation"
                  className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5"
                >
                  Rotation: {options.rotation}°
                </label>
                <input
                  id="watermark-rotation"
                  type="range"
                  min={-90}
                  max={90}
                  value={options.rotation}
                  onChange={(e) => setOptions((o) => ({ ...o, rotation: Number(e.target.value) }))}
                  className="w-full accent-primary-600"
                />
              </div>

              <ColorPicker
                value={rgbToHex(options.color.r, options.color.g, options.color.b)}
                onChange={(hex) => setOptions((o) => ({ ...o, color: hexToRgb(hex) }))}
              />

              {thumbnails.length > 1 && (
                <div className="space-y-3">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={applyToAllPages}
                      onChange={(e) => {
                        setApplyToAllPages(e.target.checked);
                        if (e.target.checked) setSelectedPages(new Set());
                      }}
                      className="accent-primary-600 w-4 h-4 rounded"
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-dark-text">
                      Apply to all pages
                    </span>
                  </label>

                  {!applyToAllPages && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                          Select pages
                          {selectedPages.size > 0 && (
                            <span className="text-primary-600 dark:text-primary-400 ml-1.5">
                              ({selectedPages.size} selected)
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPages(new Set(thumbnails.map((_, i) => i)));
                              setSelectedPage(0);
                            }}
                            className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400"
                          >
                            All
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedPages(new Set())}
                            className="text-xs text-slate-500 hover:text-slate-700 dark:text-dark-text-muted"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      {loading ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {thumbnails.map((thumb, i) => {
                            const pageNumber = i + 1;
                            return (
                              <PageThumbnail
                                key={pageNumber}
                                src={thumb}
                                pageNumber={pageNumber}
                                selected={selectedPages.has(i)}
                                onClick={() => togglePage(i)}
                                overlay={
                                  selectedPages.has(i) ? (
                                    <div className="bg-primary-600/20 inset-0 absolute flex items-center justify-center">
                                      <div className="w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center shadow">
                                        <svg
                                          className="w-3 h-3 text-white"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                          aria-label="Selected"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={3}
                                            d="M5 13l4 4L19 7"
                                          />
                                        </svg>
                                      </div>
                                    </div>
                                  ) : null
                                }
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right column: preview */}
            <div className="sticky top-4">
              <p className="text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                Preview — Page {selectedPage + 1}
              </p>
              {loading ? (
                <div className="aspect-3/4 bg-slate-100 dark:bg-dark-surface-alt rounded-lg flex items-center justify-center">
                  <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                </div>
              ) : thumbnails[selectedPage] ? (
                <div
                  ref={previewRef}
                  className="relative bg-white dark:bg-dark-surface rounded-lg border border-slate-200 dark:border-dark-border overflow-hidden"
                  style={
                    pageDims[selectedPage]
                      ? {
                          aspectRatio: `${pageDims[selectedPage].width} / ${pageDims[selectedPage].height}`,
                        }
                      : { aspectRatio: "3 / 4" }
                  }
                >
                  <img
                    src={thumbnails[selectedPage]}
                    alt={`Page ${selectedPage + 1}`}
                    className="w-full h-full object-contain"
                  />
                  <div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    style={{ transform: `rotate(${options.rotation}deg)` }}
                  >
                    <span
                      style={{
                        fontSize: `${options.fontSize * previewScale}px`,
                        color: `rgba(${options.color.r}, ${options.color.g}, ${options.color.b}, ${options.opacity})`,
                        fontWeight: "bold",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {options.text}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={handleApply}
            disabled={processing || !options.text.trim() || !canApply}
            className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? "Applying..." : "Apply Watermark & Download"}
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
