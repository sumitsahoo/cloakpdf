/**
 * Page-by-page text extractor with automatic OCR fallback.
 *
 * Ask PDF's RAG pipeline needs a single bag of clean text per PDF
 * regardless of whether the source is a native (text-layer) document
 * or a scan. This helper does the orchestration:
 *
 *   1. Pull the text layer for every page via pdf.js — fast, free,
 *      perfectly accurate when the PDF has one.
 *   2. For pages whose text layer came back empty (typically scanned
 *      pages), render to canvas and OCR with Tesseract.js. We only
 *      load tesseract.js lazily, so native PDFs never pay its cost.
 *
 * The progress callback reports the union of both passes so the UI
 * can show one bar that smoothly tracks the whole extraction.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";

let _pdfjsLib: typeof import("pdfjs-dist") | null = null;
async function getPdfJs(): Promise<typeof import("pdfjs-dist")> {
  if (!_pdfjsLib) {
    const { default: workerSrc } = await import("pdfjs-dist/build/pdf.worker.min.mjs?worker&url");
    _pdfjsLib = await import("pdfjs-dist");
    _pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
  }
  return _pdfjsLib;
}

export interface ExtractedPage {
  /** 1-based page index in the source PDF. */
  pageNumber: number;
  /** Recognised text. Empty string if both text-layer and OCR failed. */
  text: string;
  /** `true` when the text came from OCR rather than the native layer. */
  ocrUsed: boolean;
}

export interface ExtractOptions {
  /**
   * Progress callback. `phase` is `"text-layer"` while we're walking
   * the PDF's native text, then `"ocr"` once we hit pages that need
   * Tesseract. `current` / `total` count *pages handled in that phase*.
   */
  onProgress?: (info: { phase: "text-layer" | "ocr"; current: number; total: number }) => void;
  /**
   * Minimum number of non-whitespace characters a text-layer page must
   * have to be considered "good enough". Pages below this threshold
   * are passed to OCR. Defaults to 16 — empirically captures titles
   * inadvertently embedded by scanners while still skipping mostly-
   * blank pages.
   */
  minTextChars?: number;
  /** Tesseract language code(s). Defaults to `"eng"`. */
  language?: string;
}

/**
 * Extract clean per-page text from a PDF. Native pages use pdf.js;
 * scanned pages fall back to Tesseract OCR. Returns one entry per
 * page in document order.
 */
export async function extractPdfText(
  file: File,
  options: ExtractOptions = {},
): Promise<ExtractedPage[]> {
  const minTextChars = options.minTextChars ?? 16;
  const language = options.language ?? "eng";

  const pdfjsLib = await getPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf: PDFDocumentProxy = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;

  const results: ExtractedPage[] = [];
  const ocrQueue: number[] = [];

  try {
    // ── Phase 1: text layer ────────────────────────────────────
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      try {
        const content = await page.getTextContent();
        // pdf.js returns a union of `TextItem | TextMarkedContent`; the
        // marked-content variants don't carry a `str`, but our
        // reconstructor handles missing fields safely. Cast at the
        // boundary so the helper's signature stays narrow.
        const text = reconstructPageText(
          content.items as Array<{ str?: string; transform?: number[]; hasEOL?: boolean }>,
        ).trim();
        if (text.replace(/\s+/g, "").length >= minTextChars) {
          results.push({ pageNumber: i, text, ocrUsed: false });
        } else {
          // Mark for OCR; push a placeholder so the order is stable
          // when we patch the OCR results back in.
          results.push({ pageNumber: i, text: "", ocrUsed: false });
          ocrQueue.push(i);
        }
      } finally {
        page.cleanup();
      }
      options.onProgress?.({ phase: "text-layer", current: i, total: totalPages });
    }

    // ── Phase 2: OCR fallback ──────────────────────────────────
    if (ocrQueue.length > 0) {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker(language);
      try {
        for (let i = 0; i < ocrQueue.length; i++) {
          const pageNumber = ocrQueue[i];
          const page = await pdf.getPage(pageNumber);
          try {
            const canvas = await renderPageToCanvas(page, 3);
            const { data } = await worker.recognize(canvas);
            const idx = results.findIndex((r) => r.pageNumber === pageNumber);
            if (idx !== -1) {
              results[idx] = {
                pageNumber,
                text: (data.text ?? "").trim(),
                ocrUsed: true,
              };
            }
            // Release canvas memory immediately — these are large
            // (a 3× rendered A4 page is ~1700×2400 RGBA = ~16 MB).
            canvas.width = 0;
            canvas.height = 0;
          } finally {
            page.cleanup();
          }
          options.onProgress?.({ phase: "ocr", current: i + 1, total: ocrQueue.length });
        }
      } finally {
        await worker.terminate();
      }
    }
  } finally {
    void pdf.destroy();
  }

  return results;
}

// ── Internal helpers ──────────────────────────────────────────────

/**
 * Stitch pdf.js text items back into a reading-order string. Items
 * carry their own `transform` matrix; we sort into rows by the y
 * baseline and emit newlines between rows.
 */
function reconstructPageText(
  items: Array<{ str?: string; transform?: number[]; hasEOL?: boolean }>,
): string {
  const out: string[] = [];
  let lastY: number | null = null;
  for (const item of items) {
    const str = item.str ?? "";
    if (!str) continue;
    const y = item.transform?.[5] ?? 0;
    if (lastY !== null && Math.abs(y - lastY) > 1) {
      out.push("\n");
    } else if (out.length > 0 && !/\s$/.test(out[out.length - 1])) {
      out.push(" ");
    }
    out.push(str);
    if (item.hasEOL) out.push("\n");
    lastY = y;
  }
  return out.join("");
}

/**
 * Render a single PDF page to an off-screen canvas. Used to feed
 * Tesseract a high-res image for OCR.
 */
async function renderPageToCanvas(
  page: import("pdfjs-dist").PDFPageProxy,
  scale: number,
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Failed to acquire 2D canvas context");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas;
}

// ── Chunking ──────────────────────────────────────────────────────

export interface TextChunk {
  /** 1-based page where this chunk lives. */
  pageNumber: number;
  /** Zero-based ordinal across the whole document. */
  ordinal: number;
  /** The chunk text — what we feed the embedder and the LLM. */
  text: string;
}

/**
 * Split extracted pages into RAG-friendly chunks.
 *
 * The chunker keeps page boundaries — every chunk belongs to exactly
 * one source page so citations stay accurate. Within a page we split
 * on sentence boundaries where possible, with a character-count cap so
 * chunks fit comfortably inside the embedder's 256-token window.
 *
 * @param pages       - Per-page text from {@link extractPdfText}.
 * @param targetChars - Soft cap on chunk length. Default 700.
 * @param overlap     - Overlap between adjacent chunks (helps retrieval
 *                      when the answer straddles a chunk boundary).
 *                      Default 100.
 */
export function chunkPages(pages: ExtractedPage[], targetChars = 700, overlap = 100): TextChunk[] {
  const chunks: TextChunk[] = [];
  let ordinal = 0;
  for (const page of pages) {
    const text = page.text.trim();
    if (!text) continue;
    const pageChunks = splitWithOverlap(text, targetChars, overlap);
    for (const c of pageChunks) {
      chunks.push({ pageNumber: page.pageNumber, ordinal: ordinal++, text: c });
    }
  }
  return chunks;
}

/**
 * Split `text` into chunks of up to `target` characters, with `overlap`
 * characters carried into the next chunk. Splits prefer sentence
 * boundaries (period, question mark, exclamation) and fall back to
 * whitespace, then to a hard character cut when neither is available.
 */
function splitWithOverlap(text: string, target: number, overlap: number): string[] {
  if (text.length <= target) return [text];
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + target, text.length);
    if (end < text.length) {
      // Prefer the last sentence boundary within the window.
      const slice = text.slice(i, end);
      const sentenceMatch = /[.!?]\s+(?!.*[.!?]\s)/.exec(slice);
      if (sentenceMatch && sentenceMatch.index > target / 2) {
        end = i + sentenceMatch.index + sentenceMatch[0].length;
      } else {
        // Fall back to the last whitespace.
        const ws = text.lastIndexOf(" ", end);
        if (ws > i + target / 2) end = ws;
      }
    }
    out.push(text.slice(i, end).trim());
    if (end >= text.length) break;
    i = Math.max(end - overlap, i + 1);
  }
  return out;
}
