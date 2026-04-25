/**
 * Images to PDF tool.
 *
 * Accepts multiple image files (JPEG, PNG, WebP) via drag-and-drop, shows
 * previews with ordering controls, and converts them into a single PDF.
 * Supports three page-size options: A4, Letter, and Fit-to-Image.
 * Object URLs for image previews are revoked on removal to avoid memory leaks.
 */

import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
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
  useEffect(() => {
    return () => {
      images.forEach((item) => URL.revokeObjectURL(item.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on unmount
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

  /** Swap an image with its neighbour to reorder the output pages. */
  const moveImage = useCallback((index: number, direction: -1 | 1) => {
    setImages((prev) => {
      const next = [...prev];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }, []);

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

          <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border divide-y divide-slate-100 dark:divide-dark-border">
            {images.map((item, index) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-7 h-7 bg-primary-50 text-primary-600 rounded-full flex items-center justify-center text-sm font-medium shrink-0">
                  {index + 1}
                </span>
                <img
                  src={item.preview}
                  alt={item.file.name}
                  className="w-12 h-12 object-cover rounded border border-slate-200 dark:border-dark-border"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 dark:text-dark-text truncate">
                    {item.file.name}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-dark-text-muted">
                    {formatFileSize(item.file.size)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => moveImage(index, -1)}
                    disabled={index === 0}
                    className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-dark-surface-alt disabled:opacity-30 transition-colors"
                    aria-label="Move up"
                  >
                    <ChevronUp className="w-4 h-4 text-slate-500 dark:text-dark-text-muted" />
                  </button>
                  <button
                    onClick={() => moveImage(index, 1)}
                    disabled={index === images.length - 1}
                    className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-dark-surface-alt disabled:opacity-30 transition-colors"
                    aria-label="Move down"
                  >
                    <ChevronDown className="w-4 h-4 text-slate-500 dark:text-dark-text-muted" />
                  </button>
                  <button
                    onClick={() => removeImage(item.id)}
                    className="p-1.5 rounded hover:bg-red-50 transition-colors"
                    aria-label="Remove"
                  >
                    <X className="w-4 h-4 text-slate-400 dark:text-dark-text-muted hover:text-red-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>

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
