/**
 * Grayscale PDF tool.
 *
 * Converts every page of a PDF to grayscale by rasterising each page,
 * applying the standard luminance formula, and re-embedding it as PNG.
 * Useful for reducing ink costs when printing or producing print-ready
 * black-and-white documents.
 */

import { useState, useCallback } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { grayscalePdf } from "../utils/pdf-operations.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";

export default function GrayscalePdf() {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);

  const handleFile = useCallback((files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setResult(null);
    setError(null);
  }, []);

  const handleConvert = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    try {
      const data = await grayscalePdf(file);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to convert PDF. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file]);

  const handleDownload = useCallback(() => {
    if (!result || !file) return;
    const baseName = file.name.replace(/\.pdf$/i, "");
    downloadPdf(result, `${baseName}_grayscale.pdf`);
  }, [result, file]);

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="All pages will be converted to grayscale — colour information is permanently removed"
        />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted break-all sm:break-normal">
              <span className="font-medium">{file.name}</span> — {formatFileSize(file.size)}
            </p>
            <button
              onClick={() => {
                setFile(null);
                setResult(null);
              }}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              Change file
            </button>
          </div>

          {!result ? (
            <button
              onClick={handleConvert}
              disabled={processing}
              className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {processing ? "Converting… (this may take a moment)" : "Convert to Grayscale"}
            </button>
          ) : (
            <div className="space-y-4">
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border p-6 text-center">
                <p className="text-sm text-slate-500 dark:text-dark-text-muted">Output size</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-dark-text mt-1">
                  {formatFileSize(result.length)}
                </p>
                <p className="text-xs text-slate-400 dark:text-dark-text-muted mt-2">
                  All colour has been removed — the PDF is ready to download
                </p>
              </div>

              <button
                onClick={handleDownload}
                className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 transition-colors"
              >
                Download Grayscale PDF
              </button>
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
