/**
 * Extract Images tool.
 *
 * Scans every page of a PDF for embedded images (via PDF.js operator lists),
 * displays them in a selectable grid, and lets the user download individual
 * images or a ZIP of all selected images.
 */

import { CheckSquare, ImageDown, Loader2, X } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useMemo, useState } from "react";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { usePdfFile } from "../hooks/usePdfFile.ts";
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

/** Shape returned by PDF.js for resolved image objects. */
interface PdfjsImageData {
  width: number;
  height: number;
  data?: Uint8ClampedArray;
  kind?: number;
  src?: string;
  bitmap?: ImageBitmap;
}

/** Fetch a named image object, routing to commonObjs for global ("g_"-prefixed) IDs. */
function fetchNamedImage(
  page: Awaited<ReturnType<PDFDocumentProxy["getPage"]>>,
  objName: string,
): Promise<PdfjsImageData> {
  return new Promise<PdfjsImageData>((resolve, reject) => {
    try {
      const store = objName.startsWith("g_") ? page.commonObjs : page.objs;
      store.get(objName, (obj: unknown) => {
        if (obj) resolve(obj as PdfjsImageData);
        else reject(new Error("null object"));
      });
    } catch {
      reject(new Error("object not found"));
    }
  });
}

/** Paint image data onto a canvas, handling ImageBitmap, raw pixels (RGBA/RGB), and src URLs. */
async function paintImageToCanvas(
  imgData: PdfjsImageData,
  ctx: CanvasRenderingContext2D,
): Promise<boolean> {
  if (imgData.bitmap) {
    ctx.drawImage(imgData.bitmap, 0, 0);
    return true;
  }

  if (imgData.data) {
    const expectedRgba = imgData.width * imgData.height * 4;
    if (imgData.data.length === expectedRgba) {
      ctx.putImageData(
        new ImageData(new Uint8ClampedArray(imgData.data), imgData.width, imgData.height),
        0,
        0,
      );
      return true;
    }
    // RGB (3 bytes per pixel) — expand to RGBA
    const expectedRgb = imgData.width * imgData.height * 3;
    if (imgData.data.length === expectedRgb) {
      const rgba = new Uint8ClampedArray(expectedRgba);
      const src = imgData.data;
      for (let j = 0, k = 0; j < src.length; j += 3, k += 4) {
        rgba[k] = src[j];
        rgba[k + 1] = src[j + 1];
        rgba[k + 2] = src[j + 2];
        rgba[k + 3] = 255;
      }
      ctx.putImageData(new ImageData(rgba, imgData.width, imgData.height), 0, 0);
      return true;
    }
    return false;
  }

  if (imgData.src) {
    await new Promise<void>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        resolve();
      };
      img.onerror = reject;
      img.src = imgData.src as string;
    });
    return true;
  }

  return false;
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

  // Reuse a single pair of canvases across all images to avoid
  // creating/destroying DOM elements per image.
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const thumbCanvas = document.createElement("canvas");
  const tctx = thumbCanvas.getContext("2d")!;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const ops = await page.getOperatorList();

    // Track which named objects we've already extracted on this page to
    // avoid duplicates when the same XObject is painted more than once.
    const seen = new Set<string>();
    let indexOnPage = 0;

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];

      let imgData: PdfjsImageData | null = null;

      if (fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintImageXObjectRepeat) {
        // Named image reference — look up in the correct object store.
        const objName = ops.argsArray[i]?.[0] as string | undefined;
        if (!objName || typeof objName !== "string" || seen.has(objName)) continue;
        seen.add(objName);
        try {
          imgData = await fetchNamedImage(page, objName);
        } catch {
          continue;
        }
      } else if (fn === pdfjsLib.OPS.paintInlineImageXObject) {
        // Inline image — the image data is embedded directly in the args.
        const arg = ops.argsArray[i]?.[0];
        if (!arg || typeof arg !== "object") continue;
        imgData = arg as PdfjsImageData;
      } else {
        continue;
      }

      // Skip tiny images (likely artifacts or masks)
      if (!imgData || imgData.width < 10 || imgData.height < 10) continue;

      try {
        canvas.width = imgData.width;
        canvas.height = imgData.height;

        const painted = await paintImageToCanvas(imgData, ctx);
        if (!painted) continue;

        // Convert to PNG blob
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
        );

        // Build a smaller thumbnail for the preview grid
        const thumbScale = Math.min(1, 200 / Math.max(imgData.width, imgData.height));
        const tw = Math.round(imgData.width * thumbScale);
        const th = Math.round(imgData.height * thumbScale);
        thumbCanvas.width = tw;
        thumbCanvas.height = th;
        tctx.drawImage(canvas, 0, 0, tw, th);
        const dataUrl = thumbCanvas.toDataURL("image/png");

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

    page.cleanup();
    onProgress?.(p, pdf.numPages);
  }

  // Release canvas memory
  canvas.width = 0;
  canvas.height = 0;
  thumbCanvas.width = 0;
  thumbCanvas.height = 0;

  return images;
}

export default function ExtractImages() {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const pdf = usePdfFile<ExtractedImage[]>({
    load: async (file) => {
      setProgress(null);
      const arrayBuffer = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      try {
        const extracted = await extractImagesFromPdf(doc, (done, total) =>
          setProgress({ done, total }),
        );
        if (extracted.length === 0) {
          // Bubbling up via thrown Error lets usePdfFile surface the message
          // and reset the file in one step — matching the prior behaviour.
          throw new Error("No extractable images found in this PDF.");
        }
        return extracted;
      } finally {
        void doc.destroy();
        setProgress(null);
      }
    },
    onReset: () => {
      setSelected(new Set());
      setProgress(null);
    },
    loadErrorMessage: "Failed to extract images. The file may be corrupted or password-protected.",
  });
  const downloadTask = useAsyncProcess();

  const file = pdf.file;
  const images = pdf.data ?? [];
  const loading = pdf.loading;
  const downloading = downloadTask.processing;
  const error = pdf.loadError ?? downloadTask.error;

  const toggleImage = useCallback((idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(images.map((_, i) => i)));
  }, [images]);

  const clearAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  const handleDownload = useCallback(async () => {
    if (selected.size === 0) return;
    await downloadTask.run(async () => {
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
    }, "Failed to download images. Please try again.");
  }, [file, images, selected, downloadTask]);

  const totalSize = useMemo(
    () => Array.from(selected).reduce((sum, i) => sum + images[i].blob.size, 0),
    [selected, images],
  );

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          glowColor={categoryGlow.transform}
          iconColor={categoryAccent.transform}
          accept=".pdf,application/pdf"
          onFiles={pdf.onFiles}
          label="Drop a PDF file here"
          hint="All embedded images will be extracted for download"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={file.name}
            details={formatFileSize(file.size)}
            onChangeFile={pdf.reset}
            extra={
              !loading && images.length > 0 ? (
                <span className="text-violet-600 ml-2">
                  ({images.length} image{images.length !== 1 && "s"} found)
                </span>
              ) : undefined
            }
          />

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <LoadingSpinner color="border-violet-200 border-t-violet-600" className="" />
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
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 transition-colors"
                  >
                    <CheckSquare className="w-4 h-4" />
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-dark-text-muted dark:hover:text-dark-text transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Clear
                  </button>
                </div>
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

      {error && <AlertBox message={error} />}
    </div>
  );
}
