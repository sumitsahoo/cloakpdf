/**
 * Header & Footer tool.
 *
 * Adds repeating text at the top and/or bottom of every page in a PDF.
 * Each row has three alignment slots (left / centre / right). Supports
 * {{page}} and {{total}} tokens that expand per page. Optionally skips
 * the first page (e.g. for cover pages or title pages).
 */

import { useState, useCallback } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { ColorPicker, hexToRgb, rgbToHex } from "../components/ColorPicker.tsx";
import { addHeaderFooter } from "../utils/pdf-operations.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";
import type { HeaderFooterOptions } from "../types.ts";

export default function HeaderFooter() {
  const [file, setFile] = useState<File | null>(null);
  const [options, setOptions] = useState<HeaderFooterOptions>({
    headerLeft: "",
    headerCenter: "",
    headerRight: "",
    footerLeft: "",
    footerCenter: "{{page}}",
    footerRight: "",
    fontSize: 10,
    color: { r: 100, g: 116, b: 139 },
    margin: 20,
    skipFirstPage: false,
  });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setOpt = useCallback(
    <K extends keyof HeaderFooterOptions>(key: K, value: HeaderFooterOptions[K]) => {
      setOptions((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleApply = useCallback(async () => {
    if (!file) return;
    const hasContent = [
      options.headerLeft,
      options.headerCenter,
      options.headerRight,
      options.footerLeft,
      options.footerCenter,
      options.footerRight,
    ].some((s) => s.trim());
    if (!hasContent) {
      setError("Please enter at least one header or footer text.");
      return;
    }
    setProcessing(true);
    setError(null);
    try {
      const result = await addHeaderFooter(file, options);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_header_footer.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add header/footer. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file, options]);

  const slotClass =
    "w-full border border-slate-300 dark:border-dark-border rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-dark-surface text-slate-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder:text-slate-300 dark:placeholder:text-dark-text-muted";

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={(files) => {
            setFile(files[0] ?? null);
            setError(null);
          }}
          label="Drop a PDF file here"
          hint="Header and footer text will be added to every page"
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

          <div className="space-y-4">
            {/* Header row */}
            <div className="bg-slate-50 dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-500 dark:text-dark-text-muted uppercase tracking-wide">
                Header
              </p>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Left"
                  value={options.headerLeft}
                  onChange={(e) => setOpt("headerLeft", e.target.value)}
                  className={slotClass}
                />
                <input
                  type="text"
                  placeholder="Centre"
                  value={options.headerCenter}
                  onChange={(e) => setOpt("headerCenter", e.target.value)}
                  className={slotClass}
                />
                <input
                  type="text"
                  placeholder="Right"
                  value={options.headerRight}
                  onChange={(e) => setOpt("headerRight", e.target.value)}
                  className={slotClass}
                />
              </div>
            </div>

            {/* Footer row */}
            <div className="bg-slate-50 dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-500 dark:text-dark-text-muted uppercase tracking-wide">
                Footer
              </p>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Left"
                  value={options.footerLeft}
                  onChange={(e) => setOpt("footerLeft", e.target.value)}
                  className={slotClass}
                />
                <input
                  type="text"
                  placeholder="Centre"
                  value={options.footerCenter}
                  onChange={(e) => setOpt("footerCenter", e.target.value)}
                  className={slotClass}
                />
                <input
                  type="text"
                  placeholder="Right"
                  value={options.footerRight}
                  onChange={(e) => setOpt("footerRight", e.target.value)}
                  className={slotClass}
                />
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border p-3">
              <p className="text-xs text-slate-500 dark:text-dark-text-muted">
                <span className="font-semibold">Tokens:</span>{" "}
                <code className="bg-slate-200 dark:bg-dark-border px-1 rounded">{"{{page}}"}</code>{" "}
                inserts the current page number,{" "}
                <code className="bg-slate-200 dark:bg-dark-border px-1 rounded">{"{{total}}"}</code>{" "}
                inserts the total page count.
              </p>
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
                  min={7}
                  max={20}
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

            {/* Colour */}
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

            {/* Skip first page */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={options.skipFirstPage}
                onChange={(e) => setOpt("skipFirstPage", e.target.checked)}
                className="w-4 h-4 text-primary-600 rounded"
              />
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                  Skip first page
                </p>
                <p className="text-xs text-slate-400 dark:text-dark-text-muted">
                  Useful when the first page is a cover or title page
                </p>
              </div>
            </label>
          </div>

          <button
            onClick={handleApply}
            disabled={processing}
            className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? "Applying…" : "Apply Header & Footer & Download"}
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
