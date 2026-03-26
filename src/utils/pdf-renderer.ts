/**
 * PDF page rendering utilities powered by PDF.js.
 *
 * Renders individual or all pages of a PDF to off-screen canvases and
 * returns the result as PNG data-URL strings — used for page thumbnails
 * across the Split, Rotate, Delete, Reorder, Watermark, and Signature tools.
 */

import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?worker&url";
import * as pdfjsLib from "pdfjs-dist";

// PDF.js requires a Web Worker for parsing. The `?worker&url` Vite suffix
// ensures the worker file is emitted as a standalone asset with the correct
// base path, even when deployed under a subpath like /bytepdf/.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

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
 * Render a single PDF page to a PNG data-URL thumbnail.
 *
 * An off-screen canvas is created, the page is rendered at the given scale,
 * and the canvas content is exported as a base-64 PNG data URL.
 *
 * @param data - Raw PDF bytes as an ArrayBuffer.
 * @param pageNum - 1-based page number to render.
 * @param scale - Render scale factor (default 0.5). Higher = better quality but slower.
 * @returns A `data:image/png;base64,…` string of the rendered page.
 */
export async function renderPageThumbnail(
  data: ArrayBuffer,
  pageNum: number,
  scale = 0.5,
): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to acquire 2D canvas context for thumbnail rendering");

  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  const dataUrl = canvas.toDataURL("image/png");

  // Release canvas bitmap memory before destroying the PDF document
  canvas.width = 0;
  canvas.height = 0;

  void pdf.destroy();
  return dataUrl;
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
    const page = await pdf.getPage(pageIndex + 1); // PDF.js uses 1-based page numbers
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(`Failed to acquire 2D canvas context for page ${pageIndex + 1}`);

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

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
 * Render every page of a PDF file into an array of PNG data-URL thumbnails.
 *
 * Pages are rendered sequentially to avoid excessive memory usage.
 * The PDF document is destroyed after all pages are processed.
 *
 * @param file - The PDF file whose pages should be rendered.
 * @param scale - Render scale factor (default 0.4 for lighter thumbnails).
 * @returns An ordered array of `data:image/png;base64,…` strings, one per page.
 */
export async function renderAllThumbnails(file: File, scale = 0.4): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const thumbnails: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(`Failed to acquire 2D canvas context for page ${i}`);

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    thumbnails.push(canvas.toDataURL("image/png"));

    // Release canvas bitmap memory before moving to the next page
    canvas.width = 0;
    canvas.height = 0;
  }

  void pdf.destroy();
  return thumbnails;
}
