/**
 * Bates Numbering tool.
 *
 * Stamps sequential identifiers (prefix + zero-padded number + suffix) on
 * every page of a PDF. Widely used in legal, compliance, and archival
 * workflows to uniquely label each page in a document set.
 */

import { useState, useCallback } from "react";
import { Move } from "lucide-react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { ColorPicker, hexToRgb, rgbToHex } from "../components/ColorPicker.tsx";
import { addBatesNumbers } from "../utils/pdf-operations.ts";
import { downloadPdf } from "../utils/file-helpers.ts";
import type { BatesNumberOptions, BatesPosition } from "../types.ts";

const POSITIONS: { value: BatesPosition; label: string }[] = [
  { value: "top-left", label: "↖" },
  { value: "top-center", label: "↑" },
  { value: "top-right", label: "↗" },
  { value: "bottom-left", label: "↙" },
  { value: "bottom-center", label: "↓" },
  { value: "bottom-right", label: "↘" },
];

export default function BatesNumbering() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [options, setOptions] = useState<BatesNumberOptions>({
    prefix: "BATES-",
    suffix: "",
    startNumber: 1,
    digits: 6,
    position: "bottom-right",
    fontSize: 10,
    color: { r: 30, g: 41, b: 59 },
    margin: 20,
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
    <K extends keyof BatesNumberOptions>(key: K, value: BatesNumberOptions[K]) => {
      setOptions((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  /** Preview of first and last Bates labels */
  const previewFirst = `${options.prefix}${String(options.startNumber).padStart(options.digits, "0")}${options.suffix}`;
  const previewLast =
    pageCount > 0
      ? `${options.prefix}${String(options.startNumber + pageCount - 1).padStart(options.digits, "0")}${options.suffix}`
      : previewFirst;

  const handleApply = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    try {
      const result = await addBatesNumbers(file, options);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_bates.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add Bates numbering. Please try again.");
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
          hint="Sequential Bates numbers will be stamped on every page"
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

          {/* Live preview */}
          {pageCount > 0 && (
            <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border shadow-sm p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-dark-text-muted mb-2">
                Preview
              </p>
              <div className="flex items-center gap-3 text-sm font-mono">
                <span className="text-slate-800 dark:text-dark-text">{previewFirst}</span>
                {pageCount > 1 && (
                  <>
                    <span className="text-slate-400 dark:text-dark-text-muted">→</span>
                    <span className="text-slate-800 dark:text-dark-text">{previewLast}</span>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="space-y-5">
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
              <div className="grid grid-cols-3 gap-2 max-w-[180px]">
                {POSITIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setOpt("position", value)}
                    title={value.replace("-", " ")}
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
              {/* Font size */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700 dark:text-dark-text">
                    Font size
                  </label>
                  <span className="inline-flex items-center rounded-full bg-primary-100 dark:bg-primary-900/40 px-2 py-0.5 text-xs font-semibold text-primary-700 dark:text-primary-300 tabular-nums">
                    {options.fontSize}pt
                  </span>
                </div>
                <input
                  type="range"
                  min={6}
                  max={18}
                  step={1}
                  value={options.fontSize}
                  onChange={(e) => setOpt("fontSize", Number(e.target.value))}
                  className="w-full accent-primary-600 cursor-pointer"
                />
              </div>

              {/* Margin */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700 dark:text-dark-text">
                    Margin
                  </label>
                  <span className="inline-flex items-center rounded-full bg-primary-100 dark:bg-primary-900/40 px-2 py-0.5 text-xs font-semibold text-primary-700 dark:text-primary-300 tabular-nums">
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
                  className="w-full accent-primary-600 cursor-pointer"
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
          </div>

          <button
            onClick={handleApply}
            disabled={processing || loading}
            className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? "Adding Bates numbers…" : "Add Bates Numbers & Download"}
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
