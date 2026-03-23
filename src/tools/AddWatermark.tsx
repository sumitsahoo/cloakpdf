/**
 * Add Watermark tool.
 *
 * Provides a form to configure watermark text, font size, opacity, rotation,
 * and colour (from preset options). A live preview overlays the watermark on
 * the first page’s thumbnail using CSS transforms so the user can see how
 * it will look before committing. The actual watermark is drawn into the PDF
 * using pdf-lib.
 */

import { useState, useCallback, useRef } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { addWatermark } from "../utils/pdf-operations.ts";
import { renderPageThumbnail } from "../utils/pdf-renderer.ts";
import { downloadPdf } from "../utils/file-helpers.ts";
import type { WatermarkOptions } from "../types.ts";

export default function AddWatermark() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<WatermarkOptions>({
    text: "CONFIDENTIAL",
    fontSize: 48,
    color: { r: 128, g: 128, b: 128 },
    opacity: 0.3,
    rotation: -45,
  });
  const fileDataRef = useRef<ArrayBuffer | null>(null);

  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setLoading(true);
    setError(null);
    try {
      const data = await pdf.arrayBuffer();
      fileDataRef.current = data;
      const thumb = await renderPageThumbnail(data, 1, 0.8);
      setPreview(thumb);
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

  // Debounced preview could go here but we keep it simple

  const handleApply = useCallback(async () => {
    if (!file || !options.text.trim()) return;
    setProcessing(true);
    setError(null);
    try {
      const result = await addWatermark(file, options);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_watermarked.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add watermark. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file, options]);

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
              <span className="font-medium">{file.name}</span>
            </p>
            <button
              onClick={() => {
                setFile(null);
                setPreview(null);
                fileDataRef.current = null;
              }}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              Change file
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                  Watermark Text
                </label>
                <input
                  type="text"
                  value={options.text}
                  onChange={(e) => setOptions((o) => ({ ...o, text: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-dark-border dark:bg-dark-surface dark:text-dark-text rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Enter watermark text"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                  Font Size: {options.fontSize}px
                </label>
                <input
                  type="range"
                  min={12}
                  max={120}
                  value={options.fontSize}
                  onChange={(e) => setOptions((o) => ({ ...o, fontSize: Number(e.target.value) }))}
                  className="w-full accent-primary-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                  Opacity: {Math.round(options.opacity * 100)}%
                </label>
                <input
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
                <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                  Rotation: {options.rotation}°
                </label>
                <input
                  type="range"
                  min={-90}
                  max={90}
                  value={options.rotation}
                  onChange={(e) => setOptions((o) => ({ ...o, rotation: Number(e.target.value) }))}
                  className="w-full accent-primary-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                  Color
                </label>
                <div className="flex gap-2">
                  {[
                    { label: "Gray", color: { r: 128, g: 128, b: 128 } },
                    { label: "Red", color: { r: 220, g: 38, b: 38 } },
                    { label: "Blue", color: { r: 59, g: 130, b: 246 } },
                    { label: "Black", color: { r: 0, g: 0, b: 0 } },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => setOptions((o) => ({ ...o, color: preset.color }))}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                        options.color.r === preset.color.r && options.color.g === preset.color.g
                          ? "bg-primary-600 text-white"
                          : "bg-slate-100 dark:bg-dark-surface-alt text-slate-700 dark:text-dark-text hover:bg-slate-200 dark:hover:bg-dark-border"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                Preview (page 1)
              </p>
              {loading ? (
                <div className="aspect-[3/4] bg-slate-100 dark:bg-dark-surface-alt rounded-lg flex items-center justify-center">
                  <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                </div>
              ) : preview ? (
                <div className="relative aspect-[3/4] bg-white dark:bg-dark-surface rounded-lg border border-slate-200 dark:border-dark-border overflow-hidden">
                  <img src={preview} alt="Preview" className="w-full h-full object-contain" />
                  <div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    style={{
                      transform: `rotate(${options.rotation}deg)`,
                    }}
                  >
                    <span
                      style={{
                        fontSize: `${options.fontSize * 0.4}px`,
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
            onClick={handleApply}
            disabled={processing || !options.text.trim()}
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
