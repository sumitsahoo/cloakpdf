/**
 * Repair PDF tool.
 *
 * Re-loads a PDF through pdf-lib with lenient parsing (throwOnInvalidObject:false)
 * and re-saves it. This rebuilds the cross-reference table, removes redundant or
 * corrupt objects, and produces a structurally clean file without touching the
 * visible content.
 */

import { useState, useCallback } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { repairPdf } from "../utils/pdf-operations.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";

export default function RepairPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [sizeBefore, setSizeBefore] = useState(0);
  const [sizeAfter, setSizeAfter] = useState(0);

  const handleFile = useCallback((files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setSizeBefore(pdf.size);
    setDone(false);
    setError(null);
    setSizeAfter(0);
  }, []);

  const handleRepair = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    setDone(false);
    try {
      const result = await repairPdf(file);
      setSizeAfter(result.byteLength);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_repaired.pdf`);
      setDone(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to repair PDF. The file may be severely corrupted.",
      );
    } finally {
      setProcessing(false);
    }
  }, [file]);

  return (
    <div className="space-y-6">
      <FileDropZone
        accept=".pdf,application/pdf"
        onFiles={handleFile}
        label="Drop a PDF file here"
        hint="Re-save the PDF through pdf-lib to fix structural issues"
      />

      {file && (
        <>
          <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border divide-y divide-slate-100 dark:divide-dark-border">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium text-slate-600 dark:text-dark-text-muted">
                File
              </span>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-800 dark:text-dark-text truncate max-w-48">
                  {file.name}
                </span>
                <button
                  onClick={() => {
                    setFile(null);
                    setDone(false);
                    setSizeAfter(0);
                  }}
                  className="text-xs text-primary-600 hover:text-primary-700 shrink-0"
                >
                  Change
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium text-slate-600 dark:text-dark-text-muted">
                Original size
              </span>
              <span className="text-sm text-slate-800 dark:text-dark-text">
                {formatFileSize(sizeBefore)}
              </span>
            </div>
            {sizeAfter > 0 && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium text-slate-600 dark:text-dark-text-muted">
                  Repaired size
                </span>
                <span className="text-sm text-slate-800 dark:text-dark-text">
                  {formatFileSize(sizeAfter)}
                </span>
              </div>
            )}
          </div>

          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Repair re-builds the PDF structure from scratch. Content (text, images, forms) is
              preserved, but any encryption will be stripped so the output is unprotected.
            </p>
          </div>

          <button
            onClick={handleRepair}
            disabled={processing}
            className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? "Repairing..." : "Repair & Download PDF"}
          </button>

          {done && (
            <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                PDF repaired successfully. The file has been downloaded.
              </p>
            </div>
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
