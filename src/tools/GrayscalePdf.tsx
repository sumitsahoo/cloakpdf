/**
 * Grayscale PDF tool.
 *
 * Converts every page of a PDF to grayscale by rasterising each page,
 * applying the standard luminance formula, and re-embedding it as PNG.
 * Useful for reducing ink costs when printing or producing print-ready
 * black-and-white documents.
 */

import { useCallback, useEffect, useState } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { ActionButton } from "../components/ActionButton.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";
import { grayscalePdf } from "../utils/pdf-operations.ts";
import { renderPageThumbnail, revokeThumbnails } from "../utils/pdf-renderer.ts";

export default function GrayscalePdf() {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const handleFile = useCallback((files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setResult(null);
    setError(null);
    setPreview(null);
  }, []);

  // Render first page thumbnail whenever a file is selected
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    file
      .arrayBuffer()
      .then((buf) => renderPageThumbnail(buf, 1, 0.6))
      .then((url) => {
        if (!cancelled) setPreview(url);
      })
      .catch(() => {
        // Preview is best-effort; a failure here doesn't block conversion
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  const handleConvert = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    try {
      const data = await grayscalePdf(file, (current, total) => setProgress({ current, total }));
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to convert PDF. Please try again.");
    } finally {
      setProcessing(false);
      setProgress(null);
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
          glowColor={categoryGlow.transform}
          iconColor={categoryAccent.transform}
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="All pages will be converted to grayscale — colour information is permanently removed"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={file.name}
            details={formatFileSize(file.size)}
            onChangeFile={() => {
              revokeThumbnails(preview ? [preview] : []);
              setFile(null);
              setResult(null);
            }}
          />

          {/* Before / After preview */}
          {preview && (
            <div className="grid grid-cols-2 gap-4">
              {(["Before", "After"] as const).map((label) => (
                <div
                  key={label}
                  className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border overflow-hidden"
                >
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-dark-border">
                    <p className="text-xs font-semibold text-slate-500 dark:text-dark-text-muted uppercase tracking-widest">
                      {label}
                    </p>
                  </div>
                  <div className="p-2 flex items-center justify-center bg-slate-50 dark:bg-dark-surface-alt">
                    <img
                      src={preview}
                      alt={`${label} — page 1`}
                      className={`max-h-52 w-auto rounded shadow-sm${label === "After" ? " grayscale" : ""}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!result ? (
            <div className="space-y-4">
              {processing && progress && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-slate-600 dark:text-dark-text-muted">
                    <span>Processing pages…</span>
                    <span>
                      {progress.current} / {progress.total}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-dark-border rounded-full h-2">
                    <div
                      className="bg-violet-600 h-2 rounded-full transition-all"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <ActionButton
                onClick={handleConvert}
                processing={processing}
                label="Convert to Grayscale"
                processingLabel="Converting… (this may take a moment)"
                color="bg-violet-600 hover:bg-violet-700"
              />
            </div>
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

              <ActionButton
                onClick={handleDownload}
                processing={false}
                label="Download Grayscale PDF"
                processingLabel=""
                color="bg-violet-600 hover:bg-violet-700"
              />
            </div>
          )}
        </>
      )}

      {error && <AlertBox message={error} />}
    </div>
  );
}
