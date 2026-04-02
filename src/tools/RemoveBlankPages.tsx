/**
 * Remove Blank Pages tool.
 *
 * Renders every page at a low resolution and computes a "whiteness score"
 * (fraction of near-white pixels). Pages above the threshold are auto-selected
 * for removal. A sensitivity slider lets the user widen or tighten the
 * detection, and individual pages can be toggled manually.
 */

import { useState, useCallback, useEffect } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import { deletePages } from "../utils/pdf-operations.ts";
import { renderThumbnailsAndScores } from "../utils/pdf-renderer.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";
import { Trash2 } from "lucide-react";

export default function RemoveBlankPages() {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [scores, setScores] = useState<number[]>([]);
  const [threshold, setThreshold] = useState(0.97);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
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
    setScores([]);
    setThumbnails([]);
    setSelectedPages(new Set());
    try {
      const { thumbnails: thumbs, scores: pageScores } = await renderThumbnailsAndScores(pdf);
      setThumbnails(thumbs);
      setScores(pageScores);
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

  // Re-compute auto-selection whenever scores or threshold change
  useEffect(() => {
    if (scores.length === 0) return;
    setSelectedPages(
      new Set(scores.map((s, i) => (s >= threshold ? i : -1)).filter((i) => i >= 0)),
    );
  }, [scores, threshold]);

  const togglePage = useCallback((pageIndex: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageIndex)) next.delete(pageIndex);
      else next.add(pageIndex);
      return next;
    });
  }, []);

  const handleRemove = useCallback(async () => {
    if (!file || selectedPages.size === 0) return;
    if (selectedPages.size >= thumbnails.length) return;
    setProcessing(true);
    setError(null);
    setDone(false);
    try {
      const result = await deletePages(file, Array.from(selectedPages));
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_cleaned.pdf`);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove pages. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file, selectedPages, thumbnails.length]);

  const pageCount = thumbnails.length;

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Blank pages are detected automatically — review before removing"
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted">
              <span className="font-medium">{file.name}</span> — {formatFileSize(file.size)}
              {!loading && pageCount > 0 && (
                <>
                  , {pageCount} pages
                  {selectedPages.size > 0 && (
                    <span className="text-amber-600 dark:text-amber-400 ml-2">
                      ({selectedPages.size} blank page{selectedPages.size !== 1 ? "s" : ""}{" "}
                      detected)
                    </span>
                  )}
                </>
              )}
            </p>
            <button
              onClick={() => {
                setFile(null);
                setThumbnails([]);
                setScores([]);
                setSelectedPages(new Set());
                setDone(false);
              }}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              Change file
            </button>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
              <p className="text-sm text-slate-500 dark:text-dark-text-muted">Analysing pages…</p>
            </div>
          ) : (
            <>
              {/* Sensitivity slider */}
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                    Detection sensitivity
                  </p>
                  <span className="inline-flex items-center rounded-full bg-primary-100 dark:bg-primary-900/40 px-2 py-0.5 text-xs font-semibold text-primary-700 dark:text-primary-300 tabular-nums">
                    {Math.round(threshold * 100)}% white
                  </span>
                </div>
                <input
                  type="range"
                  min={0.8}
                  max={1.0}
                  step={0.01}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full accent-primary-600 cursor-pointer"
                />
                <div className="flex justify-between text-xs text-slate-400 dark:text-dark-text-muted mt-1">
                  <span>Lenient (catch lightly filled pages)</span>
                  <span>Strict (pure white only)</span>
                </div>
              </div>

              {pageCount > 0 && (
                <p className="text-xs text-slate-400 dark:text-dark-text-muted">
                  Click any page to toggle its selection. Highlighted pages will be removed.
                </p>
              )}

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {thumbnails.map((thumb, i) => (
                  <PageThumbnail
                    key={i}
                    src={thumb}
                    pageNumber={i + 1}
                    selected={selectedPages.has(i)}
                    onClick={() => togglePage(i)}
                    overlay={
                      selectedPages.has(i) ? (
                        <div className="bg-amber-400/70 inset-0 absolute flex items-center justify-center">
                          <Trash2 className="w-8 h-8 text-white" />
                        </div>
                      ) : null
                    }
                  />
                ))}
              </div>

              {selectedPages.size === 0 && pageCount > 0 && (
                <p className="text-center text-sm text-slate-400 dark:text-dark-text-muted">
                  No blank pages detected at this sensitivity level.
                </p>
              )}

              {selectedPages.size > 0 && selectedPages.size < pageCount && (
                <button
                  onClick={handleRemove}
                  disabled={processing}
                  className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {processing
                    ? "Removing…"
                    : `Remove ${selectedPages.size} Page${selectedPages.size !== 1 ? "s" : ""} & Download`}
                </button>
              )}

              {selectedPages.size >= pageCount && pageCount > 0 && (
                <p className="text-center text-sm text-red-500">
                  Cannot remove all pages. Deselect at least one page.
                </p>
              )}

              {done && (
                <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">
                    Blank pages removed successfully. The PDF has been downloaded.
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
