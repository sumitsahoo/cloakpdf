/**
 * Extract Images tool.
 *
 * Scans every page of a PDF for embedded images (via PDF.js operator lists),
 * displays them in a selectable grid, and lets the user download individual
 * images or a ZIP of all selected images.
 */

import { useState, useCallback } from "react";
import { ImageDown, Loader2 } from "lucide-react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { downloadBlob, formatFileSize } from "../utils/file-helpers.ts";
import { pdfjsLib } from "../utils/pdf-renderer.ts";

/** Metadata for a single extracted image. */
interface ExtractedImage {
  /** 1-based page number where the image was found. */
  page: number;
  /** Sequential index within the page (0-based). */
  indexOnPage: number;
  /** Image width in pixels. */
  width: number;
  /** Image height in pixels. */
  height: number;
  /** Data-URL thumbnail for preview. */
  dataUrl: string;
  /** Full-resolution Blob for download. */
  blob: Blob;
}

/**
 * Extract all raster images embedded in a PDF document.
 *
 * Iterates through every page's operator list, finds image paint operations,
 * retrieves the raw image object from PDF.js, and converts it to a PNG blob
 * via an offscreen canvas.
 */
async function extractImagesFromPdf(
  pdf: PDFDocumentProxy,
  onProgress?: (done: number, total: number) => void,
): Promise<ExtractedImage[]> {
  const images: ExtractedImage[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const ops = await page.getOperatorList();

    // Track which object names we've already extracted on this page to
    // avoid duplicates when the same XObject is painted more than once.
    const seen = new Set<string>();
    let indexOnPage = 0;

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];

      // OPS.paintImageXObject and OPS.paintInlineImageXObject
      if (fn !== pdfjsLib.OPS.paintImageXObject && fn !== pdfjsLib.OPS.paintInlineImageXObject)
        continue;

      const objName = ops.argsArray[i]?.[0] as string | undefined;
      if (!objName || seen.has(objName)) continue;
      seen.add(objName);

      try {
        const imgData = await new Promise<{
          width: number;
          height: number;
          data?: Uint8ClampedArray;
          kind?: number;
          src?: string;
        }>((resolve, reject) => {
          // PDF.js stores common objects (shared across pages) separately.
          // Try page-level objects first, then fall back to the common pool.
          try {
            page.objs.get(objName, (obj: unknown) => {
              if (obj)
                resolve(
                  obj as {
                    width: number;
                    height: number;
                    data?: Uint8ClampedArray;
                    kind?: number;
                    src?: string;
                  },
                );
              else reject(new Error("null object"));
            });
          } catch {
            reject(new Error("object not found"));
          }
        });

        // Skip tiny images (likely artifacts or masks)
        if (imgData.width < 10 || imgData.height < 10) continue;

        const canvas = document.createElement("canvas");
        canvas.width = imgData.width;
        canvas.height = imgData.height;
        const ctx = canvas.getContext("2d")!;

        if (imgData.data) {
          // Raw pixel data — write directly via ImageData
          const imageData = new ImageData(
            new Uint8ClampedArray(imgData.data),
            imgData.width,
            imgData.height,
          );
          ctx.putImageData(imageData, 0, 0);
        } else if (imgData.src) {
          // JPEG image with a blob/data URL — draw via Image element
          await new Promise<void>((resolve, reject) => {
            const img = new window.Image();
            img.onload = () => {
              ctx.drawImage(img, 0, 0);
              resolve();
            };
            img.onerror = reject;
            img.src = imgData.src as string;
          });
        } else {
          canvas.width = 0;
          canvas.height = 0;
          continue;
        }

        // Convert to PNG blob
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
        );

        // Build a smaller thumbnail for the preview grid
        const thumbScale = Math.min(1, 200 / Math.max(imgData.width, imgData.height));
        const tw = Math.round(imgData.width * thumbScale);
        const th = Math.round(imgData.height * thumbScale);
        const thumbCanvas = document.createElement("canvas");
        thumbCanvas.width = tw;
        thumbCanvas.height = th;
        const tctx = thumbCanvas.getContext("2d")!;
        tctx.drawImage(canvas, 0, 0, tw, th);
        const dataUrl = thumbCanvas.toDataURL("image/png");

        // Release canvas memory
        canvas.width = 0;
        canvas.height = 0;
        thumbCanvas.width = 0;
        thumbCanvas.height = 0;

        images.push({
          page: p,
          indexOnPage,
          width: imgData.width,
          height: imgData.height,
          dataUrl,
          blob,
        });
        indexOnPage++;
      } catch {
        // Skip images that can't be decoded
      }
    }

    onProgress?.(p, pdf.numPages);
  }

  return images;
}

export default function ExtractImages() {
  const [file, setFile] = useState<File | null>(null);
  const [images, setImages] = useState<ExtractedImage[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setImages([]);
    setSelected(new Set());
    setError(null);
    setLoading(true);
    setProgress(null);

    try {
      const arrayBuffer = await pdf.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const extracted = await extractImagesFromPdf(doc, (done, total) =>
        setProgress({ done, total }),
      );
      void doc.destroy();

      if (extracted.length === 0) {
        setError("No extractable images found in this PDF.");
        setFile(null);
      } else {
        setImages(extracted);
        setSelected(new Set(extracted.map((_, i) => i)));
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to extract images. The file may be corrupted or password-protected.",
      );
      setFile(null);
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }, []);

  const toggleImage = useCallback((idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === images.length ? new Set() : new Set(images.map((_, i) => i)),
    );
  }, [images]);

  const handleDownload = useCallback(async () => {
    if (selected.size === 0) return;
    setDownloading(true);

    try {
      const baseName = file?.name.replace(/\.pdf$/i, "") ?? "extracted";
      const selectedImages = Array.from(selected)
        .sort((a, b) => a - b)
        .map((i) => images[i]);

      if (selectedImages.length === 1) {
        const img = selectedImages[0];
        downloadBlob(img.blob, `${baseName}_p${img.page}_img${img.indexOnPage + 1}.png`);
      } else {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        for (const img of selectedImages) {
          zip.file(`${baseName}_p${img.page}_img${img.indexOnPage + 1}.png`, img.blob);
        }
        const zipBlob = await zip.generateAsync({ type: "blob" });
        downloadBlob(zipBlob, `${baseName}_images.zip`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to download images. Please try again.");
    } finally {
      setDownloading(false);
    }
  }, [file, images, selected]);

  const totalSize = Array.from(selected).reduce((sum, i) => sum + images[i].blob.size, 0);

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          glowColor={categoryGlow.transform}
          iconColor={categoryAccent.transform}
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="All embedded images will be extracted for download"
        />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted break-all sm:break-normal">
              <span className="font-medium">{file.name}</span> — {formatFileSize(file.size)}
              {!loading && images.length > 0 && (
                <span className="text-violet-600 ml-2">
                  ({images.length} image{images.length !== 1 && "s"} found)
                </span>
              )}
            </p>
            <button
              onClick={() => {
                setFile(null);
                setImages([]);
                setSelected(new Set());
                setError(null);
              }}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              Change file
            </button>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-3 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
              {progress && (
                <p className="text-sm text-slate-500 dark:text-dark-text-muted">
                  Scanning page {progress.done} of {progress.total}…
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                  Select images to download
                </p>
                <button
                  onClick={toggleAll}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  {selected.size === images.length ? "Deselect all" : "Select all"}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {images.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleImage(i)}
                    aria-label={`Image ${i + 1} from page ${img.page}${selected.has(i) ? ", selected" : ""}`}
                    aria-pressed={selected.has(i)}
                    className={`relative group rounded-lg overflow-hidden border-2 transition-[border-color,box-shadow] cursor-pointer text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 ${
                      selected.has(i)
                        ? "border-violet-500 ring-2 ring-violet-200 dark:ring-violet-800"
                        : "border-slate-200 dark:border-dark-border hover:border-violet-300 dark:hover:border-violet-600"
                    }`}
                  >
                    <div className="aspect-square bg-slate-50 dark:bg-dark-surface flex items-center justify-center p-2">
                      <img
                        src={img.dataUrl}
                        alt={`Image ${i + 1} from page ${img.page}`}
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
                      <span className="text-xs text-white font-medium block">Page {img.page}</span>
                      <span className="text-xs text-white/70">
                        {img.width} x {img.height}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {selected.size > 0 && (
                <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border shadow-sm p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-600 dark:text-dark-text-muted">
                      <span className="font-medium text-slate-800 dark:text-dark-text">
                        {selected.size}
                      </span>{" "}
                      image{selected.size !== 1 && "s"} selected
                      <span className="mx-1.5 text-slate-300 dark:text-dark-border">|</span>
                      {formatFileSize(totalSize)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ImageDown className="w-4 h-4 text-violet-500" />
                      <span className="text-xs font-medium text-slate-500 dark:text-dark-text-muted">
                        PNG
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={handleDownload}
                disabled={downloading || selected.size === 0}
                className="w-full bg-violet-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {downloading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Preparing download…
                  </>
                ) : selected.size === 1 ? (
                  "Download Image"
                ) : (
                  `Download ${selected.size} Images as ZIP`
                )}
              </button>
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
