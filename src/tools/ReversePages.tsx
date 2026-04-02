/**
 * Reverse Pages tool.
 *
 * Uploads a PDF and produces a new PDF with all pages in reverse order.
 * Shows a before/after preview of the first and last page thumbnails.
 */

import { useState, useCallback } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { reversePages } from "../utils/pdf-operations.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";
import { ArrowRight } from "lucide-react";

export default function ReversePages() {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
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
      const thumbs = await renderAllThumbnails(pdf);
      setThumbnails(thumbs);
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

  const pageCount = thumbnails.length;

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Reverse the order of all pages in one click"
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted">
              <span className="font-medium">{file.name}</span> — {formatFileSize(file.size)},{" "}
              {pageCount} pages
            </p>
            <button
              onClick={() => {
                setFile(null);
                setThumbnails([]);
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
          ) : pageCount > 0 ? (
            <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border p-4">
              <p className="text-sm font-medium text-slate-700 dark:text-dark-text mb-3">
                Page order preview
              </p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="text-center shrink-0">
                    <img
                      src={thumbnails[0]}
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
                        src={thumbnails[pageCount - 1]}
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
                        src={thumbnails[pageCount - 1]}
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
                      src={thumbnails[0]}
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

          <button
            onClick={handleReverse}
            disabled={processing || pageCount < 2}
            className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? "Reversing..." : "Reverse Pages & Download"}
          </button>

          {pageCount === 1 && (
            <p className="text-center text-sm text-slate-400 dark:text-dark-text-muted">
              This PDF only has one page — nothing to reverse.
            </p>
          )}

          {done && (
            <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                Pages reversed successfully. The PDF has been downloaded.
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
