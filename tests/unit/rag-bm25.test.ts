/**
 * Unit tests for our BM25 retriever wrapper.
 *
 * The wrapper exists because `@langchain/community`'s `BM25Retriever`
 * lowercases the query but matches against the original-case corpus
 * with a case-sensitive regex — so "Sumit" in a chunk is invisible to
 * the lowercased "sumit" query token, and the only contributing terms
 * are accidental lowercase substrings ("is" in "Enterpr**is**e"). For a
 * résumé this nullifies BM25's whole job: rare proper nouns like a
 * surname carry no signal.
 *
 * These tests pin the fix from both sides — proper nouns must score
 * the chunk that contains them, and the wrapper must hand back the
 * original-case `Document` (not the lowercased indexing copy) so the
 * LLM downstream still sees the document's real text.
 */
import { Document } from "@langchain/core/documents";
import { describe, expect, it } from "vitest";
import type { ChunkMetadata } from "../../src/rag/chunking.ts";
import { buildBm25Retriever } from "../../src/rag/retrievers/bm25.ts";

function chunk(content: string, chunkId: string, page = 1): Document<ChunkMetadata> {
  return new Document<ChunkMetadata>({
    pageContent: content,
    metadata: { chunkId, pageNumber: page, ordinal: 0, ocrUsed: false },
  });
}

const RESUME_CHUNKS = [
  chunk("Sumit Sahoo\nENTERPRISE ARCHITECT", "title"),
  chunk("Sumit holds Google Cloud certifications.", "bullet-certs"),
  chunk("Sumit is proficient in Python, Java, and more.", "bullet-langs"),
  chunk("Sumit writes articles on Medium about AI.", "bullet-medium"),
];

describe("buildBm25Retriever (case-insensitive)", () => {
  it("ranks the title chunk highest for 'Who is Sumit Sahoo?' — Sahoo is rare", async () => {
    const retriever = buildBm25Retriever({ documents: RESUME_CHUNKS, k: 4 });
    const hits = await retriever.invoke("Who is Sumit Sahoo?");
    expect(hits[0]?.metadata.chunkId).toBe("title");
  });

  it("ranks the title chunk highest for 'Who is Sumit?' too — capitalisation must not hide hits", async () => {
    // Regression: under the upstream `BM25Retriever` alone, query
    // tokens are lowercased ("sumit") but the corpus regex is
    // case-sensitive, so "Sumit" in the chunks contributes zero. The
    // only "matches" then come from coincidental lowercase substrings
    // (e.g. "is" inside "Enterprise") — title and bullet-langs end up
    // tied on stopword overlap and the question echoes back. With the
    // case fix, "sumit" hits every chunk that names Sumit and the
    // title leads on document-length normalisation.
    const retriever = buildBm25Retriever({ documents: RESUME_CHUNKS, k: 4 });
    const hits = await retriever.invoke("Who is Sumit?");
    expect(hits[0]?.metadata.chunkId).toBe("title");
  });

  it("returns the original-case Document, not the lowercased indexing copy", async () => {
    const retriever = buildBm25Retriever({ documents: RESUME_CHUNKS, k: 1 });
    const [hit] = await retriever.invoke("Sumit Sahoo");
    expect(hit?.pageContent).toBe("Sumit Sahoo\nENTERPRISE ARCHITECT");
  });

  it("honours the k cap", async () => {
    const retriever = buildBm25Retriever({ documents: RESUME_CHUNKS, k: 2 });
    const hits = await retriever.invoke("Sumit");
    expect(hits).toHaveLength(2);
  });

  it("preserves page metadata through the wrapper", async () => {
    const docs = [chunk("Sumit Sahoo", "title", 1), chunk("Other content", "other", 4)];
    const retriever = buildBm25Retriever({ documents: docs, k: 2 });
    const [hit] = await retriever.invoke("Sumit");
    expect(hit?.metadata.pageNumber).toBe(1);
    expect(hit?.metadata.chunkId).toBe("title");
  });
});
