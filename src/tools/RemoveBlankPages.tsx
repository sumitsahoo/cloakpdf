/**
 * Remove Blank Pages tool.
 *
 * Renders every page at a low resolution and computes a "whiteness score"
 * (fraction of near-white pixels). Pages above the threshold are auto-selected
 * for removal. A sensitivity slider lets the user widen or tighten the
 * detection, and individual pages can be toggled manually.
 */

import { CheckCircle2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { InfoCallout } from "../components/InfoCallout.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import { ThumbnailGrid } from "../components/ThumbnailGrid.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { usePdfFile } from "../hooks/usePdfFile.ts";
import { useToolOutput } from "../hooks/useToolOutput.ts";
import { formatFileSize } from "../utils/file-helpers.ts";
import { deletePages } from "../utils/pdf-operations.ts";
import { renderThumbnailsAndScores, revokeThumbnails } from "../utils/pdf-renderer.ts";

/** Analysis output: thumbnail URL + whiteness score per page. */
interface PageAnalysis {
  thumbnails: string[];
  scores: number[];
}

export default function RemoveBlankPages() {
  const [threshold, setThreshold] = useState(0.97);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [done, setDone] = useState(false);

  const pdf = usePdfFile<PageAnalysis>({
    load: renderThumbnailsAndScores,
    onReset: (analysis) => {
      revokeThumbnails(analysis?.thumbnails ?? []);
      setSelectedPages(new Set());
      setDone(false);
    },
  });
  const task = useAsyncProcess();
  const output = useToolOutput();

  const thumbnails = pdf.data?.thumbnails ?? [];
  const scores = pdf.data?.scores ?? [];
  const pageCount = thumbnails.length;

  // Re-compute auto-selection whenever scores or threshold change
  useEffect(() => {
    if (scores.length === 0) return;
    setSelectedPages(
      new Set(scores.map((s, i) => (s >= threshold ? i : -1)).filter((i) => i >= 0)),
    );
  }, [scores, threshold]);

  // In workflow mode, if analysis finished and no blank pages were
  // detected, auto-skip to the next step (req #4). Standalone keeps the
  // existing "no blank pages detected" message — same UI, same words.
  const [skipFired, setSkipFired] = useState(false);
  useEffect(() => {
    if (!output.inWorkflow) return;
    if (pdf.loading || pageCount === 0) return;
    if (skipFired) return;
    if (selectedPages.size === 0) {
      setSkipFired(true);
      output.skip("No blank pages detected");
    }
  }, [output, pdf.loading, pageCount, selectedPages.size, skipFired]);

  const togglePage = useCallback((pageIndex: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageIndex)) next.delete(pageIndex);
      else next.add(pageIndex);
      return next;
    });
  }, []);

  const handleRemove = useCallback(async () => {
    if (!pdf.file || selectedPages.size === 0) return;
    if (selectedPages.size >= pageCount) return;
    const file = pdf.file;
    setDone(false);
    const ok = await task.run(async () => {
      const result = await deletePages(file, Array.from(selectedPages));
      output.deliver(result, "_cleaned", file);
    }, "Failed to remove pages. Please try again.");
    if (ok) setDone(true);
  }, [pdf.file, selectedPages, pageCount, task, output]);

  return (
    <div className="space-y-6">
      {!pdf.file ? (
        <FileDropZone
          glowColor={categoryGlow.organise}
          iconColor={categoryAccent.organise}
          accept=".pdf,application/pdf"
          onFiles={pdf.onFiles}
          label="Drop a PDF file here"
          hint="Blank pages are detected automatically — review before removing"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={pdf.file.name}
            details={formatFileSize(pdf.file.size)}
            onChangeFile={pdf.reset}
            extra={
              !pdf.loading && pageCount > 0 ? (
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

          {pdf.loading ? (
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

              <ThumbnailGrid>
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
              </ThumbnailGrid>

              {selectedPages.size === 0 && pageCount > 0 && (
                <p className="text-center text-sm text-slate-400 dark:text-dark-text-muted">
                  No blank pages detected at this sensitivity level.
                </p>
              )}

              {selectedPages.size > 0 && selectedPages.size < pageCount && (
                <ActionButton
                  onClick={handleRemove}
                  processing={task.processing}
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

      {(pdf.loadError || task.error) && <AlertBox message={pdf.loadError ?? task.error ?? ""} />}
    </div>
  );
}
