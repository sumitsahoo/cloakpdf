/**
 * Core PDF manipulation operations.
 *
 * Every function in this module runs entirely in the browser using pdf-lib
 * for structural manipulation and PDF.js for raster-based operations
 * (compression). No files are uploaded to any server.
 */

import { PDFDocument, rgb, degrees, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { PageRange, WatermarkOptions, Position } from "../types.ts";

/**
 * Merge multiple PDF files into a single document.
 *
 * Pages are appended in the order the files appear in the array.
 * Each source PDF's pages are copied (not referenced) into the merged document
 * so the originals can be safely discarded.
 *
 * @param files - Two or more PDF File objects to combine.
 * @returns The merged PDF as raw bytes.
 */
export async function mergePdfs(files: File[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await PDFDocument.load(arrayBuffer);
    const pages = await merged.copyPages(pdf, pdf.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }

  return merged.save();
}

/**
 * Extract specific page ranges from a PDF into a new document.
 *
 * Accepts an array of 1-based page ranges. Duplicate page numbers are
 * de-duplicated, and pages exceeding the source page count are silently skipped.
 *
 * @param file - The source PDF file.
 * @param ranges - Array of `{ start, end }` ranges (1-based, inclusive).
 * @returns A new PDF containing only the requested pages.
 */
export async function splitPdf(file: File, ranges: PageRange[]): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const source = await PDFDocument.load(arrayBuffer);
  const result = await PDFDocument.create();

  const pageIndices: number[] = [];
  for (const range of ranges) {
    for (let i = range.start; i <= range.end && i <= source.getPageCount(); i++) {
      if (!pageIndices.includes(i - 1)) {
        pageIndices.push(i - 1);
      }
    }
  }

  const copiedPages = await result.copyPages(source, pageIndices);
  for (const page of copiedPages) {
    result.addPage(page);
  }

  return result.save();
}

/**
 * Compress a PDF by re-rendering each page as a JPEG image.
 *
 * This is a lossy compression strategy: every page is rasterised via PDF.js
 * at a configurable scale, converted to JPEG at a given quality, and then
 * re-embedded into a brand-new PDF document. Vector content and selectable
 * text are lost, but the file size can be dramatically reduced.
 *
 * Quality presets:
 *   - `low`    → scale 1.0×, JPEG quality 85% (lightest compression)
 *   - `medium` → scale 1.5×, JPEG quality 70% (balanced)
 *   - `high`   → scale 2.0×, JPEG quality 50% (maximum compression)
 *
 * @param file - The PDF file to compress.
 * @param quality - Compression preset: "low", "medium", or "high".
 * @returns Compressed PDF bytes.
 */
export async function compressPdf(
  file: File,
  quality: "low" | "medium" | "high" = "medium",
): Promise<Uint8Array> {
  const qualitySettings = {
    low: { scale: 1.0, jpegQuality: 0.85 },
    medium: { scale: 1.5, jpegQuality: 0.7 },
    high: { scale: 2.0, jpegQuality: 0.5 },
  };

  const { scale, jpegQuality } = qualitySettings[quality];

  // Dynamic import to avoid circular dependency
  const { default: workerSrc } = await import("pdfjs-dist/build/pdf.worker.min.mjs?worker&url");
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
  const arrayBuffer = await file.arrayBuffer();
  const sourcePdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const newPdf = await PDFDocument.create();

  for (let i = 1; i <= sourcePdf.numPages; i++) {
    const page = await sourcePdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    // Convert to JPEG for lossy compression
    const jpegDataUrl = canvas.toDataURL("image/jpeg", jpegQuality);
    const response = await fetch(jpegDataUrl);
    const jpegBytes = new Uint8Array(await response.arrayBuffer());

    const image = await newPdf.embedJpg(jpegBytes);

    // Use original page dimensions (in PDF points)
    const origViewport = page.getViewport({ scale: 1.0 });
    const newPage = newPdf.addPage([origViewport.width, origViewport.height]);
    newPage.drawImage(image, {
      x: 0,
      y: 0,
      width: origViewport.width,
      height: origViewport.height,
    });
  }

  void sourcePdf.destroy();

  return newPdf.save({
    useObjectStreams: true,
  });
}

/**
 * Rotate specific pages of a PDF by the given angles.
 *
 * Rotation is additive — the angle is added to any existing page rotation.
 * Only pages present in the `rotations` map are affected; all others
 * remain unchanged.
 *
 * @param file - The PDF file to modify.
 * @param rotations - Map of 0-based page index → rotation angle in degrees (e.g. 90, -90, 180).
 * @returns PDF bytes with the updated rotations.
 */
export async function rotatePages(file: File, rotations: Map<number, number>): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);

  for (const [pageIndex, angle] of rotations) {
    const page = pdf.getPage(pageIndex);
    const currentRotation = page.getRotation().angle;
    page.setRotation(degrees(currentRotation + angle));
  }

  return pdf.save();
}

/**
 * Remove pages from a PDF by their 0-based indices.
 *
 * Creates a new document containing only those pages whose index is NOT
 * in `pageIndicesToDelete`. At least one page must remain.
 *
 * @param file - The source PDF file.
 * @param pageIndicesToDelete - Array of 0-based page indices to remove.
 * @returns A new PDF with the specified pages removed.
 */
export async function deletePages(file: File, pageIndicesToDelete: number[]): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const source = await PDFDocument.load(arrayBuffer);
  const result = await PDFDocument.create();

  const keepIndices = source.getPageIndices().filter((i) => !pageIndicesToDelete.includes(i));

  const copiedPages = await result.copyPages(source, keepIndices);
  for (const page of copiedPages) {
    result.addPage(page);
  }

  return result.save();
}

/**
 * Reorder the pages of a PDF according to a new sequence.
 *
 * `newOrder` must be an array of 0-based page indices in the desired output
 * order. Pages are copied from the source into a fresh document so the
 * original is never mutated.
 *
 * @param file - The source PDF file.
 * @param newOrder - Array of 0-based page indices defining the new page sequence.
 * @returns A new PDF with pages in the specified order.
 */
export async function reorderPages(file: File, newOrder: number[]): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const source = await PDFDocument.load(arrayBuffer);
  const result = await PDFDocument.create();

  const copiedPages = await result.copyPages(source, newOrder);
  for (const page of copiedPages) {
    result.addPage(page);
  }

  return result.save();
}

/**
 * Convert one or more image files (PNG / JPEG) into a single PDF document.
 *
 * Each image is placed on its own page. When `pageSize` is "a4" or "letter",
 * the image is scaled to fit within the standard page dimensions while
 * preserving its aspect ratio and centred on the page. When "fit" is
 * selected, the page dimensions match the image exactly.
 *
 * @param images - Array of image File objects (PNG or JPEG).
 * @param pageSize - Target page size: "a4" (595×842pt), "letter" (612×792pt), or "fit".
 * @returns PDF bytes containing all images, one per page.
 */
export async function imagesToPdf(
  images: File[],
  pageSize: "a4" | "letter" | "fit" = "a4",
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();

  const pageDimensions: Record<string, [number, number]> = {
    a4: [595.28, 841.89],
    letter: [612, 792],
  };

  for (const imageFile of images) {
    const imageBytes = await imageFile.arrayBuffer();
    const uint8 = new Uint8Array(imageBytes);

    let image;
    if (imageFile.type === "image/png") {
      image = await pdf.embedPng(uint8);
    } else {
      image = await pdf.embedJpg(uint8);
    }

    let pageWidth: number;
    let pageHeight: number;

    if (pageSize === "fit") {
      pageWidth = image.width;
      pageHeight = image.height;
    } else {
      [pageWidth, pageHeight] = pageDimensions[pageSize];
    }

    const page = pdf.addPage([pageWidth, pageHeight]);

    // Scale image to fit within page while maintaining aspect ratio
    const scale = Math.min(pageWidth / image.width, pageHeight / image.height);
    const scaledWidth = image.width * scale;
    const scaledHeight = image.height * scale;

    page.drawImage(image, {
      x: (pageWidth - scaledWidth) / 2,
      y: (pageHeight - scaledHeight) / 2,
      width: scaledWidth,
      height: scaledHeight,
    });
  }

  return pdf.save();
}

/**
 * Add a text watermark to every page of a PDF.
 *
 * The watermark is drawn at the centre of each page using Helvetica Bold.
 * Colour is specified in 0–255 RGB and converted to the 0–1 range required
 * by pdf-lib. Opacity and rotation are applied as-is.
 *
 * @param file - The PDF file to watermark.
 * @param options - Watermark settings (text, fontSize, color, opacity, rotation).
 * @returns PDF bytes with the watermark applied to all pages.
 */
export async function addWatermark(file: File, options: WatermarkOptions): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  pdf.registerFontkit(fontkit);

  const font = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(options.text, options.fontSize);
    const textHeight = font.heightAtSize(options.fontSize);

    page.drawText(options.text, {
      x: (width - textWidth) / 2,
      y: (height - textHeight) / 2,
      size: options.fontSize,
      font,
      color: rgb(options.color.r / 255, options.color.g / 255, options.color.b / 255),
      opacity: options.opacity,
      rotate: degrees(options.rotation),
    });
  }

  return pdf.save();
}

/**
 * Place a signature image onto a specific page of a PDF.
 *
 * The signature is provided as a PNG data-URL (typically drawn on an
 * HTML canvas). It is embedded at the supplied position and size.
 *
 * @param file - The PDF file to sign.
 * @param signatureDataUrl - A `data:image/png;base64,…` string of the signature.
 * @param pageIndex - 0-based index of the page to place the signature on.
 * @param position - `{ x, y, width, height }` in PDF points for placement.
 * @returns PDF bytes with the signature embedded on the specified page.
 */
export async function addSignature(
  file: File,
  signatureDataUrl: string,
  pageIndex: number,
  position: Position,
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);

  // Convert data URL to Uint8Array
  const response = await fetch(signatureDataUrl);
  const signatureBytes = new Uint8Array(await response.arrayBuffer());

  const signatureImage = await pdf.embedPng(signatureBytes);
  const page = pdf.getPage(pageIndex);

  page.drawImage(signatureImage, {
    x: position.x,
    y: position.y,
    width: position.width,
    height: position.height,
  });

  return pdf.save();
}
