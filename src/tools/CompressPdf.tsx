/**
 * Compress PDF tool.
 *
 * Offers three compression levels (Light / Balanced / Maximum). After
 * compression, shows a summary comparing original vs. compressed size
 * and the percentage saved. The compressed file can then be downloaded.
 */

import { useState, useCallback } from "react";
import { Gauge } from "lucide-react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { compressPdf } from "../utils/pdf-operations.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";

export default function CompressPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [quality, setQuality] = useState<"low" | "medium" | "high">("medium");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    original: number;
    compressed: number;
    data: Uint8Array;
  } | null>(null);

  const handleFile = useCallback((files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setResult(null);
  }, []);

  /** Compress the PDF at the selected quality preset and store the result for download. */
  const handleCompress = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    try {
      const data = await compressPdf(file, quality);
      setResult({
        original: file.size,
        compressed: data.length,
        data,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to compress PDF. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file, quality]);

  const handleDownload = useCallback(() => {
    if (!result || !file) return;
    const baseName = file.name.replace(/\.pdf$/i, "");
    downloadPdf(result.data, `${baseName}_compressed.pdf`);
  }, [result, file]);

  // Clamp to 0 so we never show negative savings when the output is larger
  const savings = result
    ? Math.max(0, Math.round(((result.original - result.compressed) / result.original) * 100))
    : 0;

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="We'll optimize the file structure to reduce size"
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
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-dark-text-muted mb-2">
                  <Gauge className="w-3.5 h-3.5" />
                  Compression Level
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    {
                      value: "low" as const,
                      label: "Light",
                      desc: "Best quality, less compression",
                    },
                    {
                      value: "medium" as const,
                      label: "Balanced",
                      desc: "Good balance of size & quality",
                    },
                    {
                      value: "high" as const,
                      label: "Maximum",
                      desc: "Smallest file, lower quality",
                    },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setQuality(opt.value)}
                      className={`p-3 rounded-xl border-2 text-left transition-all duration-150 ${
                        quality === opt.value
                          ? "border-primary-500 bg-primary-50 dark:bg-primary-900/30 ring-1 ring-primary-300 dark:ring-primary-700"
                          : "border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-dark-surface-alt"
                      }`}
                    >
                      <p
                        className={`text-sm font-semibold ${quality === opt.value ? "text-primary-700 dark:text-primary-300" : "text-slate-700 dark:text-dark-text"}`}
                      >
                        {opt.label}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-dark-text-muted mt-0.5 leading-snug">
                        {opt.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleCompress}
                disabled={processing}
                className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {processing ? "Compressing... (this may take a moment)" : "Compress PDF"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border p-6">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-dark-text-muted">Original</p>
                    <p className="text-xl font-bold text-slate-800 dark:text-dark-text">
                      {formatFileSize(result.original)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-dark-text-muted">Compressed</p>
                    <p className="text-xl font-bold text-emerald-600">
                      {formatFileSize(result.compressed)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-dark-text-muted">Saved</p>
                    <p
                      className={`text-xl font-bold ${savings > 0 ? "text-emerald-600" : "text-slate-500 dark:text-dark-text-muted"}`}
                    >
                      {savings}%
                    </p>
                  </div>
                </div>
                {savings === 0 && (
                  <p className="text-sm text-slate-500 dark:text-dark-text-muted text-center mt-4">
                    This file is already well optimized. The output is about the same size.
                  </p>
                )}
              </div>

              <button
                onClick={handleDownload}
                className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 transition-colors"
              >
                Download Compressed PDF
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
