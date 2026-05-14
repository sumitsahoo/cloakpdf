/**
 * Unit tests for the chunking side of `ocr-text.ts`. The PDF and OCR
 * extraction paths need a real document and a browser worker — those
 * are covered by the e2e suite. Here we verify the page-aware chunker
 * does the right thing.
 */
import { describe, expect, it } from "vitest";
import { chunkPages, type ExtractedPage } from "../../src/utils/ocr-text.ts";

function page(pageNumber: number, text: string): ExtractedPage {
  return { pageNumber, text, ocrUsed: false };
}

describe("chunkPages", () => {
  it("emits one chunk per page when each page fits the target", () => {
    const pages = [page(1, "short page one"), page(2, "short page two")];
    const chunks = chunkPages(pages, 700, 100);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ pageNumber: 1, ordinal: 0, text: "short page one" });
    expect(chunks[1]).toMatchObject({ pageNumber: 2, ordinal: 1, text: "short page two" });
  });

  it("splits long pages on sentence boundaries", () => {
    const text =
      "First sentence here. Second sentence is also short. " +
      "Third one extends a bit further with extra words to keep the chunker honest. " +
      "Fourth sentence wraps the paragraph up cleanly.";
    const chunks = chunkPages([page(1, text)], 80, 10);
    expect(chunks.length).toBeGreaterThan(1);
    // Every chunk should belong to page 1.
    for (const c of chunks) expect(c.pageNumber).toBe(1);
    // Ordinals are globally unique and sequential.
    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i));
  });

  it("never crosses a page boundary in a single chunk", () => {
    const pages = [
      page(1, "Apple banana cherry. Page one ends here."),
      page(2, "Page two starts. Pear plum quince."),
    ];
    const chunks = chunkPages(pages, 200, 20);
    // Each chunk should only contain text from its own page.
    for (const c of chunks) {
      if (c.pageNumber === 1) {
        expect(c.text).not.toMatch(/pear plum quince/i);
        expect(c.text).not.toMatch(/page two starts/i);
      } else if (c.pageNumber === 2) {
        expect(c.text).not.toMatch(/apple banana/i);
        expect(c.text).not.toMatch(/page one ends/i);
      }
    }
  });

  it("skips empty pages without breaking ordinal numbering", () => {
    const pages = [page(1, "first"), page(2, ""), page(3, "third")];
    const chunks = chunkPages(pages, 700, 100);
    expect(chunks.map((c) => c.pageNumber)).toEqual([1, 3]);
    expect(chunks.map((c) => c.ordinal)).toEqual([0, 1]);
  });

  it("returns no chunks for an all-empty document", () => {
    const chunks = chunkPages([page(1, ""), page(2, "")], 700, 100);
    expect(chunks).toEqual([]);
  });
});
