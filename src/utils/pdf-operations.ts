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
  PDFString,
  PDFRef,
  rgb,
  degrees,
  StandardFonts,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type {
  PageRange,
  WatermarkOptions,
  Position,
  PdfMetadata,
  PageNumberOptions,
  HeaderFooterOptions,
  CropMargins,
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
  pdf.registerFontkit(fontkit);

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
  position: Position,
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);

  // Decode data URL to Uint8Array without fetch() overhead
  const commaIndex = signatureDataUrl.indexOf(",");
  if (commaIndex === -1) throw new Error("Invalid signature data URL: missing base64 payload.");
  const header = signatureDataUrl.slice(0, commaIndex);
  const base64 = signatureDataUrl.slice(commaIndex + 1);
  const binaryStr = atob(base64);
  const signatureBytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    signatureBytes[i] = binaryStr.charCodeAt(i);
  }

  const isJpeg = header.includes("image/jpeg") || header.includes("image/jpg");
  const signatureImage = isJpeg
    ? await pdf.embedJpg(signatureBytes)
    : await pdf.embedPng(signatureBytes);

  for (const idx of pageIndices) {
    const page = pdf.getPage(idx);
    page.drawImage(signatureImage, {
      x: position.x,
      y: position.y,
      width: position.width,
      height: position.height,
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
  const pdf = await PDFDocument.load(arrayBuffer);

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
  const pdf = await PDFDocument.load(arrayBuffer);

  pdf.setTitle(metadata.title);
  pdf.setAuthor(metadata.author);
  pdf.setSubject(metadata.subject);
  pdf.setKeywords(metadata.keywords.split(",").map((k) => k.trim()));
  pdf.setCreator(metadata.creator);
  pdf.setProducer(metadata.producer);

  if (metadata.creationDate) {
    pdf.setCreationDate(new Date(metadata.creationDate));
  }
  if (metadata.modificationDate) {
    pdf.setModificationDate(new Date(metadata.modificationDate));
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

  // Dynamic import to match the pattern already used in compressPdf
  const { default: workerSrc } = await import("pdfjs-dist/build/pdf.worker.min.mjs?worker&url");
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

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
