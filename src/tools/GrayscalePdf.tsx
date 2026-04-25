/**
 * Grayscale PDF tool.
 *
 * Converts every page of a PDF to grayscale by rasterising each page,
 * applying the standard luminance formula, and re-embedding it as PNG.
 * Useful for reducing ink costs when printing or producing print-ready
 * black-and-white documents.
 */

import { useCallback, useEffect, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { ProgressBar } from "../components/ProgressBar.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { usePdfFile } from "../hooks/usePdfFile.ts";
import { downloadPdf, formatFileSize, pdfFilename } from "../utils/file-helpers.ts";
import { grayscalePdf } from "../utils/pdf-operations.ts";
import { PREVIEW_SCALE, renderPageThumbnail, revokeThumbnails } from "../utils/pdf-renderer.ts";

export default function GrayscalePdf() {
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const pdf = usePdfFile({
    onReset: () => {
      revokeThumbnails(preview ? [preview] : []);
      setResult(null);
      setPreview(null);
    },
  });
  const task = useAsyncProcess();

  // Render first page thumbnail whenever a file is selected. Kept as a side
  // effect because the preview is best-effort and shouldn't block the main
  // conversion workflow — if preview rendering fails, the user can still
  // convert.
  useEffect(() => {
    const file = pdf.file;
    if (!file) return;
    let cancelled = false;
    file
      .arrayBuffer()
      .then((buf) => renderPageThumbnail(buf, 1, PREVIEW_SCALE))
      .then((url) => {
        if (!cancelled) setPreview(url);
      })
      .catch(() => {
        // Preview is best-effort; a failure here doesn't block conversion.
      });
    return () => {
      cancelled = true;
    };
  }, [pdf.file]);

  const handleConvert = useCallback(async () => {
    if (!pdf.file) return;
    const file = pdf.file;
    const ok = await task.run(async () => {
      const data = await grayscalePdf(file, (current, total) => setProgress({ current, total }));
      setResult(data);
    }, "Failed to convert PDF. Please try again.");
    void ok;
    setProgress(null);
  }, [pdf.file, task]);

  const handleDownload = useCallback(() => {
    if (!result || !pdf.file) return;
    downloadPdf(result, pdfFilename(pdf.file, "_grayscale"));
  }, [result, pdf.file]);

  return (
    <div className="space-y-6">
      {!pdf.file ? (
        <FileDropZone
          glowColor={categoryGlow.transform}
          iconColor={categoryAccent.transform}
          accept=".pdf,application/pdf"
          onFiles={pdf.onFiles}
          label="Drop a PDF file here"
          hint="All pages will be converted to grayscale — colour information is permanently removed"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={pdf.file.name}
            details={formatFileSize(pdf.file.size)}
            onChangeFile={pdf.reset}
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
              {task.processing && progress && (
                <ProgressBar
                  current={progress.current}
                  total={progress.total}
                  label="Processing pages…"
                />
              )}

              <ActionButton
                onClick={handleConvert}
                processing={task.processing}
                label="Convert to Grayscale"
                processingLabel="Converting… (this may take a moment)"
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
              />
            </div>
          )}
        </>
      )}

      {(pdf.loadError || task.error) && <AlertBox message={pdf.loadError ?? task.error ?? ""} />}
    </div>
  );
}
