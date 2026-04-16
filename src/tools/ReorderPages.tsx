/**
 * Reorder Pages tool.
 *
 * Uses native HTML drag-and-drop (same visual pattern as AddBlankPage) to let
 * the user rearrange PDF pages. Pages appear in a responsive wrapping grid
 * with explicit drop-zone gaps between them that expand when dragging.
 * The "Apply" button only appears once the order has actually changed.
 * A "Reset" button lets the user restore the original page order.
 */

import { useState, useCallback } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { SortableGrid } from "../components/SortableGrid.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { ActionButton } from "../components/ActionButton.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { ResetButton } from "../components/ResetButton.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { reorderPages } from "../utils/pdf-operations.ts";
import { renderAllThumbnails, revokeThumbnails } from "../utils/pdf-renderer.ts";
import { downloadPdf } from "../utils/file-helpers.ts";
import { useSortableDrag } from "../hooks/useSortableDrag.ts";

export default function ReorderPages() {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  /** order[i] is the original 0-based page index at visual position i. */
  const [order, setOrder] = useState<number[]>([]);
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMove = useCallback((fromIndex: number, toSlot: number) => {
    setOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      const adjustedSlot = fromIndex < toSlot ? toSlot - 1 : toSlot;
      next.splice(adjustedSlot, 0, moved);
      return next;
    });
  }, []);

  // Drag state (desktop + mobile touch)
  const drag = useSortableDrag(handleMove);

  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setLoading(true);
    setError(null);
    try {
      const thumbs = await renderAllThumbnails(pdf);
      setThumbnails(thumbs);
      setOrder(thumbs.map((_, i) => i));
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

  const handleApply = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    try {
      const result = await reorderPages(file, order);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_reordered.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reorder pages. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file, order]);

  const handleReset = useCallback(() => {
    setOrder(thumbnails.map((_, i) => i));
    drag.setDragIndex(null);
    drag.setDragOverSlot(null);
  }, [thumbnails, drag]);

  const isReordered = order.some((pageIdx, i) => pageIdx !== i);
  const isDragging = drag.dragIndex !== null;

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          glowColor={categoryGlow.organise}
          iconColor={categoryAccent.organise}
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Drag and drop pages to reorder them"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={file.name}
            details={`${thumbnails.length} pages`}
            onChangeFile={() => {
              revokeThumbnails(thumbnails);
              setFile(null);
              setThumbnails([]);
              setOrder([]);
            }}
          />

          {loading ? (
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
                  processing={processing}
                  label="Apply New Order & Download"
                  processingLabel="Reordering…"
                />
              )}
            </>
          )}
        </>
      )}

      {error && <AlertBox variant="error" message={error} />}
    </div>
  );
}
