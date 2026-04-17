/**
 * PDF page rendering utilities powered by PDF.js.
 *
 * Renders individual or all pages of a PDF to off-screen canvases and
 * returns the result as Blob object URLs — used for page thumbnails
 * across the Split, Rotate, Delete, Reorder, Watermark, and Signature tools.
 *
 * Callers must revoke the returned URLs when they are no longer needed
 * (e.g. when the component unmounts or a new file is loaded) using
 * {@link revokeThumbnails}.
 */

import type { PDFDocumentProxy } from "pdfjs-dist";
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?worker&url";

// PDF.js requires a Web Worker for parsing. The `?worker&url` Vite suffix
// ensures the worker file is emitted as a standalone asset with the correct
// base path, even when deployed under a subpath like /cloakpdf/.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

/** Re-export the configured PDF.js library so other modules don't need to set up the worker. */
export { pdfjsLib };

/**
 * Render scale for full-panel page previews (e.g. the large image shown in
 * Stamp, Bates, Header/Footer, Page Numbers, Signature, Crop, Redact).
 *
 * Grid thumbnails get by on ~0.4 because they display at ~120 CSS px. Large
 * previews fill the preview panel (often 500–800 CSS px) and then get doubled
 * on HiDPI displays, so a 0.4 render upscales by ~4–8× and looks blurry.
 *
 * We pick `max(1.5, devicePixelRatio)` so the bitmap has enough pixels for any
 * reasonable panel width on both standard and retina screens, without paying
 * the cost of a very high scale on every page.
 */
export const PREVIEW_SCALE = Math.max(
  1.5,
  typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
);

/** Convert a canvas to a Blob object URL (PNG). ~33% smaller than data-URLs. */
function canvasToBlobUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(URL.createObjectURL(blob));
      else reject(new Error("Canvas toBlob returned null"));
    }, "image/png");
  });
}

/**
 * Revoke an array of Blob object URLs to free browser memory.
 * Safe to call with data-URLs or empty strings — they are silently skipped.
 */
export function revokeThumbnails(urls: string[]): void {
  for (const url of urls) {
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
  }
}

/**
 * Render a single PDF page (1-based) onto a canvas at the given scale.
 * Returns both the canvas and its 2D context so callers can do pixel-level
 * work (e.g. whiteness scoring) without a second getContext() call.
 * The caller is responsible for zeroing canvas dimensions to release bitmap memory.
 *
 * @param pdf - An already-loaded PDFDocumentProxy.
 * @param pageNum - 1-based page number to render.
 * @param scale - Render scale factor.
 * @returns `{ canvas, ctx }` ready for use.
 */
async function renderPage(
  pdf: PDFDocumentProxy,
  pageNum: number,
  scale: number,
): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(`Failed to acquire 2D canvas context for page ${pageNum}`);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return { canvas, ctx };
}

/**
 * Return the total number of pages in a PDF file.
 *
 * @param file - The PDF file to inspect.
 * @returns Total page count.
 */
export async function getPageCount(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const count = pdf.numPages;
  void pdf.destroy();
  return count;
}

/**
 * Render a single PDF page to a PNG Blob object URL thumbnail.
 *
 * @param data - Raw PDF bytes as an ArrayBuffer.
 * @param pageNum - 1-based page number to render.
 * @param scale - Render scale factor (default 0.5). Higher = better quality but slower.
 * @returns A `blob:…` URL of the rendered page. Caller must revoke when done.
 */
export async function renderPageThumbnail(
  data: ArrayBuffer,
  pageNum: number,
  scale = 0.5,
): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const { canvas } = await renderPage(pdf, pageNum, scale);
  const url = await canvasToBlobUrl(canvas);
  canvas.width = 0;
  canvas.height = 0;
  void pdf.destroy();
  return url;
}

/**
 * Render specific pages of a PDF (1-based page numbers) from a single document
 * load. Use this instead of calling `renderPageThumbnail` multiple times, which
 * would fail because PDF.js transfers (detaches) the ArrayBuffer to its Web
 * Worker on the first call.
 *
 * @param file - The PDF file to render from.
 * @param pageNums - 1-based page numbers to render, in any order.
 * @param scale - Render scale factor (default 0.4).
 * @returns Blob object URLs in the same order as `pageNums`. Caller must revoke when done.
 */
export async function renderSpecificThumbnails(
  file: File,
  pageNums: number[],
  scale = 0.4,
): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const results: string[] = [];

  for (const pageNum of pageNums) {
    const { canvas } = await renderPage(pdf, pageNum, scale);
    results.push(await canvasToBlobUrl(canvas));
    canvas.width = 0;
    canvas.height = 0;
  }

  void pdf.destroy();
  return results;
}

/**
 * Render selected pages of a PDF to image Blobs at a given DPI.
 *
 * Pages are rendered sequentially to avoid excessive memory usage.
 * The PDF document is destroyed after all pages are processed.
 *
 * @param file - The PDF file whose pages should be rendered.
 * @param pageIndices - 0-based indices of the pages to render.
 * @param dpi - Output resolution (72 / 150 / 300).
 * @param format - MIME type for the output image ("image/png" or "image/jpeg").
 * @param quality - JPEG quality in 0–1 range (ignored for PNG).
 * @param onProgress - Optional callback invoked after each page: (rendered, total).
 * @returns Array of `{ pageIndex, blob }` in the same order as `pageIndices`.
 */
export async function renderPagesToBlobs(
  file: File,
  pageIndices: number[],
  dpi: number,
  format: "image/png" | "image/jpeg",
  quality = 0.92,
  onProgress?: (rendered: number, total: number) => void,
): Promise<{ pageIndex: number; blob: Blob }[]> {
  const arrayBuffer = await file.arrayBuffer();
  const scale = dpi / 72;
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const results: { pageIndex: number; blob: Blob }[] = [];

  for (let i = 0; i < pageIndices.length; i++) {
    const pageIndex = pageIndices[i];
    const { canvas } = await renderPage(pdf, pageIndex + 1, scale);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error(`Failed to render page ${pageIndex + 1} to image`));
        },
        format,
        quality,
      );
    });

    canvas.width = 0;
    canvas.height = 0;

    results.push({ pageIndex, blob });
    onProgress?.(i + 1, pageIndices.length);
  }

  void pdf.destroy();
  return results;
}

/**
 * Render every page of a PDF file into an array of PNG Blob object URL thumbnails.
 *
 * Pages are rendered sequentially to avoid excessive memory usage.
 * The PDF document is destroyed after all pages are processed.
 *
 * @param file - The PDF file whose pages should be rendered.
 * @param scale - Render scale factor (default 0.4 for lighter thumbnails).
 * @returns An ordered array of `blob:…` URLs, one per page. Caller must revoke when done.
 */
export async function renderAllThumbnails(file: File, scale = 0.4): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const thumbnails: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const { canvas } = await renderPage(pdf, i, scale);
    thumbnails.push(await canvasToBlobUrl(canvas));
    canvas.width = 0;
    canvas.height = 0;
  }

  void pdf.destroy();
  return thumbnails;
}

/**
 * Render every page of a PDF and return both thumbnails and per-page whiteness scores.
 *
 * Each whiteness score is the fraction of pixels (0–1) whose R, G, and B channels
 * are all ≥ 240. A score near 1.0 indicates a near-blank (white) page.
 * Both arrays are in page order and have the same length.
 *
 * @param file - The PDF file to analyse.
 * @param scale - Render scale factor (default 0.3 — small size is enough for detection).
 * @returns `{ thumbnails, scores }` where thumbnails are Blob object URLs and scores are 0–1.
 */
export async function renderThumbnailsAndScores(
  file: File,
  scale = 0.3,
): Promise<{ thumbnails: string[]; scores: number[] }> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const thumbnails: string[] = [];
  const scores: number[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    try {
      ({ canvas, ctx } = await renderPage(pdf, i, scale));
    } catch {
      thumbnails.push("");
      scores.push(0);
      continue;
    }

    thumbnails.push(await canvasToBlobUrl(canvas));

    // Count pixels where all channels are near-white (≥ 240)
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let nearWhite = 0;
    const totalPixels = canvas.width * canvas.height;
    for (let p = 0; p < data.length; p += 4) {
      if (data[p] >= 240 && data[p + 1] >= 240 && data[p + 2] >= 240) nearWhite++;
    }
    scores.push(totalPixels > 0 ? nearWhite / totalPixels : 0);

    canvas.width = 0;
    canvas.height = 0;
  }

  void pdf.destroy();
  return { thumbnails, scores };
}
