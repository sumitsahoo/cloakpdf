/**
 * PDF to Image tool.
 *
 * Renders selected PDF pages as PNG or JPEG images at a configurable DPI.
 * A single-page export downloads directly; multi-page exports are packaged
 * into a ZIP file for convenience.
 */

import { useState, useCallback } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import { renderPagesToBlobs } from "../utils/pdf-renderer.ts";
import { downloadBlob, formatFileSize } from "../utils/file-helpers.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";

export default function PdfToImage() {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [format, setFormat] = useState<"image/png" | "image/jpeg">("image/png");
  const [dpi, setDpi] = useState<72 | 150 | 300>(150);
  const [quality, setQuality] = useState(92);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ rendered: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setSelectedPages(new Set());
    setError(null);
    setLoading(true);
    try {
      const thumbs = await renderAllThumbnails(pdf);
      setThumbnails(thumbs);
      // Select all pages by default
      setSelectedPages(new Set(thumbs.map((_, i) => i)));
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

  const togglePage = useCallback((idx: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedPages((prev) =>
      prev.size === thumbnails.length ? new Set() : new Set(thumbnails.map((_, i) => i)),
    );
  }, [thumbnails]);

  const handleExport = useCallback(async () => {
    if (!file || selectedPages.size === 0) return;
    setProcessing(true);
    setProgress({ rendered: 0, total: selectedPages.size });
    setError(null);

    try {
      const indices = Array.from(selectedPages).sort((a, b) => a - b);
      const blobs = await renderPagesToBlobs(file, indices, dpi, format, quality / 100, (r, t) =>
        setProgress({ rendered: r, total: t }),
      );

      const ext = format === "image/png" ? "png" : "jpg";
      const baseName = file.name.replace(/\.pdf$/i, "");

      if (blobs.length === 1) {
        downloadBlob(blobs[0].blob, `${baseName}_page${blobs[0].pageIndex + 1}.${ext}`);
      } else {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        for (const { pageIndex, blob } of blobs) {
          const padded = String(pageIndex + 1).padStart(3, "0");
          zip.file(`${baseName}_page${padded}.${ext}`, blob);
        }
        const zipBlob = await zip.generateAsync({ type: "blob" });
        downloadBlob(zipBlob, `${baseName}_images.zip`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to export images. Please try again.");
    } finally {
      setProcessing(false);
      setProgress(null);
    }
  }, [file, selectedPages, dpi, format, quality]);

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Each page will be exported as a PNG or JPEG image"
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted">
              <span className="font-medium">{file.name}</span> — {formatFileSize(file.size)}
              {selectedPages.size > 0 && (
                <span className="text-primary-600 ml-2">
                  ({selectedPages.size} of {thumbnails.length} selected)
                </span>
              )}
            </p>
            <button
              onClick={() => {
                setFile(null);
                setThumbnails([]);
                setSelectedPages(new Set());
              }}
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
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                  Select pages to export
                </p>
                <button
                  onClick={toggleAll}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  {selectedPages.size === thumbnails.length ? "Deselect all" : "Select all"}
                </button>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {thumbnails.map((thumb, i) => (
                  <PageThumbnail
                    key={i}
                    src={thumb}
                    pageNumber={i + 1}
                    selected={selectedPages.has(i)}
                    onClick={() => togglePage(i)}
                  />
                ))}
              </div>

              {/* Export options */}
              <div className="bg-slate-50 dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                      Format
                    </label>
                    <div className="flex gap-2">
                      {(["image/png", "image/jpeg"] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => setFormat(f)}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                            format === f
                              ? "bg-primary-600 text-white border-primary-600"
                              : "border-slate-300 dark:border-dark-border text-slate-600 dark:text-dark-text-muted hover:border-primary-400"
                          }`}
                        >
                          {f === "image/png" ? "PNG" : "JPEG"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                      Resolution
                    </label>
                    <div className="flex gap-2">
                      {([72, 150, 300] as const).map((d) => (
                        <button
                          key={d}
                          onClick={() => setDpi(d)}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                            dpi === d
                              ? "bg-primary-600 text-white border-primary-600"
                              : "border-slate-300 dark:border-dark-border text-slate-600 dark:text-dark-text-muted hover:border-primary-400"
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 dark:text-dark-text-muted mt-1">DPI</p>
                  </div>
                </div>

                {format === "image/jpeg" && (
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label className="text-sm font-medium text-slate-700 dark:text-dark-text">
                        JPEG Quality
                      </label>
                      <span className="text-sm text-slate-500 dark:text-dark-text-muted">
                        {quality}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={60}
                      max={100}
                      step={1}
                      value={quality}
                      onChange={(e) => setQuality(Number(e.target.value))}
                      className="w-full accent-primary-600"
                    />
                    <div className="flex justify-between text-xs text-slate-400 dark:text-dark-text-muted mt-0.5">
                      <span>Smaller</span>
                      <span>Higher quality</span>
                    </div>
                  </div>
                )}
              </div>

              {processing && progress && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-slate-600 dark:text-dark-text-muted">
                    <span>Rendering pages…</span>
                    <span>
                      {progress.rendered} / {progress.total}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-dark-border rounded-full h-2">
                    <div
                      className="bg-primary-600 h-2 rounded-full transition-all"
                      style={{ width: `${(progress.rendered / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                onClick={handleExport}
                disabled={processing || selectedPages.size === 0}
                className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {processing
                  ? "Exporting…"
                  : selectedPages.size === 1
                    ? "Export Image"
                    : `Export ${selectedPages.size} Images as ZIP`}
              </button>
            </>
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
