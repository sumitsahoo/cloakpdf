/**
 * N-up Pages tool.
 *
 * Arranges multiple PDF pages onto single sheets in a grid layout.
 * The user picks from four layouts (2x1, 1x2, 2x2, 3x3) and downloads
 * a new PDF where source pages are scaled to fill each grid cell.
 */

import { useState, useCallback } from "react";
import { LayoutGrid } from "lucide-react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { nupPages } from "../utils/pdf-operations.ts";
import { getPageCount } from "../utils/pdf-renderer.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";

type NupLayout = "2x1" | "1x2" | "2x2" | "3x3";

const LAYOUTS: {
  value: NupLayout;
  label: string;
  desc: string;
  cols: number;
  rows: number;
}[] = [
  { value: "2x1", label: "2-up Landscape", desc: "2 pages side by side", cols: 2, rows: 1 },
  { value: "1x2", label: "2-up Portrait", desc: "2 pages top to bottom", cols: 1, rows: 2 },
  { value: "2x2", label: "4-up", desc: "4 pages in a 2×2 grid", cols: 2, rows: 2 },
  { value: "3x3", label: "9-up", desc: "9 pages in a 3×3 grid", cols: 3, rows: 3 },
];

export default function NupPages() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [layout, setLayout] = useState<NupLayout>("2x2");
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setDone(false);
    setLoading(true);
    setError(null);
    try {
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

  const handleProcess = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    setDone(false);
    try {
      const result = await nupPages(file, layout);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_${layout}.pdf`);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create N-up PDF. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file, layout]);

  const selected = LAYOUTS.find((l) => l.value === layout)!;
  const perSheet = selected.cols * selected.rows;
  const outSheets = pageCount > 0 ? Math.ceil(pageCount / perSheet) : 0;

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Multiple pages will be arranged onto single sheets"
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted">
              <span className="font-medium">{file.name}</span> — {formatFileSize(file.size)}
              {!loading && pageCount > 0 && `, ${pageCount} pages`}
            </p>
            <button
              onClick={() => {
                setFile(null);
                setPageCount(0);
                setDone(false);
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
              {/* Layout selector */}
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border shadow-sm p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-dark-text-muted mb-3">
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Layout
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {LAYOUTS.map((l) => (
                    <button
                      key={l.value}
                      onClick={() => setLayout(l.value)}
                      className={`border-2 rounded-xl p-3 text-center transition-all duration-150 ${
                        layout === l.value
                          ? "border-primary-500 bg-primary-50 dark:bg-primary-900/30 ring-1 ring-primary-300 dark:ring-primary-700"
                          : "border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-dark-surface-alt"
                      }`}
                    >
                      {/* Visual grid preview */}
                      <div
                        className="mx-auto mb-2 grid gap-0.5 p-1 bg-slate-100 dark:bg-dark-border rounded"
                        style={{
                          gridTemplateColumns: `repeat(${l.cols}, 1fr)`,
                          width: 48,
                          height: 48,
                        }}
                      >
                        {Array.from({ length: l.cols * l.rows }).map((_, i) => (
                          <div key={i} className="bg-slate-300 dark:bg-slate-500 rounded-sm" />
                        ))}
                      </div>
                      <p
                        className={`text-xs font-semibold ${layout === l.value ? "text-primary-700 dark:text-primary-300" : "text-slate-700 dark:text-dark-text"}`}
                      >
                        {l.label}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-dark-text-muted leading-snug">
                        {l.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {pageCount > 0 && (
                <p className="text-sm text-slate-500 dark:text-dark-text-muted text-center">
                  {pageCount} pages → {outSheets} sheet{outSheets !== 1 ? "s" : ""} ({perSheet}{" "}
                  pages per sheet)
                </p>
              )}

              <button
                onClick={handleProcess}
                disabled={processing || pageCount === 0}
                className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {processing ? "Processing..." : `Create ${selected.label} PDF`}
              </button>

              {done && (
                <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">
                    N-up PDF created and downloaded successfully.
                  </p>
                </div>
              )}
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
