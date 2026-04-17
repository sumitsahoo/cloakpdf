/**
 * Reverse Pages tool.
 *
 * Uploads a PDF and produces a new PDF with all pages in reverse order.
 * Shows a before/after preview of the first and last page thumbnails.
 */

import { useCallback, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { InfoCallout } from "../components/InfoCallout.tsx";
import { ActionButton } from "../components/ActionButton.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";
import { reversePages } from "../utils/pdf-operations.ts";
import { getPageCount, renderSpecificThumbnails, revokeThumbnails } from "../utils/pdf-renderer.ts";

/** Only the first and last page thumbnails are needed for the preview. */
interface PreviewThumbs {
  first: string;
  last: string;
  pageCount: number;
}

export default function ReversePages() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewThumbs | null>(null);
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
      // getPageCount loads the PDF briefly to read numPages, then destroys it.
      // renderSpecificThumbnails then loads it again and renders pages sequentially
      // from a single document — avoids the ArrayBuffer-detach error that happens
      // when the same buffer is transferred to the PDF.js Worker twice in parallel.
      const count = await getPageCount(pdf);
      const pageNums = count > 1 ? [1, count] : [1];
      const thumbs = await renderSpecificThumbnails(pdf, pageNums, 0.4);
      setPreview({ first: thumbs[0], last: thumbs[1] ?? "", pageCount: count });
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

  const handleReverse = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    setDone(false);
    try {
      const result = await reversePages(file);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_reversed.pdf`);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reverse pages. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file]);

  const pageCount = preview?.pageCount ?? 0;

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          glowColor={categoryGlow.organise}
          iconColor={categoryAccent.organise}
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Reverse the order of all pages in one click"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={file.name}
            details={`${formatFileSize(file.size)}, ${pageCount} pages`}
            onChangeFile={() => {
              revokeThumbnails(preview ? [preview.first, preview.last].filter(Boolean) : []);
              setFile(null);
              setPreview(null);
              setDone(false);
            }}
          />

          {loading ? (
            <LoadingSpinner />
          ) : preview ? (
            <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border p-4">
              <p className="text-sm font-medium text-slate-700 dark:text-dark-text mb-3">
                Page order preview
              </p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="text-center shrink-0">
                    <img
                      src={preview.first}
                      alt="First page"
                      className="w-16 h-auto rounded border border-slate-200 dark:border-dark-border"
                    />
                    <p className="text-xs text-slate-400 dark:text-dark-text-muted mt-1">Page 1</p>
                  </div>
                  {pageCount > 2 && (
                    <p className="text-xs text-slate-400 dark:text-dark-text-muted">
                      … {pageCount - 2} more …
                    </p>
                  )}
                  {pageCount > 1 && (
                    <div className="text-center shrink-0">
                      <img
                        src={preview.last}
                        alt="Last page"
                        className="w-16 h-auto rounded border border-slate-200 dark:border-dark-border"
                      />
                      <p className="text-xs text-slate-400 dark:text-dark-text-muted mt-1">
                        Page {pageCount}
                      </p>
                    </div>
                  )}
                </div>

                <ArrowRight className="w-6 h-6 text-slate-400 dark:text-dark-text-muted shrink-0" />

                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {pageCount > 1 && (
                    <div className="text-center shrink-0">
                      <img
                        src={preview.last}
                        alt="Was last, now first"
                        className="w-16 h-auto rounded border border-slate-200 dark:border-dark-border"
                      />
                      <p className="text-xs text-slate-400 dark:text-dark-text-muted mt-1">
                        Page 1
                      </p>
                    </div>
                  )}
                  {pageCount > 2 && (
                    <p className="text-xs text-slate-400 dark:text-dark-text-muted">
                      … {pageCount - 2} more …
                    </p>
                  )}
                  <div className="text-center shrink-0">
                    <img
                      src={preview.first}
                      alt="Was first, now last"
                      className="w-16 h-auto rounded border border-slate-200 dark:border-dark-border"
                    />
                    <p className="text-xs text-slate-400 dark:text-dark-text-muted mt-1">
                      Page {pageCount}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <ActionButton
            onClick={handleReverse}
            processing={processing}
            disabled={processing || pageCount < 2}
            label="Reverse Pages & Download"
            processingLabel="Reversing..."
          />

          {pageCount === 1 && (
            <p className="text-center text-sm text-slate-400 dark:text-dark-text-muted">
              This PDF only has one page — nothing to reverse.
            </p>
          )}

          {done && (
            <InfoCallout icon={CheckCircle2} accent="organise">
              Pages reversed successfully. The PDF has been downloaded.
            </InfoCallout>
          )}
        </>
      )}

      {error && <AlertBox variant="error" message={error} />}
    </div>
  );
}
