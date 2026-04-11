/**
 * Duplicate Page tool.
 *
 * Single unified grid: click any page to add a copy at position 0.
 * Click again (same or different page) to add more copies.
 * All items are draggable so the user can reposition copies, then download.
 */

import { useCallback, useState } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { SortableGrid } from "../components/SortableGrid.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";
import { useSortableDrag } from "../hooks/useSortableDrag.ts";
import { duplicatePages } from "../utils/pdf-operations.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";
import { Undo2 } from "lucide-react";

type CopyItem = { type: "copy"; sourceIndex: number; id: string };
type OriginalItem = { type: "original"; index: number };
type PageItem = CopyItem | OriginalItem;

let copyCounter = 0;
function nextCopyId() {
  return `copy-${++copyCounter}-${Date.now()}`;
}

export default function DuplicatePage() {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [items, setItems] = useState<PageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMove = useCallback((fromIndex: number, toSlot: number) => {
    setItems((prev) => {
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
    setError(null);
    setLoading(true);
    try {
      const thumbs = await renderAllThumbnails(pdf);
      setThumbnails(thumbs);
      setItems(thumbs.map((_, i) => ({ type: "original" as const, index: i })));
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

  const hasCopies = items.some((it) => it.type === "copy");
  const isDragging = drag.dragIndex !== null;

  const handleDuplicatePage = useCallback((pageIndex: number, afterSlot: number) => {
    setItems((prev) => {
      const next = [...prev];
      next.splice(afterSlot + 1, 0, { type: "copy", sourceIndex: pageIndex, id: nextCopyId() });
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    setItems((prev) => prev.filter((it) => it.type === "original"));
    drag.setDragIndex(null);
    drag.setDragOverSlot(null);
  }, [drag]);

  const handleApply = useCallback(async () => {
    if (!file || !hasCopies) return;
    setProcessing(true);
    setError(null);
    try {
      // Compute copy positions relative to the original page list.
      const copies: { sourceIndex: number; position: number }[] = [];
      let originalsSeen = 0;
      for (const it of items) {
        if (it.type === "copy") {
          copies.push({ sourceIndex: it.sourceIndex, position: originalsSeen });
        } else {
          originalsSeen++;
        }
      }
      const result = await duplicatePages(file, copies);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_duplicated.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to duplicate pages. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file, hasCopies, items]);

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          glowColor={categoryGlow.organise}
          iconColor={categoryAccent.organise}
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Click a page to duplicate it right after and drag copies to rearrange"
        />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted break-all sm:break-normal">
              <span className="font-medium">{file.name}</span> — {formatFileSize(file.size)}
            </p>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setThumbnails([]);
                setItems([]);
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
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                    {isDragging
                      ? "Drop at the desired position"
                      : hasCopies
                        ? "Click a page to add another copy — drag to rearrange"
                        : "Click a page to duplicate it — the copy appears right after"}
                  </p>
                  {hasCopies && (
                    <button
                      type="button"
                      onClick={handleReset}
                      className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-dark-text-muted dark:hover:text-dark-text transition-colors"
                    >
                      <Undo2 className="w-4 h-4" />
                      Reset
                    </button>
                  )}
                </div>

                <SortableGrid
                  itemCount={items.length}
                  drag={drag}
                  onMove={handleMove}
                  className="flex flex-wrap items-end gap-y-6 pb-2 min-h-28"
                  renderItem={(slot, isSource) => {
                    const item = items[slot];

                    if (item.type === "copy") {
                      return (
                        <div
                          key={item.id}
                          {...drag.getItemProps(slot)}
                          className={`shrink-0 p-2 flex flex-col items-center gap-1.5 cursor-grab active:cursor-grabbing select-none transition-all duration-200 ${
                            isSource ? "scale-95 opacity-30" : "scale-100 opacity-100"
                          }`}
                        >
                          <div className="relative">
                            <div
                              className={`w-20 sm:w-24 md:w-28 aspect-[3/4] bg-white dark:bg-dark-surface rounded-lg overflow-hidden border-2 transition-colors shadow-sm ${
                                isSource
                                  ? "border-dashed border-slate-300 dark:border-dark-border"
                                  : "border-primary-400"
                              }`}
                            >
                              <img
                                src={thumbnails[item.sourceIndex]}
                                className="w-full h-full object-contain"
                                alt={`Copy of page ${item.sourceIndex + 1}`}
                                draggable={false}
                              />
                              <div className="absolute inset-0 bg-primary-500/20 rounded-lg" />
                            </div>
                            <div
                              className={`absolute -top-1.5 -right-1.5 text-white text-[10px] font-bold px-1.5 h-5 rounded-full flex items-center justify-center shadow-md z-10 transition-opacity duration-200 ${
                                isSource
                                  ? "bg-slate-400 dark:bg-slate-600 opacity-50"
                                  : "bg-primary-600"
                              }`}
                            >
                              Copy
                            </div>
                          </div>
                          <span className="text-xs font-medium text-primary-500">
                            Copy of {item.sourceIndex + 1}
                          </span>
                        </div>
                      );
                    }

                    // Original page card — conditionally draggable (only after copies exist).
                    // Uses getTouchHandlers directly instead of getItemProps for selective control.
                    return (
                      <div
                        key={`page-${item.index}`}
                        draggable={hasCopies}
                        onClick={() => {
                          if (!isDragging) handleDuplicatePage(item.index, slot);
                        }}
                        onDragStart={(e) => {
                          if (!hasCopies) return;
                          e.dataTransfer.effectAllowed = "move";
                          drag.setDragIndex(slot);
                        }}
                        onDragEnd={() => {
                          drag.setDragIndex(null);
                          drag.setDragOverSlot(null);
                        }}
                        {...(hasCopies ? drag.getTouchHandlers(slot) : {})}
                        className={`shrink-0 p-2 flex flex-col items-center gap-1.5 select-none transition-all duration-200 cursor-pointer ${
                          hasCopies ? "active:cursor-grabbing" : "hover:scale-105"
                        } ${isSource ? "scale-95 opacity-30" : "scale-100 opacity-100"}`}
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
                              src={thumbnails[item.index]}
                              className="w-full h-full object-contain"
                              alt={`Page ${item.index + 1}`}
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
                            {item.index + 1}
                          </div>
                        </div>
                        <span className="text-xs font-medium text-slate-500 dark:text-dark-text-muted">
                          Page {item.index + 1}
                        </span>
                      </div>
                    );
                  }}
                  renderOverlay={(idx) => {
                    const item = items[idx];
                    const srcIdx =
                      item?.type === "copy"
                        ? item.sourceIndex
                        : item?.type === "original"
                          ? item.index
                          : null;
                    if (srcIdx === null) return null;
                    const isCopy = item?.type === "copy";
                    return (
                      <div className="relative pt-2 pr-2">
                        <div className="w-20 sm:w-24 md:w-28 aspect-[3/4] bg-white dark:bg-dark-surface rounded-lg overflow-hidden border-2 border-slate-200 dark:border-dark-border shadow-sm">
                          <img
                            src={thumbnails[srcIdx]}
                            className="w-full h-full object-contain"
                            alt=""
                            draggable={false}
                          />
                          {isCopy && (
                            <div className="absolute inset-0 bg-primary-500/20 rounded-lg" />
                          )}
                        </div>
                        <div
                          className={`absolute top-0 right-0 text-white font-bold rounded-full flex items-center justify-center shadow-md bg-primary-600 ${
                            isCopy ? "text-[10px] px-1.5 h-5" : "text-xs w-6 h-6"
                          }`}
                        >
                          {isCopy ? "Copy" : srcIdx + 1}
                        </div>
                      </div>
                    );
                  }}
                />

                {hasCopies && (
                  <p className="text-xs text-primary-600 dark:text-primary-400 font-medium">
                    {items.filter((it) => it.type === "copy").length} copy(ies) added — click below
                    to apply
                  </p>
                )}
              </div>

              {hasCopies && (
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={processing}
                  className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {processing ? "Duplicating…" : "Duplicate Pages & Download"}
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
