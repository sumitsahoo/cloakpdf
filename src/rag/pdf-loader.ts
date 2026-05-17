/**
 * Load a PDF as a list of LangChain `Document` objects, one per page.
 *
 * - Native text-layer pages use pdf.js (fast, accurate).
 * - Scanned pages fall back to Tesseract.js (lazy-loaded).
 *
 * The split is automatic and per-page — a mixed PDF where some pages
 * have a text layer and some don't gets the best of both worlds.
 *
 * Each emitted `Document` carries the source page number on its
 * metadata so retrievers can surface "(page 4)" citations end-to-end.
 */
import { Document } from "@langchain/core/documents";
import { extractPdfText } from "../utils/ocr-text.ts";

export interface PdfLoadOptions {
  /**
   * Progress callback. `phase` is `"text-layer"` while we're walking
   * the PDF's native text, then `"ocr"` once Tesseract kicks in for
   * any scanned pages.
   */
  onProgress?: (info: { phase: "text-layer" | "ocr"; current: number; total: number }) => void;
  /** Tesseract language code(s) for OCR fallback. Defaults to `"eng"`. */
  language?: string;
}

/**
 * Metadata attached to every `Document` produced by {@link loadPdf}.
 * Kept on the `metadata` property as plain JSON so it survives the
 * LangChain Document → BM25 / VectorStore round-trips.
 */
export interface PdfDocumentMetadata extends Record<string, unknown> {
  pageNumber: number;
  ocrUsed: boolean;
}

/**
 * Extract a PDF's text page-by-page and wrap each non-empty page in a
 * LangChain `Document`. Empty / OCR-failed pages are dropped (no point
 * embedding whitespace).
 */
export async function loadPdf(file: File, options: PdfLoadOptions = {}): Promise<Document[]> {
  const pages = await extractPdfText(file, {
    onProgress: options.onProgress,
    language: options.language,
  });

  const documents: Document[] = [];
  for (const page of pages) {
    const text = page.text.trim();
    if (!text) continue;
    documents.push(
      new Document<PdfDocumentMetadata>({
        pageContent: text,
        metadata: {
          pageNumber: page.pageNumber,
          ocrUsed: page.ocrUsed,
        },
      }),
    );
  }
  return documents;
}
