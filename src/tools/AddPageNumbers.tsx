/**
 * Add Page Numbers tool.
 *
 * Lets the user choose a position (6-point grid), format, font size, colour,
 * margin, starting number, and which page to begin numbering from. The result
 * is downloaded immediately after processing.
 */

import { useState, useCallback } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { ColorPicker, hexToRgb, rgbToHex } from "../components/ColorPicker.tsx";
import { addPageNumbers } from "../utils/pdf-operations.ts";
import { downloadPdf } from "../utils/file-helpers.ts";
import type { PageNumberOptions, PageNumberPosition, PageNumberFormat } from "../types.ts";

const POSITIONS: { value: PageNumberPosition; label: string }[] = [
  { value: "top-left", label: "↖" },
  { value: "top-center", label: "↑" },
  { value: "top-right", label: "↗" },
  { value: "bottom-left", label: "↙" },
  { value: "bottom-center", label: "↓" },
  { value: "bottom-right", label: "↘" },
];

const FORMATS: PageNumberFormat[] = ["1", "Page 1", "1 / N", "Page 1 of N"];

export default function AddPageNumbers() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [options, setOptions] = useState<PageNumberOptions>({
    position: "bottom-center",
    format: "1",
    fontSize: 12,
    color: { r: 30, g: 41, b: 59 },
    margin: 20,
    startNumber: 1,
    firstPage: 1,
  });
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setError(null);
    setLoading(true);
    try {
      const { getPageCount } = await import("../utils/pdf-renderer.ts");
      const count = await getPageCount(pdf);
      setPageCount(count);
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

  const setOpt = useCallback(
    <K extends keyof PageNumberOptions>(key: K, value: PageNumberOptions[K]) => {
      setOptions((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleApply = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    try {
      const result = await addPageNumbers(file, options);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_numbered.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add page numbers. Please try again.");
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
          hint="Page numbers will be drawn on every page"
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted">
              <span className="font-medium">{file.name}</span>
              {loading ? " — loading…" : ` — ${pageCount} pages`}
            </p>
            <button
              onClick={() => setFile(null)}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              Change file
            </button>
          </div>

          <div className="space-y-5">
            {/* Position grid */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-2">
                Position
              </label>
              <div className="grid grid-cols-3 gap-2 max-w-[180px]">
                {POSITIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setOpt("position", value)}
                    title={value.replace("-", " ")}
                    className={`h-10 rounded-lg text-base font-bold border transition-colors ${
                      options.position === value
                        ? "bg-primary-600 text-white border-primary-600"
                        : "border-slate-300 dark:border-dark-border text-slate-600 dark:text-dark-text-muted hover:border-primary-400"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Format */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-2">
                Format
              </label>
              <div className="flex flex-wrap gap-2">
                {FORMATS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setOpt("format", f)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      options.format === f
                        ? "bg-primary-600 text-white border-primary-600"
                        : "border-slate-300 dark:border-dark-border text-slate-600 dark:text-dark-text-muted hover:border-primary-400"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Font size */}
              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-dark-text">
                    Font size
                  </label>
                  <span className="text-sm text-slate-500 dark:text-dark-text-muted">
                    {options.fontSize}pt
                  </span>
                </div>
                <input
                  type="range"
                  min={8}
                  max={24}
                  step={1}
                  value={options.fontSize}
                  onChange={(e) => setOpt("fontSize", Number(e.target.value))}
                  className="w-full accent-primary-600"
                />
              </div>

              {/* Margin */}
              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-dark-text">
                    Margin
                  </label>
                  <span className="text-sm text-slate-500 dark:text-dark-text-muted">
                    {options.margin}pt
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={72}
                  step={1}
                  value={options.margin}
                  onChange={(e) => setOpt("margin", Number(e.target.value))}
                  className="w-full accent-primary-600"
                />
              </div>
            </div>

            {/* Color */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-2">
                Colour
              </label>
              <ColorPicker
                value={rgbToHex(options.color.r, options.color.g, options.color.b)}
                onChange={(hex) => {
                  const { r, g, b } = hexToRgb(hex);
                  setOpt("color", { r, g, b });
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Start number */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                  Start number
                </label>
                <input
                  type="number"
                  min={1}
                  value={options.startNumber}
                  onChange={(e) => setOpt("startNumber", Math.max(1, Number(e.target.value)))}
                  className="w-full border border-slate-300 dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-white dark:bg-dark-surface text-slate-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* First page */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                  Start from page
                </label>
                <input
                  type="number"
                  min={1}
                  max={pageCount || 1}
                  value={options.firstPage}
                  onChange={(e) =>
                    setOpt("firstPage", Math.min(Math.max(1, Number(e.target.value)), pageCount))
                  }
                  className="w-full border border-slate-300 dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-white dark:bg-dark-surface text-slate-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-xs text-slate-400 dark:text-dark-text-muted mt-1">
                  Set to 2 to skip a cover page
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handleApply}
            disabled={processing || loading}
            className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? "Adding numbers…" : "Add Page Numbers & Download"}
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
