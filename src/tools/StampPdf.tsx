/**
 * Stamp PDF tool.
 *
 * Applies a pre-defined text stamp (DRAFT, APPROVED, CONFIDENTIAL, etc.) to
 * all or selected pages. Uses the same underlying watermark operation as the
 * Add Watermark tool but with curated presets for the most common stamp types.
 * Users can still adjust font size and opacity.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { addWatermark } from "../utils/pdf-operations.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";
import { downloadPdf } from "../utils/file-helpers.ts";
import type { WatermarkOptions } from "../types.ts";

interface StampPreset {
  id: string;
  label: string;
  color: { r: number; g: number; b: number };
  bg: string; // Tailwind color for the preset button
}

const STAMPS: StampPreset[] = [
  {
    id: "draft",
    label: "DRAFT",
    color: { r: 100, g: 100, b: 100 },
    bg: "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200",
  },
  {
    id: "approved",
    label: "APPROVED",
    color: { r: 22, g: 163, b: 74 },
    bg: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
  },
  {
    id: "confidential",
    label: "CONFIDENTIAL",
    color: { r: 220, g: 38, b: 38 },
    bg: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
  },
  {
    id: "rejected",
    label: "REJECTED",
    color: { r: 185, g: 28, b: 28 },
    bg: "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300",
  },
  {
    id: "copy",
    label: "COPY",
    color: { r: 37, g: 99, b: 235 },
    bg: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  },
  {
    id: "void",
    label: "VOID",
    color: { r: 234, g: 88, b: 12 },
    bg: "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300",
  },
  {
    id: "for-review",
    label: "FOR REVIEW",
    color: { r: 161, g: 98, b: 7 },
    bg: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300",
  },
  {
    id: "top-secret",
    label: "TOP SECRET",
    color: { r: 127, g: 29, b: 29 },
    bg: "bg-red-100 dark:bg-red-900/40 text-red-900 dark:text-red-200",
  },
];

export default function StampPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStamp, setSelectedStamp] = useState<StampPreset>(STAMPS[0]);
  const [fontSize, setFontSize] = useState(64);
  const [opacity, setOpacity] = useState(0.35);
  const [applyToAllPages, setApplyToAllPages] = useState(true);
  const [selectedPage, setSelectedPage] = useState(0);

  const [pageDims, setPageDims] = useState<{ width: number; height: number }[]>([]);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(0.4);

  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setSelectedPage(0);
    setLoading(true);
    setError(null);
    try {
      const thumbs = await renderAllThumbnails(pdf);
      setThumbnails(thumbs);
      const { PDFDocument } = await import("pdf-lib");
      const data = await pdf.arrayBuffer();
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
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width) setPreviewScale(rect.width / pageDims[selectedPage].width);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageDims, selectedPage]);

  const handleApply = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    try {
      const options: WatermarkOptions = {
        text: selectedStamp.label,
        fontSize,
        color: selectedStamp.color,
        opacity,
        rotation: -45,
      };
      const pageIndices = applyToAllPages ? undefined : [selectedPage];
      const result = await addWatermark(file, options, pageIndices);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_stamped.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply stamp. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file, selectedStamp, fontSize, opacity, applyToAllPages, selectedPage]);

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Apply a pre-built stamp like DRAFT, APPROVED, or CONFIDENTIAL"
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted">
              <span className="font-medium">{file.name}</span> — {thumbnails.length} pages
            </p>
            <button
              onClick={() => {
                setFile(null);
                setThumbnails([]);
                setPageDims([]);
              }}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              Change file
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-5">
              {/* Stamp presets */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-2">
                  Stamp Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {STAMPS.map((stamp) => (
                    <button
                      key={stamp.id}
                      onClick={() => setSelectedStamp(stamp)}
                      className={`px-3 py-2 rounded-lg text-xs font-bold border-2 transition-all ${stamp.bg} ${
                        selectedStamp.id === stamp.id
                          ? "border-primary-500 ring-2 ring-primary-200 dark:ring-primary-800"
                          : "border-transparent"
                      }`}
                    >
                      {stamp.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font size */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                  Size: {fontSize}pt
                </label>
                <input
                  type="range"
                  min={24}
                  max={120}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-full accent-primary-600"
                />
              </div>

              {/* Opacity */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                  Opacity: {Math.round(opacity * 100)}%
                </label>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={Math.round(opacity * 100)}
                  onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                  className="w-full accent-primary-600"
                />
              </div>

              {/* Page scope */}
              {thumbnails.length > 1 && (
                <div className="space-y-3">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={applyToAllPages}
                      onChange={(e) => setApplyToAllPages(e.target.checked)}
                      className="accent-primary-600 w-4 h-4 rounded"
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-dark-text">
                      Apply to all pages
                    </span>
                  </label>
                  {!applyToAllPages && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                        Page ({selectedPage + 1} of {thumbnails.length})
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={thumbnails.length - 1}
                        value={selectedPage}
                        onChange={(e) => setSelectedPage(Number(e.target.value))}
                        className="w-full accent-primary-600"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Preview */}
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                Preview
              </p>
              {loading ? (
                <div className="aspect-[3/4] bg-slate-100 dark:bg-dark-surface-alt rounded-lg flex items-center justify-center">
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
                    style={{ transform: "rotate(-45deg)" }}
                  >
                    <span
                      style={{
                        fontSize: `${fontSize * previewScale}px`,
                        color: `rgba(${selectedStamp.color.r}, ${selectedStamp.color.g}, ${selectedStamp.color.b}, ${opacity})`,
                        fontWeight: "bold",
                        whiteSpace: "nowrap",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {selectedStamp.label}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <button
            onClick={handleApply}
            disabled={processing}
            className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? "Stamping..." : `Apply "${selectedStamp.label}" Stamp & Download`}
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
