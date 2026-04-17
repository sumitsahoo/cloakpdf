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
import { AlertBox } from "../components/AlertBox.tsx";
import { ActionButton } from "../components/ActionButton.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import { deletePages } from "../utils/pdf-operations.ts";
import { renderThumbnailsAndScores, revokeThumbnails } from "../utils/pdf-renderer.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";
import { CheckCircle2, Trash2 } from "lucide-react";
import { InfoCallout } from "../components/InfoCallout.tsx";

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
          glowColor={categoryGlow.organise}
          iconColor={categoryAccent.organise}
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Blank pages are detected automatically — review before removing"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={file.name}
            details={formatFileSize(file.size)}
            onChangeFile={() => {
              revokeThumbnails(thumbnails);
              setFile(null);
              setThumbnails([]);
              setScores([]);
              setSelectedPages(new Set());
              setDone(false);
            }}
            extra={
              !loading && pageCount > 0 ? (
                <>
                  , {pageCount} pages
                  {selectedPages.size > 0 && (
                    <span className="text-primary-600 dark:text-primary-400 ml-2">
                      ({selectedPages.size} blank page{selectedPages.size !== 1 ? "s" : ""}{" "}
                      detected)
                    </span>
                  )}
                </>
              ) : undefined
            }
          />

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <LoadingSpinner className="" />
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
                        <div className="bg-primary-600/70 inset-0 absolute flex items-center justify-center">
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
                <ActionButton
                  onClick={handleRemove}
                  processing={processing}
                  label={`Remove ${selectedPages.size} Page${selectedPages.size !== 1 ? "s" : ""} & Download`}
                  processingLabel="Removing…"
                />
              )}

              {selectedPages.size >= pageCount && pageCount > 0 && (
                <p className="text-center text-sm text-red-500">
                  Cannot remove all pages. Deselect at least one page.
                </p>
              )}

              {done && (
                <InfoCallout icon={CheckCircle2} accent="organise">
                  Blank pages removed successfully. The PDF has been downloaded.
                </InfoCallout>
              )}
            </>
          )}
        </>
      )}

      {error && <AlertBox variant="error" message={error} />}
    </div>
  );
}
