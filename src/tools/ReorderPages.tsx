/**
 * Reorder Pages tool.
 *
 * Uses native HTML drag-and-drop (same visual pattern as AddBlankPage) to let
 * the user rearrange PDF pages. Pages appear in a responsive wrapping grid
 * with explicit drop-zone gaps between them that expand when dragging.
 * The "Apply" button only appears once the order has actually changed.
 * A "Reset" button lets the user restore the original page order.
 */

import { useCallback, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { ResetButton } from "../components/ResetButton.tsx";
import { SortableGrid } from "../components/SortableGrid.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { usePdfFile } from "../hooks/usePdfFile.ts";
import { useSortableDrag } from "../hooks/useSortableDrag.ts";
import { downloadPdf, pdfFilename } from "../utils/file-helpers.ts";
import { reorderPages } from "../utils/pdf-operations.ts";
import { renderAllThumbnails, revokeThumbnails } from "../utils/pdf-renderer.ts";

export default function ReorderPages() {
  /** order[i] is the original 0-based page index at visual position i. */
  const [order, setOrder] = useState<number[]>([]);

  const pdf = usePdfFile<string[]>({
    load: async (file) => {
      const thumbs = await renderAllThumbnails(file);
      setOrder(thumbs.map((_, i) => i));
      return thumbs;
    },
    onReset: (thumbs) => {
      revokeThumbnails(thumbs ?? []);
      setOrder([]);
    },
  });
  const task = useAsyncProcess();

  const thumbnails = pdf.data ?? [];

  const handleMove = useCallback((fromIndex: number, toSlot: number) => {
    setOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      const adjustedSlot = fromIndex < toSlot ? toSlot - 1 : toSlot;
      next.splice(adjustedSlot, 0, moved);
      return next;
    });
  }, []);

  const drag = useSortableDrag(handleMove);

  const handleApply = useCallback(async () => {
    if (!pdf.file) return;
    const file = pdf.file;
    await task.run(async () => {
      const result = await reorderPages(file, order);
      downloadPdf(result, pdfFilename(file, "_reordered"));
    }, "Failed to reorder pages. Please try again.");
  }, [pdf.file, order, task]);

  const handleReset = useCallback(() => {
    setOrder(thumbnails.map((_, i) => i));
    drag.setDragIndex(null);
    drag.setDragOverSlot(null);
  }, [thumbnails, drag]);

  const isReordered = order.some((pageIdx, i) => pageIdx !== i);
  const isDragging = drag.dragIndex !== null;

  return (
    <div className="space-y-6">
      {!pdf.file ? (
        <FileDropZone
          glowColor={categoryGlow.organise}
          iconColor={categoryAccent.organise}
          accept=".pdf,application/pdf"
          onFiles={pdf.onFiles}
          label="Drop a PDF file here"
          hint="Drag and drop pages to reorder them"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={pdf.file.name}
            details={`${thumbnails.length} pages`}
            onChangeFile={pdf.reset}
          />

          {pdf.loading ? (
            <LoadingSpinner />
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                    {isDragging
                      ? "Drop the page at its new position"
                      : "Drag pages to rearrange them"}
                  </p>
                  {isReordered && <ResetButton onClick={handleReset} label="Reset order" />}
                </div>

                <SortableGrid
                  itemCount={order.length}
                  drag={drag}
                  onMove={handleMove}
                  renderItem={(slot, isSource) => {
                    const originalIndex = order[slot];
                    return (
                      <div
                        key={`page-${originalIndex}`}
                        {...drag.getItemProps(slot)}
                        className={`shrink-0 pt-2 pr-2 flex flex-col items-center gap-1.5 cursor-grab active:cursor-grabbing select-none transition-all duration-200 ${
                          isSource ? "scale-95 opacity-30" : "scale-100 opacity-100"
                        }`}
                      >
                        <div className="relative">
                          <div
                            className={`w-20 sm:w-24 md:w-28 aspect-[3/4] bg-white dark:bg-dark-surface rounded-lg overflow-hidden border-2 transition-colors shadow-sm ${
                              isSource
                                ? "border-dashed border-slate-300 dark:border-dark-border"
                                : "border-slate-200 dark:border-dark-border hover:border-primary-300 dark:hover:border-primary-600"
                            }`}
                          >
                            <img
                              src={thumbnails[originalIndex]}
                              className="w-full h-full object-contain"
                              alt={`Page ${originalIndex + 1}`}
                              draggable={false}
                            />
                          </div>
                          <div
                            className={`absolute -top-1.5 -right-1.5 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md z-10 transition-opacity duration-200 ${
                              isSource
                                ? "bg-slate-400 dark:bg-slate-600 opacity-50"
                                : "bg-primary-600"
                            }`}
                          >
                            {originalIndex + 1}
                          </div>
                        </div>
                        <span className="text-xs font-medium text-slate-500 dark:text-dark-text-muted">
                          Page {originalIndex + 1}
                        </span>
                      </div>
                    );
                  }}
                  renderOverlay={(idx) => (
                    <div className="relative pt-2 pr-2">
                      <div className="w-20 sm:w-24 md:w-28 aspect-[3/4] bg-white dark:bg-dark-surface rounded-lg overflow-hidden border-2 border-slate-200 dark:border-dark-border shadow-sm">
                        <img
                          src={thumbnails[order[idx]]}
                          className="w-full h-full object-contain"
                          alt=""
                          draggable={false}
                        />
                      </div>
                      <div className="absolute top-0 right-0 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md bg-primary-600">
                        {order[idx] + 1}
                      </div>
                    </div>
                  )}
                />

                {isReordered && (
                  <p className="text-xs text-primary-600 dark:text-primary-400 font-medium">
                    Order changed — click below to apply
                  </p>
                )}
              </div>

              {isReordered && (
                <ActionButton
                  onClick={handleApply}
                  processing={task.processing}
                  label="Apply New Order & Download"
                  processingLabel="Reordering…"
                />
              )}
            </>
          )}
        </>
      )}

      {(pdf.loadError || task.error) && <AlertBox message={pdf.loadError ?? task.error ?? ""} />}
    </div>
  );
}
