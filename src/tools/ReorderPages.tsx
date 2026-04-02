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
import { reorderPages } from "../utils/pdf-operations.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";
import { downloadPdf } from "../utils/file-helpers.ts";

export default function ReorderPages() {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  /** order[i] is the original 0-based page index at visual position i. */
  const [order, setOrder] = useState<number[]>([]);
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);

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
    setDragIndex(null);
    setDragOverSlot(null);
  }, [thumbnails]);

  const isReordered = order.some((pageIdx, i) => pageIdx !== i);
  const isDragging = dragIndex !== null;

  /**
   * Build the interleaved layout: [drop_0] [page_0] [drop_1] [page_1] ... [page_N-1] [drop_N]
   *
   * When dragging, the drop-zone gaps expand and show a vertical bar indicator
   * on hover—exactly like AddBlankPage. The source page card gets a highlighted
   * ring to show it's selected. Dropping on a gap moves the page to that slot.
   */
  const renderItems = () => {
    const items: React.ReactNode[] = [];

    for (let slot = 0; slot <= order.length; slot++) {
      // ── Drop zone ──
      // Don't show drop zones immediately adjacent to the dragged card
      // (dropping there would be a no-op).
      const isAdjacentToDrag = dragIndex !== null && (slot === dragIndex || slot === dragIndex + 1);

      items.push(
        <div
          key={`drop-${slot}`}
          onDragOver={(e) => {
            if (isAdjacentToDrag) return;
            e.preventDefault();
            setDragOverSlot(slot);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              if (dragOverSlot === slot) setDragOverSlot(null);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIndex === null || isAdjacentToDrag) return;
            setOrder((prev) => {
              const next = [...prev];
              const [moved] = next.splice(dragIndex, 1);
              // Adjust target: if we removed from before the slot the index shifts
              const adjustedSlot = dragIndex < slot ? slot - 1 : slot;
              next.splice(adjustedSlot, 0, moved);
              return next;
            });
            setDragIndex(null);
            setDragOverSlot(null);
          }}
          className={`self-stretch flex items-center justify-center rounded-lg transition-all duration-200 ${
            isDragging && !isAdjacentToDrag
              ? dragOverSlot === slot
                ? "w-20 sm:w-24 bg-primary-50 dark:bg-primary-900/20"
                : "w-3 sm:w-4"
              : "w-0"
          }`}
        >
          {isDragging && !isAdjacentToDrag && (
            <div
              className={`rounded-full transition-all duration-200 ${
                dragOverSlot === slot
                  ? "w-1 bg-primary-500"
                  : "w-0.5 bg-primary-200 dark:bg-primary-800"
              }`}
              style={{ height: dragOverSlot === slot ? "80%" : "60%" }}
            />
          )}
        </div>,
      );

      // ── Page card ──
      if (slot < order.length) {
        const originalIndex = order[slot];
        const isSource = dragIndex === slot;

        items.push(
          <div
            key={`page-${originalIndex}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              setDragIndex(slot);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setDragOverSlot(null);
            }}
            className={`shrink-0 pt-2 pr-2 flex flex-col items-center gap-1.5 cursor-grab active:cursor-grabbing select-none transition-all duration-200 ${
              isSource
                ? "ring-3 ring-primary-400 dark:ring-primary-500 rounded-xl scale-95 opacity-60 shadow-lg shadow-primary-200 dark:shadow-primary-900/40"
                : "ring-0 scale-100 opacity-100"
            }`}
          >
            <div className="relative">
              <div
                className={`w-20 sm:w-24 md:w-28 aspect-[3/4] bg-white dark:bg-dark-surface rounded-lg overflow-hidden border-2 transition-colors shadow-sm ${
                  isSource
                    ? "border-primary-400 dark:border-primary-500"
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
              <div className="absolute -top-1.5 -right-1.5 bg-primary-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md z-10">
                {originalIndex + 1}
              </div>
            </div>
            <span className="text-xs font-medium text-slate-500 dark:text-dark-text-muted">
              Page {originalIndex + 1}
            </span>
          </div>,
        );
      }
    }

    return items;
  };

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Drag and drop pages to reorder them"
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted">
              <span className="font-medium">{file.name}</span> — {thumbnails.length} pages
            </p>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setThumbnails([]);
                setOrder([]);
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
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                    {isDragging
                      ? "Drop the page at its new position"
                      : "Drag pages to rearrange them"}
                  </p>
                  {isReordered && (
                    <button
                      type="button"
                      onClick={handleReset}
                      className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-dark-text-muted dark:hover:text-dark-text transition-colors"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2 8a6 6 0 0 1 10.2-4.3" />
                        <path d="M14 8a6 6 0 0 1-10.2 4.3" />
                        <polyline points="2 2 2 5.5 5.5 5.5" />
                        <polyline points="14 14 14 10.5 10.5 10.5" />
                      </svg>
                      Reset order
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-end gap-y-6 overflow-x-auto pb-2 min-h-28">
                  {renderItems()}
                </div>

                {isReordered && (
                  <p className="text-xs text-primary-600 dark:text-primary-400 font-medium">
                    Order changed — click below to apply
                  </p>
                )}
              </div>

              {isReordered && (
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={processing}
                  className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {processing ? "Reordering…" : "Apply New Order & Download"}
                </button>
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
