/**
 * Images to PDF tool.
 *
 * Accepts multiple image files (JPEG, PNG, WebP) via drag-and-drop, shows
 * previews with drag-to-reorder controls, and converts them into a single PDF.
 * Supports three page-size options: A4, Letter, and Fit-to-Image.
 * Object URLs for image previews are revoked on removal to avoid memory leaks.
 */

import { GripVertical, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { TouchDragOverlay } from "../components/TouchDragOverlay.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { useSortableDrag } from "../hooks/useSortableDrag.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";
import { imagesToPdf } from "../utils/pdf-operations.ts";

/** Internal representation of a queued image with its preview URL. */
interface ImageItem {
  file: File;
  id: string;
  /** Object URL for the image preview thumbnail. */
  preview: string;
}

export default function ImagesToPdf() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [pageSize, setPageSize] = useState<"a4" | "letter" | "fit">("a4");
  const task = useAsyncProcess();

  // Revoke all object URLs when the component unmounts
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only on unmount
  useEffect(() => {
    return () => {
      images.forEach((item) => {
        URL.revokeObjectURL(item.preview);
      });
    };
  }, []);

  const handleFiles = useCallback((files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    const items: ImageItem[] = imageFiles.map((f) => ({
      file: f,
      id: crypto.randomUUID(),
      preview: URL.createObjectURL(f),
    }));
    setImages((prev) => [...prev, ...items]);
  }, []);

  /** Remove an image from the queue and revoke its object URL to free memory. */
  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const handleMove = useCallback((fromIndex: number, toSlot: number) => {
    setImages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      const adjustedSlot = fromIndex < toSlot ? toSlot - 1 : toSlot;
      next.splice(adjustedSlot, 0, moved);
      return next;
    });
  }, []);

  const drag = useSortableDrag(handleMove);

  const handleConvert = useCallback(async () => {
    if (images.length === 0) return;
    await task.run(async () => {
      const result = await imagesToPdf(
        images.map((i) => i.file),
        pageSize,
      );
      downloadPdf(result, "images.pdf");
    }, "Failed to create PDF from images. Please try again.");
  }, [images, pageSize, task]);

  const isDragging = drag.dragIndex !== null;
  const dragged = drag.dragIndex !== null ? images[drag.dragIndex] : null;

  const rows: React.ReactNode[] = [];
  for (let slot = 0; slot <= images.length; slot++) {
    const isAdjacentToDrag =
      drag.dragIndex !== null && (slot === drag.dragIndex || slot === drag.dragIndex + 1);
    const isActiveDrop = drag.dragOverSlot === slot;

    rows.push(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- HTML5 drop target
      <div
        key={`drop-${slot}`}
        data-drop-slot={slot}
        onDragOver={(e) => {
          if (isAdjacentToDrag) return;
          e.preventDefault();
          drag.setDragOverSlot(slot);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            if (drag.dragOverSlot === slot) drag.setDragOverSlot(null);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (drag.dragIndex === null || isAdjacentToDrag) return;
          handleMove(drag.dragIndex, slot);
          drag.setDragIndex(null);
          drag.setDragOverSlot(null);
        }}
        className={`flex items-center px-4 transition-all duration-200 ${
          isDragging && !isAdjacentToDrag ? (isActiveDrop ? "h-10" : "h-2") : "h-0"
        }`}
      >
        {isDragging && !isAdjacentToDrag && (
          <div
            className={`w-full rounded-full transition-all duration-200 ${
              isActiveDrop ? "h-1 bg-primary-500" : "h-0.5 bg-primary-200 dark:bg-primary-800"
            }`}
          />
        )}
      </div>,
    );

    if (slot < images.length) {
      const item = images[slot];
      const isSource = drag.dragIndex === slot;
      rows.push(
        <div
          key={item.id}
          {...drag.getItemProps(slot)}
          className={`flex items-center gap-3 px-4 py-3 cursor-grab active:cursor-grabbing select-none transition-all duration-200 ${
            isSource ? "scale-95 opacity-30" : "scale-100 opacity-100"
          }`}
        >
          <GripVertical className="w-4 h-4 text-slate-300 dark:text-dark-text-muted shrink-0" />
          <span className="w-7 h-7 bg-primary-50 text-primary-600 rounded-full flex items-center justify-center text-sm font-medium shrink-0">
            {slot + 1}
          </span>
          <img
            src={item.preview}
            alt={item.file.name}
            className="w-12 h-12 object-cover rounded border border-slate-200 dark:border-dark-border"
            draggable={false}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-700 dark:text-dark-text truncate">
              {item.file.name}
            </p>
            <p className="text-xs text-slate-400 dark:text-dark-text-muted">
              {formatFileSize(item.file.size)}
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeImage(item.id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="p-1.5 rounded hover:bg-red-50 transition-colors"
            aria-label="Remove"
          >
            <X className="w-4 h-4 text-slate-400 dark:text-dark-text-muted hover:text-red-500" />
          </button>
        </div>,
      );
    }
  }

  return (
    <div className="space-y-6">
      <FileDropZone
        glowColor={categoryGlow.transform}
        iconColor={categoryAccent.transform}
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        multiple
        onFiles={handleFiles}
        label="Drop images here or click to browse"
        hint="Supports JPEG, PNG, and WebP images"
      />

      {images.length > 0 && (
        <>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-dark-text-muted mb-2">
              Page Size
            </p>
            <div className="inline-flex w-full items-center gap-0.5 rounded-xl bg-slate-100 dark:bg-dark-bg p-1 border border-slate-200 dark:border-dark-border">
              {(["a4", "letter", "fit"] as const).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setPageSize(size)}
                  className={`flex-1 rounded-lg py-1.5 px-3 text-sm transition-all duration-150 ${
                    pageSize === size
                      ? "font-semibold text-white bg-primary-600 shadow-sm"
                      : "font-medium text-slate-500 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text hover:bg-white/60 dark:hover:bg-dark-surface-alt"
                  }`}
                >
                  {size === "a4" ? "A4" : size === "letter" ? "Letter" : "Fit to Image"}
                </button>
              ))}
            </div>
          </div>

          {images.length > 1 && (
            <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
              {isDragging ? "Drop the image at its new position" : "Drag images to rearrange them"}
            </p>
          )}

          <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border overflow-hidden">
            {rows}
          </div>

          {dragged && drag.dragIndex !== null && drag.touchPos !== null && (
            <TouchDragOverlay touchPos={drag.touchPos}>
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border shadow-lg px-4 py-3 flex items-center gap-3 min-w-65 max-w-80">
                <span className="w-7 h-7 bg-primary-50 text-primary-600 rounded-full flex items-center justify-center text-sm font-medium shrink-0">
                  {drag.dragIndex + 1}
                </span>
                <img
                  src={dragged.preview}
                  alt=""
                  className="w-12 h-12 object-cover rounded border border-slate-200 dark:border-dark-border"
                  draggable={false}
                />
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text truncate">
                  {dragged.file.name}
                </p>
              </div>
            </TouchDragOverlay>
          )}

          <ActionButton
            onClick={handleConvert}
            processing={task.processing}
            label={`Create PDF from ${images.length} Image${images.length > 1 ? "s" : ""}`}
            processingLabel="Creating PDF..."
          />
        </>
      )}

      {task.error && <AlertBox message={task.error} />}
    </div>
  );
}
