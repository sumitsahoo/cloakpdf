/**
 * Unit tests for the page-aware sentence-packing chunker.
 *
 * We test the bits we own end-to-end: page metadata flows through
 * every chunk, chunks never cross a page boundary, ordinals are
 * dense and sequential, sentences are kept whole (no mid-sentence
 * splits), and common abbreviations (`Mr.`, `Dr.`, `e.g.`) don't
 * trigger false sentence boundaries.
 */
import { Document } from "@langchain/core/documents";
import { describe, expect, it } from "vitest";
import { chunkDocuments } from "../../src/rag/chunking.ts";

function page(pageNumber: number, content: string): Document {
  return new Document({
    pageContent: content,
    metadata: { pageNumber, ocrUsed: false },
  });
}

describe("chunkDocuments", () => {
  it("attaches page metadata + a stable chunkId to every chunk", async () => {
    const pages = [page(1, "short page one"), page(2, "short page two")];
    const chunks = await chunkDocuments(pages, { chunkSize: 200, chunkOverlap: 20 });
    expect(chunks).toHaveLength(2);
    expect(chunks[0].metadata).toMatchObject({ pageNumber: 1, ordinal: 0 });
    expect(chunks[0].metadata.chunkId).toMatch(/^p1-/);
    expect(chunks[1].metadata).toMatchObject({ pageNumber: 2, ordinal: 1 });
    expect(chunks[1].metadata.chunkId).toMatch(/^p2-/);
  });

  it("never crosses a page boundary in a single chunk", async () => {
    const pages = [
      page(1, "Apple banana cherry. Page one ends here."),
      page(2, "Page two starts. Pear plum quince."),
    ];
    const chunks = await chunkDocuments(pages, { chunkSize: 200, chunkOverlap: 20 });
    for (const c of chunks) {
      if (c.metadata.pageNumber === 1) {
        expect(c.pageContent).not.toMatch(/pear plum quince/i);
        expect(c.pageContent).not.toMatch(/page two starts/i);
      } else {
        expect(c.pageContent).not.toMatch(/apple banana/i);
        expect(c.pageContent).not.toMatch(/page one ends/i);
      }
    }
  });

  it("emits dense sequential ordinals across the whole document", async () => {
    // Use real sentences (not repeated single words) so the sentence
    // packer produces multiple chunks per page — the old recursive
    // splitter relied on char count alone, but our sentence-aware
    // packer needs actual sentence boundaries to split.
    const longPage = (n: number, prefix: string) =>
      page(n, Array.from({ length: 10 }, (_, i) => `Sentence ${i + 1} on ${prefix}.`).join(" "));
    const pages = [longPage(1, "page one"), longPage(2, "page two"), longPage(3, "page three")];
    const chunks = await chunkDocuments(pages, { chunkSize: 80, chunkOverlap: 10 });
    // ≥ 3 chunks (one per page minimum). The point of the test is
    // that ordinals are sequential and dense across pages, not the
    // exact count.
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.map((c) => c.metadata.ordinal)).toEqual(chunks.map((_, idx) => idx));
  });

  it("drops empty pages without breaking ordinals", async () => {
    const pages = [page(1, "first content"), page(2, ""), page(3, "third content")];
    const chunks = await chunkDocuments(pages, { chunkSize: 200, chunkOverlap: 20 });
    expect(chunks.map((c) => c.metadata.pageNumber)).toEqual([1, 3]);
    expect(chunks.map((c) => c.metadata.ordinal)).toEqual([0, 1]);
  });

  it("returns no chunks when every page is empty", async () => {
    const chunks = await chunkDocuments([page(1, ""), page(2, "   ")], {
      chunkSize: 200,
      chunkOverlap: 20,
    });
    expect(chunks).toEqual([]);
  });

  it("never splits mid-sentence even when the sentence exceeds chunkSize", async () => {
    // Single oversized sentence — the packer should emit it whole
    // rather than splitting mid-clause. Char-window splitters would
    // cut at the boundary; we want coherence over size.
    const long =
      "Sumit Sahoo built a distributed retrieval system that combined hybrid sparse-dense embedding scoring with reciprocal rank fusion and a downstream cross-encoder reranker designed for sub-second on-device latency on consumer hardware.";
    const chunks = await chunkDocuments([page(1, long)], { chunkSize: 100, chunkOverlap: 20 });
    // One sentence → one chunk, intact.
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageContent).toContain("Sumit Sahoo built");
    expect(chunks[0].pageContent).toContain("consumer hardware.");
  });

  it("packs multiple short sentences into one chunk up to the size budget", async () => {
    // Old recursive splitter over-split short paragraphs into 50-char
    // chunks. Sentence packing should keep adjacent short sentences
    // together while there's room. With chunkSize=200, a single chunk
    // should hold ~3 short sentences (each ~45 chars).
    const text =
      "Hello there. How are you today. The weather is great. Lunch was tasty. Goodbye now.";
    const chunks = await chunkDocuments([page(1, text)], { chunkSize: 200, chunkOverlap: 0 });
    // ≤ 2 chunks — definitely not 5 chunks (one per sentence).
    expect(chunks.length).toBeLessThanOrEqual(2);
    expect(chunks[0].pageContent).toContain("Hello there.");
    expect(chunks[0].pageContent).toContain("How are you today.");
  });

  it("treats common abbreviations as non-terminators (no split on Dr./Mr./e.g.)", async () => {
    // The bare regex `[.]\s+[A-Z]` would split after "Dr." and
    // "Mr." — false sentence boundaries that would scatter contact
    // blocks across chunks. The abbreviation guard keeps these
    // whole. Verified by checking the abbreviation + the following
    // capitalised name land in the same chunk.
    const text =
      "Contact Dr. Smith at the office. He works with Mr. Jones on the project, e.g. the data pipeline.";
    const chunks = await chunkDocuments([page(1, text)], { chunkSize: 500, chunkOverlap: 0 });
    // Whole paragraph fits in 500 chars, so it should be one chunk
    // with all three abbreviations + their following names intact.
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageContent).toContain("Dr. Smith");
    expect(chunks[0].pageContent).toContain("Mr. Jones");
    expect(chunks[0].pageContent).toContain("e.g. the data pipeline");
  });

  it("does not split on decimal numbers", async () => {
    // Decimals look like "X.Y" and our regex requires whitespace
    // after the period to trigger — so `3.14` stays whole. Defensive
    // test in case someone tightens the regex later.
    const text = "The constant is 3.14 in mathematics. Newton estimated 2.71 elsewhere.";
    const chunks = await chunkDocuments([page(1, text)], { chunkSize: 500, chunkOverlap: 0 });
    expect(chunks[0].pageContent).toContain("3.14 in mathematics");
    expect(chunks[0].pageContent).toContain("2.71 elsewhere");
  });

  it("carries trailing-sentence overlap into the next chunk", async () => {
    // When the packer flushes a full chunk, the last ~overlap chars
    // worth of sentences should seed the next chunk so a retriever
    // matching on the boundary still finds them. We craft sentences
    // so the boundary sentence ("Beta two.") lands at the end of
    // chunk 1, and should reappear at the start of chunk 2.
    const text = "Alpha one. Alpha two. Alpha three. Alpha four. Beta two. Gamma one. Gamma two.";
    const chunks = await chunkDocuments([page(1, text)], { chunkSize: 50, chunkOverlap: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    // The last sentence of chunk N should appear at the start of
    // chunk N+1 — sentence-rounded overlap, not char-cut.
    for (let i = 0; i < chunks.length - 1; i++) {
      const aSentences = chunks[i].pageContent.split(/(?<=[.?!])\s+/);
      const lastA = aSentences[aSentences.length - 1].trim();
      // Some overlap landed: the *very* last sentence of chunk i
      // appears verbatim somewhere in chunk i+1's prefix.
      if (lastA.length > 0) {
        expect(chunks[i + 1].pageContent.slice(0, lastA.length + 50)).toContain(lastA);
      }
    }
  });
});
