/**
 * Add Blank Page tool.
 *
 * Loads a PDF and displays its pages as thumbnails in a wrapping grid
 * (matching the ReorderPages layout). The user can add one or more blank
 * pages, drag any item to reorder, and download the result.
 */

import { useState, useCallback } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";
import { useSortableDrag } from "../hooks/useSortableDrag.ts";
import { TouchDragOverlay } from "../components/TouchDragOverlay.tsx";
import { addBlankPages } from "../utils/pdf-operations.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";
import { Undo2, Plus } from "lucide-react";

type BlankItem = { type: "blank"; id: string };
type OriginalItem = { type: "original"; index: number };
type PageItem = BlankItem | OriginalItem;

let blankCounter = 0;
function nextBlankId() {
  return `blank-${++blankCounter}-${Date.now()}`;
}

export default function AddBlankPage() {
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
  const { dragIndex, dragOverSlot, touchPos, setDragIndex, setDragOverSlot, getTouchHandlers } =
    useSortableDrag(handleMove);

  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setError(null);
    setLoading(true);
    try {
      const thumbs = await renderAllThumbnails(pdf);
      setThumbnails(thumbs);
      // Default: one blank page at the start
      const originals: PageItem[] = thumbs.map((_, i) => ({ type: "original" as const, index: i }));
      setItems([{ type: "blank", id: nextBlankId() }, ...originals]);
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

  const hasBlankPages = items.some((it) => it.type === "blank");
  const isDragging = dragIndex !== null;

  const handleAddBlank = useCallback(() => {
    setItems((prev) => [{ type: "blank", id: nextBlankId() }, ...prev]);
  }, []);

  const handleReset = useCallback(() => {
    setItems((prev) => prev.filter((it) => it.type === "original"));
    setDragIndex(null);
    setDragOverSlot(null);
  }, [setDragIndex, setDragOverSlot]);

  const handleApply = useCallback(async () => {
    if (!file || !hasBlankPages) return;
    setProcessing(true);
    setError(null);
    try {
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
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_blank_added.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to insert blank pages. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file, hasBlankPages, items]);

  const renderItems = () => {
    const elements: React.ReactNode[] = [];

    for (let slot = 0; slot <= items.length; slot++) {
      // ── Drop zone ──
      const isAdjacentToDrag = dragIndex !== null && (slot === dragIndex || slot === dragIndex + 1);

      elements.push(
        <div
          key={`drop-${slot}`}
          data-drop-slot={slot}
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
            setItems((prev) => {
              const next = [...prev];
              const [moved] = next.splice(dragIndex, 1);
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
      if (slot < items.length) {
        const item = items[slot];
        const isSource = dragIndex === slot;

        if (item.type === "blank") {
          elements.push(
            <div
              key={item.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                setDragIndex(slot);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setDragOverSlot(null);
              }}
              {...getTouchHandlers(slot)}
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
                    isSource ? "bg-slate-400 dark:bg-slate-600 opacity-50" : "bg-primary-600"
                  }`}
                >
                  New
                </div>
              </div>
              <span className="text-xs font-medium text-primary-500">Blank</span>
            </div>,
          );
        } else {
          elements.push(
            <div
              key={`page-${item.index}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                setDragIndex(slot);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setDragOverSlot(null);
              }}
              {...getTouchHandlers(slot)}
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
                    isSource ? "bg-slate-400 dark:bg-slate-600 opacity-50" : "bg-primary-600"
                  }`}
                >
                  {item.index + 1}
                </div>
              </div>
              <span className="text-xs font-medium text-slate-500 dark:text-dark-text-muted">
                Page {item.index + 1}
              </span>
            </div>,
          );
        }
      }
    }

    return elements;
  };

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          glowColor={categoryGlow.organise}
          iconColor={categoryAccent.organise}
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Add one or more blank pages and drag to set their position"
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
                      ? "Drop the page at its new position"
                      : "Drag pages to rearrange them"}
                  </p>
                  <div className="flex items-center gap-3">
                    {hasBlankPages && (
                      <button
                        type="button"
                        onClick={handleReset}
                        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-dark-text-muted dark:hover:text-dark-text transition-colors"
                      >
                        <Undo2 className="w-4 h-4" />
                        Reset
                      </button>
                    )}
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

                <div className="flex flex-wrap items-end gap-y-6 overflow-x-auto pb-2 min-h-28">
                  {renderItems()}
                </div>

                {dragIndex !== null && (
                  <TouchDragOverlay touchPos={touchPos}>
                    {items[dragIndex]?.type === "blank" ? (
                      <div className="w-20 sm:w-24 md:w-28 aspect-[3/4] rounded-lg border-2 border-dashed border-primary-400 bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center shadow-lg">
                        <span className="text-primary-500 text-2xl font-light">+</span>
                      </div>
                    ) : (
                      <div className="w-20 sm:w-24 md:w-28 aspect-[3/4] bg-white dark:bg-dark-surface rounded-lg overflow-hidden border-2 border-primary-400 shadow-lg">
                        <img
                          src={
                            thumbnails[
                              (items[dragIndex] as { type: "original"; index: number }).index
                            ]
                          }
                          className="w-full h-full object-contain"
                          alt=""
                          draggable={false}
                        />
                      </div>
                    )}
                  </TouchDragOverlay>
                )}

                {hasBlankPages && (
                  <p className="text-xs text-primary-600 dark:text-primary-400 font-medium">
                    {items.filter((it) => it.type === "blank").length} blank page(s) added — click
                    below to apply
                  </p>
                )}
              </div>

              {hasBlankPages && (
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={processing}
                  className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {processing ? "Inserting…" : "Insert Blank Pages & Download"}
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
