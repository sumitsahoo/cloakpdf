/**
 * Images to PDF tool.
 *
 * Accepts multiple image files (JPEG, PNG, WebP) via drag-and-drop, shows
 * previews with ordering controls, and converts them into a single PDF.
 * Supports three page-size options: A4, Letter, and Fit-to-Image.
 * Object URLs for image previews are revoked on removal to avoid memory leaks.
 */

import { useState, useCallback } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { imagesToPdf } from "../utils/pdf-operations.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";

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
  const [processing, setProcessing] = useState(false);

  const handleFiles = useCallback((files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    const items: ImageItem[] = imageFiles.map((f) => ({
      file: f,
      id: crypto.randomUUID(),
      preview: URL.createObjectURL(f),
    }));
    setImages((prev) => [...prev, ...items]);
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

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
    setProcessing(true);
    try {
      const result = await imagesToPdf(
        images.map((i) => i.file),
        pageSize,
      );
      downloadPdf(result, "images.pdf");
    } finally {
      setProcessing(false);
    }
  }, [images, pageSize]);

  return (
    <div className="space-y-6">
      <FileDropZone
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        multiple
        onFiles={handleFiles}
        label="Drop images here or click to browse"
        hint="Supports JPEG, PNG, and WebP images"
      />

      {images.length > 0 && (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Page Size</label>
            <div className="flex gap-2">
              {(["a4", "letter", "fit"] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => setPageSize(size)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pageSize === size
                      ? "bg-primary-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {size === "a4" ? "A4" : size === "letter" ? "Letter" : "Fit to Image"}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {images.map((item, index) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-7 h-7 bg-primary-50 text-primary-600 rounded-full flex items-center justify-center text-sm font-medium shrink-0">
                  {index + 1}
                </span>
                <img
                  src={item.preview}
                  alt={item.file.name}
                  className="w-12 h-12 object-cover rounded border border-slate-200"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{item.file.name}</p>
                  <p className="text-xs text-slate-400">{formatFileSize(item.file.size)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => moveImage(index, -1)}
                    disabled={index === 0}
                    className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
                    aria-label="Move up"
                  >
                    <svg
                      className="w-4 h-4 text-slate-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 15l7-7 7 7"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => moveImage(index, 1)}
                    disabled={index === images.length - 1}
                    className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
                    aria-label="Move down"
                  >
                    <svg
                      className="w-4 h-4 text-slate-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => removeImage(item.id)}
                    className="p-1.5 rounded hover:bg-red-50 transition-colors"
                    aria-label="Remove"
                  >
                    <svg
                      className="w-4 h-4 text-slate-400 hover:text-red-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleConvert}
            disabled={processing}
            className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {processing
              ? "Creating PDF..."
              : `Create PDF from ${images.length} Image${images.length > 1 ? "s" : ""}`}
          </button>
        </>
      )}
    </div>
  );
}
