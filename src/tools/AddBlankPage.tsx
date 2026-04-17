/**
 * Add Blank Page tool.
 *
 * Loads a PDF and displays its pages as thumbnails in a wrapping grid
 * (matching the ReorderPages layout). The user can add one or more blank
 * pages, drag any item to reorder, and download the result.
 */

import { Plus } from "lucide-react";
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
import { downloadPdf, formatFileSize, pdfFilename } from "../utils/file-helpers.ts";
import { addBlankPages } from "../utils/pdf-operations.ts";
import { renderAllThumbnails, revokeThumbnails } from "../utils/pdf-renderer.ts";

type BlankItem = { type: "blank"; id: string };
type OriginalItem = { type: "original"; index: number };
type PageItem = BlankItem | OriginalItem;

let blankCounter = 0;
function nextBlankId() {
  return `blank-${++blankCounter}-${Date.now()}`;
}

export default function AddBlankPage() {
  const [items, setItems] = useState<PageItem[]>([]);

  const pdf = usePdfFile<string[]>({
    load: async (file) => {
      const thumbs = await renderAllThumbnails(file);
      // Default: one blank page at the start
      const originals: PageItem[] = thumbs.map((_, i) => ({ type: "original" as const, index: i }));
      setItems([{ type: "blank", id: nextBlankId() }, ...originals]);
      return thumbs;
    },
    onReset: (thumbs) => {
      revokeThumbnails(thumbs ?? []);
      setItems([]);
    },
  });
  const task = useAsyncProcess();

  const thumbnails = pdf.data ?? [];

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

  const hasBlankPages = items.some((it) => it.type === "blank");
  const isDragging = drag.dragIndex !== null;

  const handleAddBlank = useCallback(() => {
    setItems((prev) => [{ type: "blank", id: nextBlankId() }, ...prev]);
  }, []);

  const handleReset = useCallback(() => {
    setItems((prev) => prev.filter((it) => it.type === "original"));
    drag.setDragIndex(null);
    drag.setDragOverSlot(null);
  }, [drag]);

  const handleApply = useCallback(async () => {
    if (!pdf.file || !hasBlankPages) return;
    const file = pdf.file;
    await task.run(async () => {
      // Compute the 0-based positions (relative to the original page list)
      // where blank pages should be inserted.
      const positions: number[] = [];
      let originalsSeen = 0;
      for (const it of items) {
        if (it.type === "blank") {
          positions.push(originalsSeen);
        } else {
          originalsSeen++;
        }
      }
      const result = await addBlankPages(file, positions);
      downloadPdf(result, pdfFilename(file, "_blank_added"));
    }, "Failed to insert blank pages. Please try again.");
  }, [pdf.file, hasBlankPages, items, task]);

  return (
    <div className="space-y-6">
      {!pdf.file ? (
        <FileDropZone
          glowColor={categoryGlow.organise}
          iconColor={categoryAccent.organise}
          accept=".pdf,application/pdf"
          onFiles={pdf.onFiles}
          label="Drop a PDF file here"
          hint="Add one or more blank pages and drag to set their position"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={pdf.file.name}
            details={formatFileSize(pdf.file.size)}
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
                  <div className="flex items-center gap-3">
                    {hasBlankPages && <ResetButton onClick={handleReset} />}
                    <button
                      type="button"
                      onClick={handleAddBlank}
                      className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add blank page
                    </button>
                  </div>
                </div>

                <SortableGrid
                  itemCount={items.length}
                  drag={drag}
                  onMove={handleMove}
                  renderItem={(slot, isSource) => {
                    const item = items[slot];

                    if (item.type === "blank") {
                      return (
                        <div
                          key={item.id}
                          {...drag.getItemProps(slot)}
                          className={`shrink-0 pt-2 pr-2 flex flex-col items-center gap-1.5 cursor-grab active:cursor-grabbing select-none transition-all duration-200 ${
                            isSource ? "scale-95 opacity-30" : "scale-100 opacity-100"
                          }`}
                        >
                          <div className="relative">
                            <div
                              className={`w-20 sm:w-24 md:w-28 aspect-[3/4] rounded-lg border-2 border-dashed flex items-center justify-center transition-colors shadow-sm ${
                                isSource
                                  ? "border-slate-300 dark:border-dark-border bg-slate-50 dark:bg-dark-surface"
                                  : "border-primary-400 bg-primary-50 dark:bg-primary-900/20"
                              }`}
                            >
                              <span className="text-primary-500 text-2xl font-light">+</span>
                            </div>
                            <div
                              className={`absolute -top-1.5 -right-1.5 text-white text-[10px] font-bold px-1.5 h-5 rounded-full flex items-center justify-center shadow-md z-10 transition-opacity duration-200 ${
                                isSource
                                  ? "bg-slate-400 dark:bg-slate-600 opacity-50"
                                  : "bg-primary-600"
                              }`}
                            >
                              New
                            </div>
                          </div>
                          <span className="text-xs font-medium text-primary-500">Blank</span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={`page-${item.index}`}
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
                    if (item?.type === "blank") {
                      return (
                        <div className="relative pt-2 pr-2">
                          <div className="w-20 sm:w-24 md:w-28 aspect-[3/4] rounded-lg border-2 border-dashed border-primary-400 bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center shadow-sm">
                            <span className="text-primary-500 text-2xl font-light">+</span>
                          </div>
                          <div className="absolute top-0 right-0 text-white text-[10px] font-bold px-1.5 h-5 rounded-full flex items-center justify-center shadow-md bg-primary-600">
                            New
                          </div>
                        </div>
                      );
                    }
                    const pageIndex = (item as OriginalItem).index;
                    return (
                      <div className="relative pt-2 pr-2">
                        <div className="w-20 sm:w-24 md:w-28 aspect-[3/4] bg-white dark:bg-dark-surface rounded-lg overflow-hidden border-2 border-slate-200 dark:border-dark-border shadow-sm">
                          <img
                            src={thumbnails[pageIndex]}
                            className="w-full h-full object-contain"
                            alt=""
                            draggable={false}
                          />
                        </div>
                        <div className="absolute top-0 right-0 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md bg-primary-600">
                          {pageIndex + 1}
                        </div>
                      </div>
                    );
                  }}
                />

                {hasBlankPages && (
                  <p className="text-xs text-primary-600 dark:text-primary-400 font-medium">
                    {items.filter((it) => it.type === "blank").length} blank page(s) added — click
                    below to apply
                  </p>
                )}
              </div>

              {hasBlankPages && (
                <ActionButton
                  onClick={handleApply}
                  processing={task.processing}
                  label="Insert Blank Pages & Download"
                  processingLabel="Inserting…"
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
