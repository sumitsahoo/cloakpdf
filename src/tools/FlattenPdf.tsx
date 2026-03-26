/**
 * Flatten PDF tool.
 *
 * Removes all interactive form fields and annotations from a PDF,
 * converting them to static content. Useful for locking down filled
 * forms before sharing.
 */

import { useState, useCallback } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { flattenPdf } from "../utils/pdf-operations.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";

export default function FlattenPdf() {
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

  const handleFlatten = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    try {
      const data = await flattenPdf(file);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to flatten PDF. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file]);

  const handleDownload = useCallback(() => {
    if (!result || !file) return;
    const baseName = file.name.replace(/\.pdf$/i, "");
    downloadPdf(result, `${baseName}_flattened.pdf`);
  }, [result, file]);

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Form fields and annotations will be converted to static content"
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted">
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
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border p-4">
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text mb-1">
                  What flattening does
                </p>
                <ul className="text-sm text-slate-500 dark:text-dark-text-muted space-y-1 list-disc list-inside">
                  <li>Converts fillable form fields to plain text</li>
                  <li>Removes interactive checkboxes, dropdowns, and buttons</li>
                  <li>Makes the document non-editable</li>
                </ul>
              </div>

              <button
                onClick={handleFlatten}
                disabled={processing}
                className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {processing ? "Flattening..." : "Flatten PDF"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
                <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">
                  PDF flattened successfully. All form fields and annotations have been removed.
                </p>
              </div>

              <button
                onClick={handleDownload}
                className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 transition-colors"
              >
                Download Flattened PDF
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
