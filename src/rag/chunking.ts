/**
 * Page-aware sentence packing.
 *
 * **Why we replaced LangChain's `RecursiveCharacterTextSplitter`.**
 * The recursive splitter respects paragraph → sentence → word
 * boundaries in *preference order*, but when a paragraph exceeds the
 * char budget it splits at the next-best boundary — including
 * mid-sentence on prose-heavy pages. That hurts retrieval: a chunk
 * that ends mid-clause embeds less coherently than one that ends on
 * a sentence break, and the BM25 token bag picks up half a noun
 * phrase. The recursive splitter also doesn't pack adjacent sentences
 * up to the target size — it tends to over-split on short
 * paragraphs, producing 50-character chunks that lose context.
 *
 * **Strategy here.**
 *
 *   1. Per page, split into sentences using a regex that handles the
 *      common English shapes (terminator + whitespace + uppercase) and
 *      common abbreviations (`Mr.`, `Dr.`, `U.S.`, `etc.`, decimals).
 *   2. Greedily pack sentences into chunks targeting `chunkSize`
 *      characters. If a single sentence exceeds the target, emit it
 *      alone rather than splitting mid-sentence — coherence > size.
 *   3. Carry a tail of `chunkOverlap` characters into the next chunk
 *      so retrievers that match on terminal phrases still find them.
 *      The overlap is sentence-rounded (not char-cut) for the same
 *      coherence reason.
 *
 * **What's preserved from the previous implementation.**
 *
 *   - Per-page boundary: a chunk always belongs to one and only one
 *     source page. Citations stay crisp. (LangChain's splitter would
 *     merge across documents otherwise.)
 *   - Stable `chunkId` + `ordinal` metadata so the vector store, BM25
 *     retriever, and persistence layer can identify the same chunk
 *     across passes without resorting to content hashing.
 *
 * **Cache invalidation.** Chunking changes invalidate the persisted
 * vector index (chunk text changes → embeddings would be misaligned).
 * `src/rag/persistence.ts` bumps `DB_VERSION` whenever chunking or
 * the embedder changes — keep them in lockstep.
 */
import { Document } from "@langchain/core/documents";
import type { PdfDocumentMetadata } from "./pdf-loader.ts";

export interface ChunkMetadata extends PdfDocumentMetadata {
  /** Zero-based ordinal across the whole document. */
  ordinal: number;
  /** Stable id (page + ordinal) used as the cache + dedup key. */
  chunkId: string;
}

export interface ChunkOptions {
  /** Soft cap on chunk size in characters. Default 700. */
  chunkSize?: number;
  /**
   * Number of characters of trailing context to carry into the next
   * chunk. Rounded to the nearest sentence boundary so we never emit
   * half a clause. Default 100.
   */
  chunkOverlap?: number;
}

/**
 * Common abbreviations that look like sentence endings under a naive
 * `[.?!]\s+[A-Z]` regex. Listed lower-case + with the trailing period
 * so the check is a simple substring on the chunk-so-far. Not
 * exhaustive — the splitter degrades gracefully if a rare
 * abbreviation slips through (worst case: one extra split).
 */
const ABBREVIATIONS = new Set([
  "mr.",
  "mrs.",
  "ms.",
  "dr.",
  "st.",
  "jr.",
  "sr.",
  "vs.",
  "etc.",
  "e.g.",
  "i.e.",
  "no.",
  "inc.",
  "ltd.",
  "co.",
  "corp.",
  "u.s.",
  "u.k.",
  "u.n.",
  "ph.d.",
  "m.d.",
  "b.a.",
  "m.a.",
  "vol.",
  "fig.",
  "ave.",
  "blvd.",
  "rd.",
]);

/**
 * Split a block of text into sentences. The regex matches a sentence
 * terminator (`.`, `?`, `!`) followed by whitespace + a capital letter
 * (the canonical English sentence-break shape). A bare newline also
 * counts — résumés and bullet lists often have items separated by
 * newlines without terminal punctuation.
 *
 * Abbreviations like `Dr.` or `e.g.` are kept whole by checking the
 * preceding word against {@link ABBREVIATIONS}. Decimals like `3.14`
 * are kept whole because the regex requires whitespace + uppercase
 * after the period.
 */
function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const sentences: string[] = [];
  let start = 0;
  // Match `[.?!]` followed by whitespace + capital, OR a bare hard
  // newline followed by capital (for bullet-style layouts).
  const re = /(?<=[.?!])\s+(?=[A-Z])|(?<=\n)\s*(?=[A-Z\d])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    const idx = m.index;
    const before = cleaned.slice(start, idx).trim();
    if (!before) {
      start = idx + m[0].length;
      continue;
    }
    // Abbreviation check: the token right before the terminator.
    const lastSpace = before.lastIndexOf(" ");
    const lastToken = (lastSpace >= 0 ? before.slice(lastSpace + 1) : before).toLowerCase();
    if (ABBREVIATIONS.has(lastToken)) {
      // Don't split here — walk to the next candidate.
      continue;
    }
    sentences.push(before);
    start = idx + m[0].length;
  }
  const tail = cleaned.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences;
}

/**
 * Greedily pack sentences into chunks of approximately `chunkSize`
 * characters. A sentence is added to the current chunk if it fits;
 * otherwise the current chunk is flushed (with `overlap` chars of
 * trailing sentences carried forward) and the sentence starts a new
 * one. A single sentence larger than `chunkSize` becomes its own
 * (oversized) chunk — coherence wins over the soft cap.
 */
function packSentences(sentences: string[], chunkSize: number, overlap: number): string[] {
  if (sentences.length === 0) return [];
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  const flush = () => {
    if (current.length === 0) return;
    chunks.push(current.join(" "));
    // Build the overlap tail: walk back through the just-flushed
    // sentences until we've gathered ~overlap chars, then keep
    // those as the seed of the next chunk. Sentence-rounded
    // (always whole sentences) so the next chunk still reads
    // cleanly.
    if (overlap <= 0) {
      current = [];
      currentLen = 0;
      return;
    }
    const tail: string[] = [];
    let tailLen = 0;
    for (let i = current.length - 1; i >= 0; i--) {
      const s = current[i];
      if (tailLen + s.length > overlap && tail.length > 0) break;
      tail.unshift(s);
      tailLen += s.length + 1;
    }
    current = tail;
    currentLen = tailLen;
  };

  for (const s of sentences) {
    const addedLen = current.length === 0 ? s.length : currentLen + 1 + s.length;
    if (addedLen > chunkSize && current.length > 0) {
      flush();
    }
    current.push(s);
    currentLen = current.length === 1 ? s.length : currentLen + 1 + s.length;
  }
  flush();
  return chunks;
}

/**
 * Split per-page `Document`s from {@link loadPdf} into smaller
 * retriever-friendly chunks. Returns a flat array in document order;
 * page metadata is preserved on every chunk.
 */
export async function chunkDocuments(
  pages: Document[],
  options: ChunkOptions = {},
): Promise<Document<ChunkMetadata>[]> {
  const chunkSize = options.chunkSize ?? 700;
  const chunkOverlap = options.chunkOverlap ?? 100;

  const out: Document<ChunkMetadata>[] = [];
  let ordinal = 0;
  for (const page of pages) {
    const sentences = splitSentences(page.pageContent);
    const pieces = packSentences(sentences, chunkSize, chunkOverlap);
    const meta = page.metadata as PdfDocumentMetadata;
    for (const piece of pieces) {
      const trimmed = piece.trim();
      if (!trimmed) continue;
      const chunkId = `p${meta.pageNumber}-${ordinal}`;
      out.push(
        new Document<ChunkMetadata>({
          pageContent: trimmed,
          metadata: {
            ...meta,
            ordinal,
            chunkId,
          },
        }),
      );
      ordinal++;
    }
  }
  return out;
}
