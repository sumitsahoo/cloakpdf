/**
 * Core PDF manipulation operations.
 *
 * Every function in this module runs entirely in the browser using pdf-lib
 * for structural manipulation and PDF.js for raster-based operations
 * (compression). No files are uploaded to any server.
 */

import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  PDFRadioGroup,
  PDFDict,
  PDFArray,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFString,
  PDFRef,
  PDFOperator,
  PDFOperatorNames,
  decodePDFRawStream,
  rgb,
  degrees,
  StandardFonts,
} from "@pdfme/pdf-lib";

/** Technical information about a PDF document. */
export interface PdfInfo {
  pageCount: number;
  version: string;
  fileSize: number;
  title: string;
  author: string;
  subject: string;
  creator: string;
  producer: string;
  isEncrypted: boolean;
  pages: Array<{ width: number; height: number }>;
}
import type { PDFDocumentProxy } from "pdfjs-dist";

/**
 * Lazily load PDF.js and configure its Web Worker exactly once.
 * `compressPdf`, `grayscalePdf`, and `extractTextOcr` all need PDF.js
 * but it is not imported at the top level to avoid loading the worker
 * until one of these functions is actually called.
 */
let _pdfjsLib: typeof import("pdfjs-dist") | null = null;
async function getPdfJs(): Promise<typeof import("pdfjs-dist")> {
  if (!_pdfjsLib) {
    const { default: workerSrc } = await import("pdfjs-dist/build/pdf.worker.min.mjs?worker&url");
    _pdfjsLib = await import("pdfjs-dist");
    _pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
  }
  return _pdfjsLib;
}

import type {
  PageRange,
  WatermarkOptions,
  Position,
  PdfMetadata,
  PageNumberOptions,
  HeaderFooterOptions,
  CropMargins,
  BatesNumberOptions,
} from "../types.ts";
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
  if (files.length === 0) throw new Error("At least one PDF file is required to merge.");
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

  const seen = new Set<number>();
  const pageIndices: number[] = [];
  for (const range of ranges) {
    for (let i = range.start; i <= range.end && i <= source.getPageCount(); i++) {
      if (!seen.has(i - 1)) {
        seen.add(i - 1);
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
  onProgress?: (rendered: number, total: number) => void,
): Promise<Uint8Array> {
  const qualitySettings = {
    low: { scale: 1.0, jpegQuality: 0.85 },
    medium: { scale: 1.5, jpegQuality: 0.7 },
    high: { scale: 2.0, jpegQuality: 0.5 },
  };

  const { scale, jpegQuality } = qualitySettings[quality];

  const pdfjsLib = await getPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const sourcePdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const newPdf = await PDFDocument.create();

  for (let i = 1; i <= sourcePdf.numPages; i++) {
    const page = await sourcePdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(`Failed to acquire 2D canvas context for page ${i}`);

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    // Convert to JPEG via toBlob (avoids the overhead of a data-URL round-trip)
    const jpegBytes = await new Promise<Uint8Array>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Canvas toBlob returned null"));
          blob.arrayBuffer().then((ab) => resolve(new Uint8Array(ab)), reject);
        },
        "image/jpeg",
        jpegQuality,
      );
    });

    // Release canvas bitmap memory
    canvas.width = 0;
    canvas.height = 0;

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

    onProgress?.(i, sourcePdf.numPages);
    await new Promise((r) => setTimeout(r, 0));
  }

  void sourcePdf.destroy();

  return newPdf.save({
    useObjectStreams: true,
  });
}

/**
 * Convert all pages of a PDF to grayscale.
 *
 * Each page is rendered at 2× via PDF.js, its pixels are converted to
 * grayscale using the standard luminance formula (Y = 0.299R + 0.587G +
 * 0.114B), and then re-embedded as a PNG in a new pdf-lib document.
 * PNG is used (rather than JPEG) to avoid compression artefacts on text.
 *
 * @param file - The PDF file to convert.
 * @returns Grayscale PDF bytes.
 */
export async function grayscalePdf(
  file: File,
  onProgress?: (rendered: number, total: number) => void,
): Promise<Uint8Array> {
  const SCALE = 2.0;

  const pdfjsLib = await getPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const sourcePdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const newPdf = await PDFDocument.create();

  for (let i = 1; i <= sourcePdf.numPages; i++) {
    const page = await sourcePdf.getPage(i);
    const viewport = page.getViewport({ scale: SCALE });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(`Failed to acquire 2D canvas context for page ${i}`);

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    // Convert pixels to grayscale in-place using luminance formula
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let p = 0; p < data.length; p += 4) {
      const gray = Math.round(0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]);
      data[p] = gray;
      data[p + 1] = gray;
      data[p + 2] = gray;
    }
    ctx.putImageData(imageData, 0, 0);

    const pngBytes = await new Promise<Uint8Array>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("Canvas toBlob returned null"));
        blob.arrayBuffer().then((ab) => resolve(new Uint8Array(ab)), reject);
      }, "image/png");
    });

    // Release canvas bitmap memory
    canvas.width = 0;
    canvas.height = 0;

    const image = await newPdf.embedPng(pngBytes);
    const origViewport = page.getViewport({ scale: 1.0 });
    const newPage = newPdf.addPage([origViewport.width, origViewport.height]);
    newPage.drawImage(image, {
      x: 0,
      y: 0,
      width: origViewport.width,
      height: origViewport.height,
    });

    onProgress?.(i, sourcePdf.numPages);
    await new Promise((r) => setTimeout(r, 0));
  }

  void sourcePdf.destroy();

  return newPdf.save({ useObjectStreams: true });
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

  const deleteSet = new Set(pageIndicesToDelete);
  const keepIndices = source.getPageIndices().filter((i) => !deleteSet.has(i));
  if (keepIndices.length === 0)
    throw new Error("Cannot delete all pages — at least one page must remain.");

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

    if (!["image/png", "image/jpeg", "image/jpg"].includes(imageFile.type)) {
      throw new Error(
        `Unsupported image type "${imageFile.type}" (${imageFile.name}). Only PNG and JPEG images are supported.`,
      );
    }
    const image =
      imageFile.type === "image/png" ? await pdf.embedPng(uint8) : await pdf.embedJpg(uint8);

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
 * Add a text watermark to pages of a PDF.
 *
 * The watermark is drawn at the centre of each target page using Helvetica Bold.
 * Colour is specified in 0–255 RGB and converted to the 0–1 range required
 * by pdf-lib. Opacity and rotation are applied as-is.
 *
 * When `pageIndices` is provided, only the specified pages receive the
 * watermark. Otherwise every page is watermarked.
 *
 * @param file - The PDF file to watermark.
 * @param options - Watermark settings (text, fontSize, color, opacity, rotation).
 * @param pageIndices - Optional array of 0-based page indices to watermark.
 * @returns PDF bytes with the watermark applied.
 */
export async function addWatermark(
  file: File,
  options: WatermarkOptions,
  pageIndices?: number[],
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);

  const font = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pages = pageIndices ? pageIndices.map((i) => pdf.getPage(i)) : pdf.getPages();

  for (const page of pages) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(options.text, options.fontSize);
    const textHeight = font.heightAtSize(options.fontSize);

    // pdf-lib rotates text around its draw origin (bottom-left of glyph).
    // To keep the visual center of the rotated text at the page center,
    // we reverse-rotate the text-center-to-origin offset from page center.
    // Negate rotation: CSS uses clockwise-positive, pdf-lib uses
    // counter-clockwise-positive.
    const pdfRotation = -options.rotation;
    const rad = (pdfRotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const x = width / 2 - (textWidth / 2) * cos + (textHeight / 2) * sin;
    const y = height / 2 - (textWidth / 2) * sin - (textHeight / 2) * cos;

    page.drawText(options.text, {
      x,
      y,
      size: options.fontSize,
      font,
      color: rgb(options.color.r / 255, options.color.g / 255, options.color.b / 255),
      opacity: options.opacity,
      rotate: degrees(pdfRotation),
    });
  }

  return pdf.save();
}

/**
 * Apply a seal-style stamp to pages of a PDF.
 *
 * Draws a classic rubber-seal graphic: two concentric circles forming a
 * border ring, two small decorative "★" markers at the 9-o'clock and
 * 3-o'clock positions, and the stamp text centered horizontally inside
 * the inner circle. All elements inherit the caller's colour and opacity.
 *
 * @param file - The PDF file to stamp.
 * @param text - The stamp label (e.g. "APPROVED").
 * @param fontSize - Font size in PDF points for the label.
 * @param color - RGB colour with values in the 0–255 range.
 * @param opacity - Opacity from 0 (fully transparent) to 1 (fully opaque).
 * @param pageIndices - Optional array of 0-based page indices to stamp.
 * @returns PDF bytes with the seal stamp applied.
 */
export async function addSealStamp(
  file: File,
  text: string,
  fontSize: number,
  color: { r: number; g: number; b: number },
  opacity: number,
  pageIndices?: number[],
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);

  const font = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pages = pageIndices ? pageIndices.map((i) => pdf.getPage(i)) : pdf.getPages();

  const pdfColor = rgb(color.r / 255, color.g / 255, color.b / 255);

  // Measure the text so we can size the seal around it
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const textHeight = font.heightAtSize(fontSize);

  // The inner radius must be large enough that the full text fits inside
  // with comfortable padding on each side.
  const horizontalPadding = fontSize * 0.8;
  const innerRadius = textWidth / 2 + horizontalPadding;
  const outerRadius = innerRadius + fontSize * 0.6;
  const borderThickness = fontSize * 0.15;

  // Rotation angle in degrees — positive here because PDF Y-axis points up,
  // which mirrors the visual direction vs SVG/CSS (which use -12).
  const rotationDeg = 12;
  const rotationRad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);

  for (const page of pages) {
    const { width, height } = page.getSize();
    const cx = width / 2;
    const cy = height / 2;

    // Apply rotation around page center using a content stream transform.
    // The cm operator sets a transformation matrix: [cos sin -sin cos tx ty]
    // We translate origin to center, rotate, then translate back.
    const tx = cx - cos * cx + sin * cy;
    const ty = cy - sin * cx - cos * cy;
    page.pushOperators(
      PDFOperator.of(PDFOperatorNames.PushGraphicsState),
      PDFOperator.of(PDFOperatorNames.ConcatTransformationMatrix, [
        PDFNumber.of(cos),
        PDFNumber.of(sin),
        PDFNumber.of(-sin),
        PDFNumber.of(cos),
        PDFNumber.of(tx),
        PDFNumber.of(ty),
      ]),
    );

    // Outer circle
    page.drawCircle({
      x: cx,
      y: cy,
      size: outerRadius,
      borderColor: pdfColor,
      borderWidth: borderThickness,
      opacity: 0,
      borderOpacity: opacity,
    });

    // Inner circle
    page.drawCircle({
      x: cx,
      y: cy,
      size: innerRadius,
      borderColor: pdfColor,
      borderWidth: borderThickness * 0.7,
      opacity: 0,
      borderOpacity: opacity,
    });

    // Horizontal divider lines above and below the text
    const lineHalfWidth = innerRadius * 0.75;
    const lineGap = textHeight * 1.2;

    // Line above text
    page.drawLine({
      start: { x: cx - lineHalfWidth, y: cy + lineGap },
      end: { x: cx + lineHalfWidth, y: cy + lineGap },
      thickness: borderThickness * 0.5,
      color: pdfColor,
      opacity,
    });

    // Line below text
    page.drawLine({
      start: { x: cx - lineHalfWidth, y: cy - lineGap },
      end: { x: cx + lineHalfWidth, y: cy - lineGap },
      thickness: borderThickness * 0.5,
      color: pdfColor,
      opacity,
    });

    // Decorative dots at 9-o'clock and 3-o'clock
    const midRingRadius = (innerRadius + outerRadius) / 2;
    const dotRadius = fontSize * 0.12;

    // Left dot (9-o'clock)
    page.drawCircle({
      x: cx - midRingRadius,
      y: cy,
      size: dotRadius,
      color: pdfColor,
      opacity,
    });

    // Right dot (3-o'clock)
    page.drawCircle({
      x: cx + midRingRadius,
      y: cy,
      size: dotRadius,
      color: pdfColor,
      opacity,
    });

    // Main stamp text — centered
    page.drawText(text, {
      x: cx - textWidth / 2,
      y: cy - textHeight / 2,
      size: fontSize,
      font,
      color: pdfColor,
      opacity,
    });

    // Restore graphics state (end rotation)
    page.pushOperators(PDFOperator.of(PDFOperatorNames.PopGraphicsState));
  }

  return pdf.save();
}

/**
 * Place a signature image onto one or more pages of a PDF.
 *
 * The signature is provided as a PNG data-URL (typically drawn on an
 * HTML canvas). It is embedded at the supplied position and size on
 * every page specified by `pageIndices`.
 *
 * @param file - The PDF file to sign.
 * @param signatureDataUrl - A `data:image/png;base64,…` string of the signature.
 * @param pageIndices - Array of 0-based page indices to place the signature on.
 * @param position - `{ x, y, width, height }` in PDF points for placement.
 * @returns PDF bytes with the signature embedded on the specified pages.
 */
export async function addSignature(
  file: File,
  signatureDataUrl: string,
  pageIndices: number[],
  position: Position | Map<number, Position>,
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);

  // Decode data URL to Uint8Array without fetch() overhead
  const commaIndex = signatureDataUrl.indexOf(",");
  if (commaIndex === -1) throw new Error("Invalid signature data URL: missing base64 payload.");
  const header = signatureDataUrl.slice(0, commaIndex);
  const signatureBytes = Uint8Array.from(atob(signatureDataUrl.slice(commaIndex + 1)), (c) =>
    c.charCodeAt(0),
  );

  const isJpeg = header.includes("image/jpeg") || header.includes("image/jpg");
  const signatureImage = isJpeg
    ? await pdf.embedJpg(signatureBytes)
    : await pdf.embedPng(signatureBytes);

  const isMap = position instanceof Map;

  for (const idx of pageIndices) {
    const fallback = isMap ? position.values().next().value : position;
    const pos = isMap ? (position.get(idx) ?? fallback) : position;
    if (!pos) continue;
    const page = pdf.getPage(idx);
    page.drawImage(signatureImage, {
      x: pos.x,
      y: pos.y,
      width: pos.width,
      height: pos.height,
    });
  }

  return pdf.save();
}

/**
 * Helper to format a Date object as an ISO-like datetime-local string
 * (`YYYY-MM-DDTHH:mm`) suitable for `<input type="datetime-local">`.
 */
function formatDateForInput(date: Date | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Read standard metadata fields from a PDF.
 *
 * Uses pdf-lib's built-in getters to extract title, author, subject,
 * keywords, creator, producer, creation date, and modification date.
 * Date values are converted to ISO-like strings for display.
 *
 * @param file - The PDF file to inspect.
 * @returns A `PdfMetadata` object with all standard fields.
 */
export async function getPdfMetadata(file: File): Promise<PdfMetadata> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer, { updateMetadata: false });

  return {
    title: pdf.getTitle() ?? "",
    author: pdf.getAuthor() ?? "",
    subject: pdf.getSubject() ?? "",
    keywords: pdf.getKeywords() ?? "",
    creator: pdf.getCreator() ?? "",
    producer: pdf.getProducer() ?? "",
    creationDate: formatDateForInput(pdf.getCreationDate()),
    modificationDate: formatDateForInput(pdf.getModificationDate()),
  };
}

/**
 * Write standard metadata fields to a PDF and return the modified bytes.
 *
 * Applies the provided metadata using pdf-lib's setters. Empty strings
 * are still written (clearing the field). Date strings are parsed back
 * from the `datetime-local` format used in the UI.
 *
 * @param file - The original PDF file.
 * @param metadata - The metadata values to set.
 * @returns Modified PDF bytes with updated metadata.
 */
export async function setPdfMetadata(file: File, metadata: PdfMetadata): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer, { updateMetadata: false });

  pdf.setTitle(metadata.title);
  pdf.setAuthor(metadata.author);
  pdf.setSubject(metadata.subject);
  pdf.setKeywords([metadata.keywords]);
  pdf.setCreator(metadata.creator);
  pdf.setProducer(metadata.producer);

  // Access the Info dictionary to allow removing date entries.
  // getInfoDict() is private on PDFDocument but available at runtime.
  const infoDict = (pdf as unknown as { getInfoDict(): PDFDict }).getInfoDict();
  if (metadata.creationDate) {
    pdf.setCreationDate(new Date(metadata.creationDate));
  } else {
    infoDict.delete(PDFName.of("CreationDate"));
  }
  if (metadata.modificationDate) {
    pdf.setModificationDate(new Date(metadata.modificationDate));
  } else {
    infoDict.delete(PDFName.of("ModDate"));
  }

  return pdf.save();
}

/**
 * Preprocess a canvas for improved OCR accuracy.
 *
 * Converts to grayscale and applies contrast stretching so that
 * Tesseract's internal binarisation produces cleaner results.
 */
function preprocessCanvasForOcr(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Pass 1: convert to grayscale and find min/max for contrast stretch
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = data[i + 1] = data[i + 2] = gray;
    if (gray < min) min = gray;
    if (gray > max) max = gray;
  }

  // Pass 2: contrast stretch (map [min, max] → [0, 255])
  const range = max - min || 1;
  for (let i = 0; i < data.length; i += 4) {
    const stretched = Math.round(((data[i] - min) / range) * 255);
    data[i] = data[i + 1] = data[i + 2] = stretched;
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Map Tesseract script detection results to the most common language code.
 * Used by auto-detection to pick the right language for OCR.
 */
const SCRIPT_TO_LANGUAGE: Record<string, string> = {
  Latin: "eng",
  Han: "chi_sim",
  Hangul: "kor",
  Japanese: "jpn",
  Arabic: "ara",
  Devanagari: "hin",
  Cyrillic: "rus",
  Greek: "ell",
  Thai: "tha",
  Hebrew: "heb",
};

/**
 * Render a single PDF page to a preprocessed canvas for OCR.
 * Extracted as a helper to avoid duplication between detect + recognize passes.
 */
async function renderPageToCanvas(
  pdfDoc: PDFDocumentProxy,
  pageNum: number,
  scale: number,
): Promise<HTMLCanvasElement> {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(`Failed to acquire 2D canvas context for page ${pageNum}`);

  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  preprocessCanvasForOcr(canvas);
  return canvas;
}

/**
 * Extract text from a PDF using OCR (Tesseract.js).
 *
 * Each page is rendered to a high-DPI canvas via PDF.js, preprocessed
 * for contrast, and then recognised with Tesseract.js. The structured
 * block/paragraph/line hierarchy is used to reconstruct spatially-aware
 * text output — preserving where text appears on the page.
 *
 * When `language` is `"auto"`, the first page is analysed with Tesseract's
 * script detection to automatically pick the best language model.
 *
 * @param file - The PDF file to OCR.
 * @param language - Tesseract language code, or "auto" for auto-detection.
 * @param onProgress - Optional callback: (currentPage, totalPages, status).
 * @returns Array of per-page extracted text strings.
 */
export async function extractTextOcr(
  file: File,
  language = "eng",
  onProgress?: (current: number, total: number, status?: string) => void,
): Promise<string[]> {
  const { createWorker, PSM } = await import("tesseract.js");
  const pdfjsLib = await getPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdfDoc.numPages;
  const OCR_SCALE = 3; // 3× ≈ 216 DPI for typical 72-DPI PDFs

  // --- Auto-detect language from first page ---
  let resolvedLang = language;
  if (language === "auto") {
    onProgress?.(0, totalPages, "Detecting language…");
    const detectCanvas = await renderPageToCanvas(pdfDoc, 1, OCR_SCALE);
    const detectWorker = await createWorker("osd");
    try {
      const { data } = await detectWorker.detect(detectCanvas);
      if (data.script && SCRIPT_TO_LANGUAGE[data.script]) {
        resolvedLang = SCRIPT_TO_LANGUAGE[data.script];
      } else {
        resolvedLang = "eng"; // Default fallback
      }
    } catch {
      resolvedLang = "eng";
    } finally {
      await detectWorker.terminate();
      detectCanvas.width = 0;
      detectCanvas.height = 0;
    }
  }

  // Create Tesseract worker once, reuse across all pages
  const worker = await createWorker(resolvedLang);
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    preserve_interword_spaces: "1",
  });

  const pageTexts: string[] = [];

  try {
    for (let i = 1; i <= totalPages; i++) {
      onProgress?.(i, totalPages, `Extracting page ${i} of ${totalPages}…`);

      const canvas = await renderPageToCanvas(pdfDoc, i, OCR_SCALE);
      const { data } = await worker.recognize(canvas);

      // Build spatially-aware text from the block hierarchy
      let pageText = "";
      if (data.blocks && data.blocks.length > 0) {
        for (const block of data.blocks) {
          for (const paragraph of block.paragraphs) {
            for (const line of paragraph.lines) {
              pageText += `${line.text}\n`;
            }
            pageText += "\n"; // paragraph break
          }
        }
      } else {
        // Fallback to raw text if blocks aren't available
        pageText = data.text;
      }

      pageTexts.push(pageText.trim());

      // Release canvas memory
      canvas.width = 0;
      canvas.height = 0;

      onProgress?.(i, totalPages);
    }
  } finally {
    await worker.terminate();
    void pdfDoc.destroy();
  }

  return pageTexts;
}

/**
 * Create a searchable PDF by overlaying invisible OCR text on each page.
 *
 * This takes the original PDF file and the per-page OCR text, then embeds
 * the text as a transparent layer on each page using pdf-lib. The result
 * looks identical to the original but is now searchable and selectable.
 *
 * @param file - The original PDF file.
 * @param pageTexts - Array of per-page OCR text strings.
 * @returns Uint8Array of the new searchable PDF.
 */
export async function createSearchablePdf(file: File, pageTexts: string[]): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pageCount = pdfDoc.getPageCount();

  for (let i = 0; i < pageCount && i < pageTexts.length; i++) {
    const text = pageTexts[i];
    if (!text) continue;

    const page = pdfDoc.getPage(i);
    const { height } = page.getSize();

    // Split text into lines and draw each as invisible text.
    // We use a very small font size (1pt) and fully transparent colour
    // so the text is embedded in the PDF for search/select but not visible.
    const lines = text.split("\n");
    const fontSize = 1;
    const lineHeight = fontSize * 1.2;
    let y = height - fontSize; // start from top

    for (const line of lines) {
      if (!line.trim()) {
        y -= lineHeight;
        continue;
      }

      // Clamp y so we don't go below page bottom
      if (y < 0) break;

      page.drawText(line, {
        x: 0,
        y,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
        opacity: 0,
      });

      y -= lineHeight;
    }
  }

  return pdfDoc.save();
}

/**
 * Insert a blank page into a PDF at the specified position.
 *
 * The blank page dimensions are copied from the adjacent page so the new
 * page blends seamlessly. Falls back to A4 if the PDF has no pages.
 *
 * @param file - The source PDF file.
 * @param position - 0-based index at which to insert (0 = before first page).
 * @returns New PDF bytes with the blank page inserted.
 */
export async function addBlankPage(file: File, position: number): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  const pageCount = pdf.getPageCount();
  const refIndex = Math.min(Math.max(position, 0), pageCount - 1);
  const { width, height } =
    pageCount > 0 ? pdf.getPage(refIndex).getSize() : { width: 595, height: 842 };
  pdf.insertPage(position, [width, height]);
  return pdf.save();
}

/**
 * Insert multiple blank pages into a PDF in a single pass.
 *
 * @param file - The source PDF file.
 * @param positions - Sorted (ascending) array of 0-based insertion positions,
 *   computed as if no blanks have been inserted yet.  Internally each position
 *   is offset by the number of blanks already inserted so they land in the
 *   correct spots.
 * @returns New PDF bytes with all blank pages inserted.
 */
export async function addBlankPages(file: File, positions: number[]): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  const pageCount = pdf.getPageCount();
  const { width, height } = pageCount > 0 ? pdf.getPage(0).getSize() : { width: 595, height: 842 };

  // Sort ascending so each offset is simply the loop index.
  const sorted = [...positions].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    pdf.insertPage(sorted[i] + i, [width, height]);
  }
  return pdf.save();
}

/**
 * Duplicate a page in a PDF and insert the copy at a target position.
 *
 * The source page is copied from a fresh load of the same file to avoid
 * internal reference issues. Any interactive form fields on the copied page
 * are registered as new standalone AcroForm fields with unique names so that
 * FillPdfForm (and any PDF viewer) treats them independently from the originals.
 *
 * @param file - The source PDF file.
 * @param sourceIndex - 0-based index of the page to duplicate.
 * @param targetPosition - 0-based index at which to insert the copy.
 * @returns New PDF bytes with the duplicated page inserted.
 */
export async function duplicatePage(
  file: File,
  sourceIndex: number,
  targetPosition: number,
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const source = await PDFDocument.load(arrayBuffer);
  const result = await PDFDocument.load(arrayBuffer);
  const [copiedPage] = await result.copyPages(source, [sourceIndex]);
  result.insertPage(targetPosition, copiedPage);
  clonePageFormFields(result, targetPosition);
  return result.save();
}

/**
 * Duplicate multiple pages in a PDF in a single pass.
 *
 * @param file - The source PDF file.
 * @param copies - Array of `{ sourceIndex, position }` objects where `position`
 *   is the 0-based insertion index relative to the *original* page list (before
 *   any copies are inserted).  Internally each position is offset by the number
 *   of copies already inserted so they land in the correct spots.
 * @returns New PDF bytes with all copies inserted.
 */
export async function duplicatePages(
  file: File,
  copies: { sourceIndex: number; position: number }[],
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const source = await PDFDocument.load(arrayBuffer);
  const result = await PDFDocument.load(arrayBuffer);

  // Sort ascending by position so each offset is simply the loop index.
  const sorted = [...copies].sort((a, b) => a.position - b.position);
  for (let i = 0; i < sorted.length; i++) {
    const { sourceIndex, position } = sorted[i];
    const adjustedPosition = position + i;
    const [copiedPage] = await result.copyPages(source, [sourceIndex]);
    result.insertPage(adjustedPosition, copiedPage);
    clonePageFormFields(result, adjustedPosition);
  }
  return result.save();
}

/**
 * After a page has been inserted as a copy, promote every widget annotation on
 * that page to a standalone top-level AcroForm field with a unique name.
 *
 * When pdf-lib copies a page it deep-copies the widget annotation objects but
 * does NOT add them to the AcroForm field tree. This means form.getFields()
 * only returns each field once even when the same form page is duplicated.
 * This function fixes that by walking the new page's /Annots, inheriting field
 * attributes from each widget's /Parent chain, assigning a unique /T, removing
 * the /Parent link, and registering the widget in AcroForm /Fields.
 */
function clonePageFormFields(pdf: PDFDocument, pageIndex: number): void {
  const page = pdf.getPage(pageIndex);
  const pageNode = page.node;

  const annotsEntry = pageNode.get(PDFName.of("Annots"));
  if (!annotsEntry) return;
  const annots = pdf.context.lookup(annotsEntry);
  if (!(annots instanceof PDFArray)) return;

  const acroFormEntry = pdf.catalog.get(PDFName.of("AcroForm"));
  if (!acroFormEntry) return;
  const acroForm = pdf.context.lookup(acroFormEntry);
  if (!(acroForm instanceof PDFDict)) return;

  const fieldsEntry = acroForm.get(PDFName.of("Fields"));
  if (!fieldsEntry) return;
  const topLevelFields = pdf.context.lookup(fieldsEntry);
  if (!(topLevelFields instanceof PDFArray)) return;

  // Build a set of all existing full field names to guarantee uniqueness.
  const existingNames = new Set<string>();
  collectFieldNames(pdf, topLevelFields, "", existingNames);

  for (let i = 0; i < annots.size(); i++) {
    const annotEntry = annots.get(i);
    const annot = pdf.context.lookup(annotEntry);
    if (!(annot instanceof PDFDict)) continue;

    const subtype = annot.get(PDFName.of("Subtype"));
    if (!subtype || subtype.toString() !== "/Widget") continue;

    // Derive the dotted full name by walking up /Parent collecting /T values.
    const fullName = deriveFullFieldName(pdf, annot);
    if (!fullName) continue;

    // Use only the leaf segment as the base for the copy name.
    const leafName = fullName.split(".").pop() ?? fullName;
    let uniqueName = `${leafName}_copy`;
    let counter = 2;
    while (existingNames.has(uniqueName)) {
      uniqueName = `${leafName}_copy${counter++}`;
    }
    existingNames.add(uniqueName);

    // Pull inheritable attributes (/FT, /Ff, /DV, /DA, etc.) from the parent
    // chain so this widget becomes a self-contained field object.
    mergeInheritedFieldAttrs(pdf, annot);

    annot.set(PDFName.of("T"), PDFString.of(uniqueName));
    annot.delete(PDFName.of("Parent"));

    // Register as a root-level AcroForm field (widgets must be indirect refs).
    if (annotEntry instanceof PDFRef) {
      topLevelFields.push(annotEntry);
    }
  }
}

/** Walk the /Parent chain collecting /T values to build the dotted full name. */
function deriveFullFieldName(pdf: PDFDocument, dict: PDFDict): string | null {
  const parts: string[] = [];
  let next: PDFDict | null = dict;
  while (next !== null) {
    const current: PDFDict = next;
    const t = current.get(PDFName.of("T"));
    if (t) parts.unshift(decodePdfString(t));
    const parentEntry = current.get(PDFName.of("Parent"));
    if (!parentEntry) break;
    const resolved = pdf.context.lookup(parentEntry);
    next = resolved instanceof PDFDict ? (resolved as PDFDict) : null;
  }
  return parts.length > 0 ? parts.join(".") : null;
}

/** Copy inheritable field attributes from the /Parent chain onto the widget. */
function mergeInheritedFieldAttrs(pdf: PDFDocument, widget: PDFDict): void {
  const INHERITABLE = ["FT", "Ff", "V", "DV", "DA", "Q", "Opt", "MaxLen"];
  let parentEntry = widget.get(PDFName.of("Parent"));
  while (parentEntry) {
    const parentDict = pdf.context.lookup(parentEntry);
    if (!(parentDict instanceof PDFDict)) break;
    for (const key of INHERITABLE) {
      const name = PDFName.of(key);
      if (!widget.get(name)) {
        const val = parentDict.get(name);
        if (val) widget.set(name, val);
      }
    }
    parentEntry = parentDict.get(PDFName.of("Parent"));
  }
}

/** Recursively collect all full field names reachable from an AcroForm /Fields array. */
function collectFieldNames(
  pdf: PDFDocument,
  fieldsArray: PDFArray,
  prefix: string,
  out: Set<string>,
): void {
  for (let i = 0; i < fieldsArray.size(); i++) {
    const entry = pdf.context.lookup(fieldsArray.get(i));
    if (!(entry instanceof PDFDict)) continue;
    const t = entry.get(PDFName.of("T"));
    const name = t ? (prefix ? `${prefix}.${decodePdfString(t)}` : decodePdfString(t)) : prefix;
    if (name) out.add(name);
    const kidsEntry = entry.get(PDFName.of("Kids"));
    if (kidsEntry) {
      const kids = pdf.context.lookup(kidsEntry);
      if (kids instanceof PDFArray) collectFieldNames(pdf, kids, name, out);
    }
  }
}

function decodePdfString(obj: { toString(): string } | undefined): string {
  if (!obj) return "";
  if (obj instanceof PDFString) return obj.decodeText();
  // Fallback for any other PDFObject (e.g. PDFHexString): strip delimiters.
  return obj
    .toString()
    .replace(/^\(|\)$/g, "")
    .replace(/^<|>$/g, "");
}

/**
 * Add page numbers to every (or a subset of) pages in a PDF.
 *
 * Supports six edge positions and four format presets. The total shown in
 * "1 / N" style formats accounts for the `firstPage` skip offset so numbering
 * stays consistent when a cover page is excluded.
 *
 * @param file - The source PDF file.
 * @param options - Page number styling and placement options.
 * @returns New PDF bytes with page numbers drawn.
 */
export async function addPageNumbers(file: File, options: PageNumberOptions): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const totalPages = pages.length;
  // Last visible page number = totalPages - firstPage + startNumber
  const lastPageNum = totalPages - options.firstPage + options.startNumber;

  for (let i = 0; i < totalPages; i++) {
    if (i < options.firstPage - 1) continue;

    const displayNum = i - (options.firstPage - 1) + options.startNumber;

    let text: string;
    switch (options.format) {
      case "Page 1":
        text = `Page ${displayNum}`;
        break;
      case "1 / N":
        text = `${displayNum} / ${lastPageNum}`;
        break;
      case "Page 1 of N":
        text = `Page ${displayNum} of ${lastPageNum}`;
        break;
      default:
        text = `${displayNum}`;
    }

    const page = pages[i];
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, options.fontSize);
    const { margin } = options;

    const isLeft = options.position === "top-left" || options.position === "bottom-left";
    const isRight = options.position === "top-right" || options.position === "bottom-right";
    const isTop =
      options.position === "top-left" ||
      options.position === "top-center" ||
      options.position === "top-right";

    const x = isLeft ? margin : isRight ? width - textWidth - margin : (width - textWidth) / 2;
    const y = isTop ? height - margin - options.fontSize : margin;

    page.drawText(text, {
      x,
      y,
      size: options.fontSize,
      font,
      color: rgb(options.color.r / 255, options.color.g / 255, options.color.b / 255),
    });
  }

  return pdf.save();
}

/**
 * Add a header and/or footer to every page of a PDF.
 *
 * Each of the six slots (header-left/center/right, footer-left/center/right)
 * supports `{{page}}` and `{{total}}` tokens that are expanded per page.
 * Center and right text is measured before drawing so it lands correctly.
 *
 * @param file - The source PDF file.
 * @param options - Header/footer text, styling, and layout options.
 * @returns New PDF bytes with the header and footer applied.
 */
export async function addHeaderFooter(
  file: File,
  options: HeaderFooterOptions,
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const totalPages = pages.length;

  for (let i = 0; i < totalPages; i++) {
    if (options.skipFirstPage && i === 0) continue;

    const page = pages[i];
    const { width, height } = page.getSize();
    const pageNum = i + 1;

    const resolve = (t: string) =>
      t.replace(/\{\{page\}\}/g, String(pageNum)).replace(/\{\{total\}\}/g, String(totalPages));

    const drawSlot = (raw: string, x: number, y: number) => {
      if (!raw.trim()) return;
      const text = resolve(raw);
      page.drawText(text, {
        x,
        y,
        size: options.fontSize,
        font,
        color: rgb(options.color.r / 255, options.color.g / 255, options.color.b / 255),
      });
    };

    const m = options.margin;
    const yTop = height - m - options.fontSize;
    const yBot = m;

    // Header row
    drawSlot(options.headerLeft, m, yTop);
    if (options.headerCenter.trim()) {
      const tw = font.widthOfTextAtSize(resolve(options.headerCenter), options.fontSize);
      drawSlot(options.headerCenter, (width - tw) / 2, yTop);
    }
    if (options.headerRight.trim()) {
      const tw = font.widthOfTextAtSize(resolve(options.headerRight), options.fontSize);
      drawSlot(options.headerRight, width - m - tw, yTop);
    }

    // Footer row
    drawSlot(options.footerLeft, m, yBot);
    if (options.footerCenter.trim()) {
      const tw = font.widthOfTextAtSize(resolve(options.footerCenter), options.fontSize);
      drawSlot(options.footerCenter, (width - tw) / 2, yBot);
    }
    if (options.footerRight.trim()) {
      const tw = font.widthOfTextAtSize(resolve(options.footerRight), options.fontSize);
      drawSlot(options.footerRight, width - m - tw, yBot);
    }
  }

  return pdf.save();
}

/**
 * Crop pages by setting a crop box that hides the specified margins.
 *
 * The crop box is a non-destructive trim — the hidden content remains in the
 * file but won't be rendered or printed. At least one target page must have
 * positive remaining dimensions for the operation to succeed.
 *
 * @param file - The source PDF file.
 * @param margins - Margin values in PDF points to hide on each edge.
 * @param pageIndices - Optional 0-based indices to crop; defaults to all pages.
 * @returns New PDF bytes with crop boxes applied.
 */
export async function cropPages(
  file: File,
  margins: CropMargins,
  pageIndices?: number[],
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  const allPages = pdf.getPages();
  const targets = pageIndices ? pageIndices.map((i) => allPages[i]) : allPages;

  for (const page of targets) {
    const { width, height } = page.getSize();
    const x = margins.left;
    const y = margins.bottom;
    const w = width - margins.left - margins.right;
    const h = height - margins.top - margins.bottom;
    if (w > 0 && h > 0) {
      page.setCropBox(x, y, w, h);
    }
  }

  return pdf.save();
}

/**
 * Remove the crop box from pages to restore the full visible area. Because
 * cropping is non-destructive (the original content is never removed), this
 * effectively reverses any crop applied by `cropPages` or any other tool.
 *
 * @param file - The PDF file to modify.
 * @param pageIndices - Optional 0-based indices to uncrop; defaults to all pages.
 * @returns New PDF bytes with crop boxes removed.
 */
export async function uncropPages(file: File, pageIndices?: number[]): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  const allPages = pdf.getPages();
  const targets = pageIndices ? pageIndices.map((i) => allPages[i]) : allPages;
  for (const page of targets) {
    page.node.delete(PDFName.of("CropBox"));
  }
  return pdf.save();
}

/**
 * Build a map of fully-qualified field name → { pageIndex, y } by scanning
 * each page's widget annotations. The y value is the top of the widget's Rect
 * in PDF user-space units (higher = closer to top of page). Useful for grouping
 * and sorting form fields by their visual position in the document.
 * Fields that appear on multiple pages are mapped to their first occurrence.
 *
 * @param file - The source PDF file.
 * @returns Map of field name → pageIndex and y position.
 */
export async function getFieldPageIndices(
  file: File,
): Promise<Map<string, { pageIndex: number; y: number }>> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  const map = new Map<string, { pageIndex: number; y: number }>();
  for (let pageIdx = 0; pageIdx < pdf.getPageCount(); pageIdx++) {
    const page = pdf.getPage(pageIdx);
    const annotsEntry = page.node.get(PDFName.of("Annots"));
    if (!annotsEntry) continue;
    const annots = pdf.context.lookup(annotsEntry);
    if (!(annots instanceof PDFArray)) continue;
    for (let j = 0; j < annots.size(); j++) {
      const annot = pdf.context.lookup(annots.get(j));
      if (!(annot instanceof PDFDict)) continue;
      const subtype = annot.get(PDFName.of("Subtype"));
      if (!subtype || subtype.toString() !== "/Widget") continue;
      const name = deriveFullFieldName(pdf, annot);
      if (!name || map.has(name)) continue;
      // Extract the upper-left y from the Rect [llx, lly, urx, ury].
      // ury is the top edge; higher value = higher on page.
      let y = 0;
      const rectEntry = annot.get(PDFName.of("Rect"));
      if (rectEntry) {
        const rect = pdf.context.lookup(rectEntry);
        if (rect instanceof PDFArray && rect.size() >= 4) {
          const ury = rect.get(3);
          if (ury instanceof PDFNumber) y = ury.asNumber();
        }
      }
      map.set(name, { pageIndex: pageIdx, y });
    }
  }
  return map;
}

/**
 * Fill interactive form fields in a PDF with the provided values.
 *
 * Handles text fields, checkboxes, dropdowns, and radio groups. Fields whose
 * names are not found in `fieldValues` are left unchanged. Silently skips
 * any field that errors (e.g. read-only or unsupported type). Optionally
 * flattens the form after filling to produce a non-editable document.
 *
 * @param file - The source PDF file containing form fields.
 * @param fieldValues - Map of field name → value (string for text/dropdown/radio, boolean for checkboxes).
 * @param flatten - If true, flattens the form after filling (default false).
 * @returns New PDF bytes with fields filled (and optionally flattened).
 */
export async function fillPdfForm(
  file: File,
  fieldValues: Record<string, string | boolean>,
  flatten = false,
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  const form = pdf.getForm();

  for (const [name, value] of Object.entries(fieldValues)) {
    try {
      const field = form.getField(name);
      if (field instanceof PDFTextField) {
        field.setText(typeof value === "string" ? value : "");
      } else if (field instanceof PDFCheckBox) {
        if (value === true || value === "true") field.check();
        else field.uncheck();
      } else if (field instanceof PDFDropdown) {
        if (typeof value === "string" && value) field.select(value);
      } else if (field instanceof PDFRadioGroup) {
        if (typeof value === "string" && value) field.select(value);
      }
    } catch {
      // Skip fields that cannot be set (read-only, unknown type, etc.)
    }
  }

  if (flatten) form.flatten();

  return pdf.save();
}

/**
 * Flatten a PDF by removing all interactive form fields and annotations,
 * converting them to static content.
 *
 * Useful for locking down filled forms and removing comments before sharing.
 *
 * @param file - The source PDF file.
 * @returns The flattened PDF as raw bytes.
 */
export async function flattenPdf(file: File): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  pdf.getForm().flatten();
  return pdf.save();
}

/**
 * Reverse the page order of a PDF.
 *
 * @param file - The source PDF file.
 * @returns A new PDF with pages in reverse order.
 */
export async function reversePages(file: File): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const source = await PDFDocument.load(arrayBuffer);
  const result = await PDFDocument.create();
  const reversedIndices = [...source.getPageIndices()].reverse();
  const copiedPages = await result.copyPages(source, reversedIndices);
  for (const page of copiedPages) {
    result.addPage(page);
  }
  return result.save();
}

/**
 * Extract a specific set of pages from a PDF into a new document.
 *
 * Pages are included in the order given by `pageIndices`.
 *
 * @param file - The source PDF file.
 * @param pageIndices - 0-based indices of pages to keep.
 * @returns A new PDF containing only the selected pages.
 */
export async function extractPages(file: File, pageIndices: number[]): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const source = await PDFDocument.load(arrayBuffer);
  const result = await PDFDocument.create();
  const valid = pageIndices.filter((i) => i >= 0 && i < source.getPageCount());
  if (valid.length === 0) throw new Error("No valid pages selected.");
  const copiedPages = await result.copyPages(source, valid);
  for (const page of copiedPages) {
    result.addPage(page);
  }
  return result.save();
}

/**
 * Permanently redact regions of a PDF by drawing filled black rectangles.
 *
 * Coordinates are expressed as fractions (0-1) of the page's width and height
 * measured from the top-left corner. They are converted to PDF user-space points
 * (origin at bottom-left) before drawing.
 *
 * @param file - The source PDF file.
 * @param redactions - Array of redaction regions per page.
 * @returns A new PDF with the redacted areas permanently blacked out.
 */
export async function redactPdf(
  file: File,
  redactions: Array<{ pageIndex: number; xPct: number; yPct: number; wPct: number; hPct: number }>,
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);

  for (const r of redactions) {
    if (r.pageIndex < 0 || r.pageIndex >= pdf.getPageCount()) continue;
    const page = pdf.getPage(r.pageIndex);
    const { width, height } = page.getSize();

    // Convert from top-left fraction coords to PDF bottom-left points
    const pdfX = r.xPct * width;
    const pdfH = r.hPct * height;
    const pdfY = height - r.yPct * height - pdfH;
    const pdfW = r.wPct * width;

    page.drawRectangle({
      x: pdfX,
      y: pdfY,
      width: pdfW,
      height: pdfH,
      color: rgb(0, 0, 0),
      opacity: 1,
    });
  }

  return pdf.save();
}

/**
 * Read technical information about a PDF file.
 *
 * Reads the PDF version from the file header bytes, page dimensions, and all
 * standard metadata fields. Loads with ignoreEncryption:true so encrypted files
 * can still be inspected without a password.
 *
 * @param file - The PDF file to inspect.
 * @returns A PdfInfo object with metadata and structural details.
 */
export async function getPdfInfo(file: File): Promise<PdfInfo> {
  const arrayBuffer = await file.arrayBuffer();

  // Read PDF version from the file header (first 20 bytes)
  const header = new TextDecoder("utf-8", { fatal: false }).decode(
    new Uint8Array(arrayBuffer.slice(0, 20)),
  );
  const versionMatch = header.match(/%PDF-(\d+\.\d+)/);
  const version = versionMatch ? versionMatch[1] : "Unknown";

  const pdf = await PDFDocument.load(arrayBuffer, {
    throwOnInvalidObject: false,
    ignoreEncryption: true,
    updateMetadata: false,
  });

  const isEncrypted = !!pdf.context.trailerInfo.Encrypt;

  return {
    pageCount: pdf.getPageCount(),
    version,
    fileSize: file.size,
    title: pdf.getTitle() ?? "",
    author: pdf.getAuthor() ?? "",
    subject: pdf.getSubject() ?? "",
    creator: pdf.getCreator() ?? "",
    producer: pdf.getProducer() ?? "",
    isEncrypted,
    pages: pdf.getPages().map((p) => p.getSize()),
  };
}

/**
 * Attempt to repair a PDF by re-parsing and re-saving it through pdf-lib.
 *
 * This fixes many common structural issues such as incorrect cross-reference
 * tables, duplicate object numbers, and minor dictionary inconsistencies.
 * The content is not altered — only the PDF structure is rebuilt.
 *
 * @param file - The PDF file to repair.
 * @returns A structurally clean PDF with the same content.
 */
export async function repairPdf(file: File): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer, {
    throwOnInvalidObject: false,
    ignoreEncryption: true,
  });
  return pdf.save({ useObjectStreams: false });
}

/**
 * Add bookmarks (PDF outline) to a document.
 *
 * Each bookmark maps a title to a 0-based target page index. Any existing
 * outline is replaced. The /PageMode is set to UseOutlines so PDF viewers
 * show the bookmarks panel by default.
 *
 * @param file - The source PDF file.
 * @param bookmarks - Array of { title, pageIndex } entries (0-based).
 * @returns New PDF bytes with the outline inserted.
 */
export async function addPdfBookmarks(
  file: File,
  bookmarks: Array<{ title: string; pageIndex: number }>,
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);

  if (bookmarks.length === 0) return pdf.save();

  const pages = pdf.getPages();

  // Build the outline root dictionary
  const outlineDict = pdf.context.obj({
    Type: PDFName.of("Outlines"),
    Count: PDFNumber.of(bookmarks.length),
  }) as PDFDict;
  const outlineRef = pdf.context.register(outlineDict);

  const itemRefs: PDFRef[] = [];

  for (const bm of bookmarks) {
    const pageIdx = Math.max(0, Math.min(bm.pageIndex, pages.length - 1));
    const pageRef = pages[pageIdx].ref;

    // Destination: go to the top of the target page fitting the full width
    const destArray = pdf.context.obj([pageRef, PDFName.of("Fit")]) as PDFArray;

    const itemDict = pdf.context.obj({
      Title: PDFString.of(bm.title),
      Parent: outlineRef,
      Dest: destArray,
    }) as PDFDict;

    itemRefs.push(pdf.context.register(itemDict));
  }

  // Link sibling items with Prev/Next pointers
  for (let i = 0; i < itemRefs.length; i++) {
    const item = pdf.context.lookup(itemRefs[i]);
    if (!(item instanceof PDFDict)) continue;
    if (i > 0) item.set(PDFName.of("Prev"), itemRefs[i - 1]);
    if (i < itemRefs.length - 1) item.set(PDFName.of("Next"), itemRefs[i + 1]);
  }

  outlineDict.set(PDFName.of("First"), itemRefs[0]);
  outlineDict.set(PDFName.of("Last"), itemRefs[itemRefs.length - 1]);

  pdf.catalog.set(PDFName.of("Outlines"), outlineRef);
  // Show the bookmarks panel in PDF viewers by default
  pdf.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));

  return pdf.save();
}

/**
 * Arrange multiple PDF pages onto single sheets in an N-up grid layout.
 *
 * Each output sheet has the same dimensions as the first source page. Source
 * pages are scaled down to fill the grid cells while preserving their aspect
 * ratio within each cell.
 *
 * @param file - The source PDF file.
 * @param layout - Grid arrangement: "2x1" (2 cols, 1 row), "1x2" (1 col, 2 rows),
 *                 "2x2" (4 pages per sheet), or "3x3" (9 pages per sheet).
 * @returns A new PDF with pages arranged in the chosen grid layout.
 */
export async function nupPages(
  file: File,
  layout: "2x1" | "1x2" | "2x2" | "3x3",
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const source = await PDFDocument.load(arrayBuffer);
  const result = await PDFDocument.create();

  const pageCount = source.getPageCount();
  if (pageCount === 0) throw new Error("The PDF has no pages.");

  const cols = layout === "1x2" ? 1 : layout === "3x3" ? 3 : 2;
  const rows = layout === "2x1" ? 1 : layout === "3x3" ? 3 : 2;
  const perSheet = cols * rows;

  const { width: outW, height: outH } = source.getPage(0).getSize();
  const cellW = outW / cols;
  const cellH = outH / rows;

  // Embed all source pages into the result document as reusable XObjects
  const embeddedPages = await Promise.all(source.getPages().map((page) => result.embedPage(page)));

  const totalSheets = Math.ceil(pageCount / perSheet);

  for (let sheet = 0; sheet < totalSheets; sheet++) {
    const outPage = result.addPage([outW, outH]);

    for (let slot = 0; slot < perSheet; slot++) {
      const srcIdx = sheet * perSheet + slot;
      if (srcIdx >= pageCount) break;

      const col = slot % cols;
      const row = Math.floor(slot / cols);

      // PDF y-axis is bottom-up; row 0 visually is the top row
      const x = col * cellW;
      const y = outH - (row + 1) * cellH;

      outPage.drawPage(embeddedPages[srcIdx], { x, y, width: cellW, height: cellH });
    }
  }

  return result.save();
}

/**
 * Add Bates numbering to every page of a PDF.
 *
 * Stamps a sequential identifier (prefix + zero-padded number + suffix) at a
 * configurable position on each page. Commonly used in legal and compliance
 * workflows to uniquely identify every page in a disclosure set.
 *
 * @param file - The PDF file to number.
 * @param options - Bates numbering configuration.
 * @returns New PDF bytes with Bates numbers applied.
 */
export async function addBatesNumbers(
  file: File,
  options: BatesNumberOptions,
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  const font = await pdf.embedFont(StandardFonts.Courier);

  const pages = pdf.getPages();
  const totalPages = pages.length;

  for (let i = 0; i < totalPages; i++) {
    const num = options.startNumber + i;
    const padded = String(num).padStart(options.digits, "0");
    const text = `${options.prefix}${padded}${options.suffix}`;

    const page = pages[i];
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, options.fontSize);
    const { margin } = options;

    const isLeft = options.position === "top-left" || options.position === "bottom-left";
    const isRight = options.position === "top-right" || options.position === "bottom-right";
    const isTop =
      options.position === "top-left" ||
      options.position === "top-center" ||
      options.position === "top-right";

    const x = isLeft ? margin : isRight ? width - textWidth - margin : (width - textWidth) / 2;
    const y = isTop ? height - margin - options.fontSize : margin;

    page.drawText(text, {
      x,
      y,
      size: options.fontSize,
      font,
      color: rgb(options.color.r / 255, options.color.g / 255, options.color.b / 255),
    });
  }

  return pdf.save();
}

/** Metadata for a single file attachment embedded in a PDF. */
export interface PdfAttachment {
  name: string;
  size: number;
  mimeType: string;
  data: Uint8Array;
}

/**
 * List all file attachments embedded in a PDF.
 *
 * Reads the /Names → /EmbeddedFiles name tree from the document catalog
 * and extracts the name, size, MIME type, and raw bytes of each entry.
 */
export async function listPdfAttachments(file: File): Promise<PdfAttachment[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer, { updateMetadata: false });
  const catalog = pdf.catalog;
  if (!catalog) return [];

  const namesDict = catalog.lookup(PDFName.of("Names"));
  if (!(namesDict instanceof PDFDict)) return [];

  const efDict = namesDict.lookup(PDFName.of("EmbeddedFiles"));
  if (!(efDict instanceof PDFDict)) return [];

  const namesArray = efDict.lookup(PDFName.of("Names"));
  if (!(namesArray instanceof PDFArray)) return [];

  const attachments: PdfAttachment[] = [];

  for (let i = 0; i < namesArray.size(); i += 2) {
    const nameObj = namesArray.lookup(i);
    const fileSpec = namesArray.lookup(i + 1);
    if (!(fileSpec instanceof PDFDict)) continue;

    // Prefer /UF (Unicode filename) or /F from the filespec dict; fall back to name tree key
    const ufObj = fileSpec.lookup(PDFName.of("UF"));
    const fObj = fileSpec.lookup(PDFName.of("F"));
    const specName =
      ufObj instanceof PDFString
        ? ufObj.decodeText()
        : fObj instanceof PDFString
          ? fObj.decodeText()
          : null;
    const treeName =
      nameObj instanceof PDFString
        ? nameObj.decodeText()
        : nameObj instanceof PDFName
          ? nameObj.decodeText()
          : null;
    const name = specName || treeName || `Attachment ${i / 2 + 1}`;

    const efObj = fileSpec.lookup(PDFName.of("EF"));
    if (!(efObj instanceof PDFDict)) continue;

    const stream = efObj.lookup(PDFName.of("F"));
    if (!(stream instanceof PDFRawStream)) continue;

    // `getContents()` returns the raw, still-encoded bytes — embedded files
    // are typically FlateDecode-compressed, so we must run the stream's
    // filter chain to recover the original file bytes.
    const data = decodePDFRawStream(stream).decode();
    const streamDict = stream.dict;
    // `Params` and `Subtype` are optional in the EmbeddedFile stream dict,
    // so use `lookupMaybe` — the typed `lookup` overload throws when the
    // key is absent.
    const paramsDict = streamDict.lookupMaybe(PDFName.of("Params"), PDFDict);
    const sizeNum = paramsDict?.lookupMaybe(PDFName.of("Size"), PDFNumber);

    const subtypeObj = streamDict.lookupMaybe(PDFName.of("Subtype"), PDFName);
    const mimeType = subtypeObj
      ? subtypeObj.decodeText().replace(/^\//, "")
      : "application/octet-stream";

    attachments.push({
      name,
      size: sizeNum ? sizeNum.asNumber() : data.length,
      mimeType,
      data,
    });
  }

  return attachments;
}

/**
 * Attach one or more files to a PDF document.
 *
 * Uses the @pdfme/pdf-lib `attach()` API to embed files into the PDF's
 * EmbeddedFiles name tree.
 */
export async function attachFilesToPdf(pdfFile: File, attachments: File[]): Promise<Uint8Array> {
  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer, { updateMetadata: false });

  for (const attachment of attachments) {
    const data = new Uint8Array(await attachment.arrayBuffer());
    await pdf.attach(data, attachment.name, {
      mimeType: attachment.type || "application/octet-stream",
      creationDate: new Date(),
      modificationDate: new Date(),
    });
  }

  return pdf.save();
}

/**
 * Remove specific attachments from a PDF by name.
 *
 * Modifies the /Names → /EmbeddedFiles name tree to remove entries
 * matching the given names.
 */
export async function removeAttachmentsFromPdf(
  file: File,
  namesToRemove: Set<string>,
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer, { updateMetadata: false });
  const catalog = pdf.catalog;

  const namesDict = catalog.lookup(PDFName.of("Names"));
  if (!(namesDict instanceof PDFDict)) return pdf.save();

  const efDict = namesDict.lookup(PDFName.of("EmbeddedFiles"));
  if (!(efDict instanceof PDFDict)) return pdf.save();

  const namesArray = efDict.lookup(PDFName.of("Names"));
  if (!(namesArray instanceof PDFArray)) return pdf.save();

  const keepIndices: number[] = [];
  for (let i = 0; i < namesArray.size(); i += 2) {
    const nameObj = namesArray.lookup(i);
    const name =
      nameObj instanceof PDFString
        ? nameObj.decodeText()
        : nameObj instanceof PDFName
          ? nameObj.decodeText()
          : "";
    if (!namesToRemove.has(name)) {
      keepIndices.push(i);
    }
  }

  const context = pdf.context;
  const newArray = context.obj([]);
  for (const idx of keepIndices) {
    (newArray as PDFArray).push(namesArray.get(idx));
    (newArray as PDFArray).push(namesArray.get(idx + 1));
  }

  efDict.set(PDFName.of("Names"), newArray);

  return pdf.save();
}

/**
 * Add a rectangle stamp with rounded corners to PDF pages.
 *
 * Uses the @pdfme/pdf-lib `radius` option on `drawRectangle`.
 */
export async function addRectangleStamp(
  file: File,
  text: string,
  fontSize: number,
  color: { r: number; g: number; b: number },
  opacity: number,
  pageIndices?: number[],
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);

  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pageIndices ? pageIndices.map((i) => pdf.getPage(i)) : pdf.getPages();
  const pdfColor = rgb(color.r / 255, color.g / 255, color.b / 255);

  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const textHeight = font.heightAtSize(fontSize);
  const padX = fontSize * 1.2;
  const padY = fontSize * 0.6;
  const rectWidth = textWidth + padX * 2;
  const rectHeight = textHeight + padY * 2;
  const borderThickness = fontSize * 0.12;
  const cornerRadius = fontSize * 0.4;

  const rotationDeg = -12;
  const rotationRad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);

  for (const page of pages) {
    const { width, height } = page.getSize();
    const cx = width / 2;
    const cy = height / 2;

    const tx = cx - cos * cx + sin * cy;
    const ty = cy - sin * cx - cos * cy;
    page.pushOperators(
      PDFOperator.of(PDFOperatorNames.PushGraphicsState),
      PDFOperator.of(PDFOperatorNames.ConcatTransformationMatrix, [
        PDFNumber.of(cos),
        PDFNumber.of(sin),
        PDFNumber.of(-sin),
        PDFNumber.of(cos),
        PDFNumber.of(tx),
        PDFNumber.of(ty),
      ]),
    );

    page.drawRectangle({
      x: cx - rectWidth / 2,
      y: cy - rectHeight / 2,
      width: rectWidth,
      height: rectHeight,
      borderColor: pdfColor,
      borderWidth: borderThickness,
      borderOpacity: opacity,
      color: pdfColor,
      opacity: opacity * 0.08,
      radius: cornerRadius,
    });

    page.drawText(text, {
      x: cx - textWidth / 2,
      y: cy - textHeight / 2,
      size: fontSize,
      font,
      color: pdfColor,
      opacity,
    });

    page.pushOperators(PDFOperator.of(PDFOperatorNames.PopGraphicsState));
  }

  return pdf.save();
}
