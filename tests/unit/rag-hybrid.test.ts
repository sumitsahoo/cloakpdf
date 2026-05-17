/**
 * Unit tests for the Reciprocal Rank Fusion combiner used by the
 * hybrid retriever. The fusion is pure math over `Document[]`; we
 * don't need real BM25 / dense retrievers to verify the ordering and
 * deduplication invariants the production pipeline depends on.
 */
import { Document } from "@langchain/core/documents";
import { BaseRetriever } from "@langchain/core/retrievers";
import { describe, expect, it } from "vitest";
import { HybridRetriever, reciprocalRankFusion } from "../../src/rag/retrievers/hybrid.ts";

function doc(id: string, content = id, page = 1): Document {
  return new Document({
    pageContent: content,
    metadata: { chunkId: id, pageNumber: page },
  });
}

describe("reciprocalRankFusion", () => {
  it("merges two rankings preferring documents that appear high in both", () => {
    // Documents in both lists at the same rank outrank documents that
    // only appear in one. RRF score with k=60:
    //   a: 1/61 + 1/61  (rank 1 in both)
    //   b: 1/62 + 1/62  (rank 2 in both)
    //   c: 1/63          (rank 3, dense only)
    //   d: 1/63          (rank 3, sparse only)
    const dense = [doc("a"), doc("b"), doc("c")];
    const sparse = [doc("a"), doc("b"), doc("d")];
    const fused = reciprocalRankFusion([dense, sparse], 4);
    expect(fused.slice(0, 2).map((d) => d.metadata.chunkId)).toEqual(["a", "b"]);
    expect(new Set(fused.slice(2).map((d) => d.metadata.chunkId))).toEqual(new Set(["c", "d"]));
  });

  it("dedupes by chunkId so the same chunk doesn't appear twice", () => {
    const dense = [doc("a"), doc("b")];
    const sparse = [doc("a"), doc("c")];
    const fused = reciprocalRankFusion([dense, sparse], 5);
    const ids = fused.map((d) => d.metadata.chunkId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
    expect(ids).toContain("c");
    // `a` is rank-1 in both, so it must come first.
    expect(ids[0]).toBe("a");
  });

  it("caps the result at topK", () => {
    const list = [doc("a"), doc("b"), doc("c"), doc("d"), doc("e")];
    const fused = reciprocalRankFusion([list, list], 2);
    expect(fused).toHaveLength(2);
  });

  it("falls back to pageContent as the dedup key when chunkId is missing", () => {
    const a1 = new Document({ pageContent: "hello world", metadata: {} });
    const a2 = new Document({ pageContent: "hello world", metadata: {} });
    const b = new Document({ pageContent: "different", metadata: {} });
    const fused = reciprocalRankFusion([[a1], [a2, b]], 5);
    expect(fused).toHaveLength(2);
    expect(fused.map((d) => d.pageContent)).toEqual(["hello world", "different"]);
  });

  it("returns nothing for empty rankings", () => {
    expect(reciprocalRankFusion([], 3)).toEqual([]);
    expect(reciprocalRankFusion([[]], 3)).toEqual([]);
  });

  it("rrfK controls late-rank decay", () => {
    // With small rrfK, rank 1 dominates; with large rrfK, ranks
    // contribute more uniformly. Test by checking ordering shifts.
    const a = doc("a");
    const b = doc("b");
    const dense = [a, b];
    const sparse = [b]; // only `b` ranks here
    const tight = reciprocalRankFusion([dense, sparse], 2, 1);
    const loose = reciprocalRankFusion([dense, sparse], 2, 1000);
    // tight (small rrfK): rank-1 of dense + rank-1 of sparse
    //  - a: 1/(1+1) = 0.5
    //  - b: 1/(1+2) + 1/(1+1) = 0.333 + 0.5 = 0.833 → b first
    expect(tight.map((d) => d.metadata.chunkId)).toEqual(["b", "a"]);
    // loose (huge rrfK): contributions are nearly equal, but `b`
    // still wins because it appears in *both* lists.
    expect(loose.map((d) => d.metadata.chunkId)[0]).toBe("b");
  });
});

// ── HybridRetriever resilience ────────────────────────────────────
//
// Tiny test-only retriever shells that either return a fixed result or
// throw. Cheaper than mocking the real BM25 / dense retrievers and
// keeps the assertions focused on the fault-tolerance contract.

class FixedRetriever extends BaseRetriever {
  static lc_name() {
    return "FixedRetriever";
  }
  lc_namespace = ["test", "fixed"];
  private hits: Document[];
  constructor(hits: Document[]) {
    super();
    this.hits = hits;
  }
  async _getRelevantDocuments(_query: string): Promise<Document[]> {
    return this.hits;
  }
}

class ThrowingRetriever extends BaseRetriever {
  static lc_name() {
    return "ThrowingRetriever";
  }
  lc_namespace = ["test", "throwing"];
  private message: string;
  constructor(message: string) {
    super();
    this.message = message;
  }
  async _getRelevantDocuments(_query: string): Promise<Document[]> {
    throw new Error(this.message);
  }
}

describe("HybridRetriever resilience", () => {
  it("returns the dense hits when BM25 (sparse) throws", async () => {
    const dense = new FixedRetriever([doc("d1"), doc("d2")]);
    const sparse = new ThrowingRetriever("bm25 boom");
    const retriever = new HybridRetriever({ dense, sparse, k: 5 });
    const hits = await retriever.invoke("any");
    expect(hits.map((d) => d.metadata.chunkId)).toEqual(["d1", "d2"]);
  });

  it("returns the BM25 hits when the dense retriever throws", async () => {
    const dense = new ThrowingRetriever("embedder crashed");
    const sparse = new FixedRetriever([doc("s1"), doc("s2")]);
    const retriever = new HybridRetriever({ dense, sparse, k: 5 });
    const hits = await retriever.invoke("any");
    expect(hits.map((d) => d.metadata.chunkId)).toEqual(["s1", "s2"]);
  });

  it("rethrows when BOTH retrievers fail — there's nothing left to feed the LLM", async () => {
    const dense = new ThrowingRetriever("dense failure");
    const sparse = new ThrowingRetriever("sparse failure");
    const retriever = new HybridRetriever({ dense, sparse, k: 5 });
    // Dense error is surfaced first — typically the more diagnostic one.
    await expect(retriever.invoke("any")).rejects.toThrow("dense failure");
  });

  it("still fuses both when both succeed (regression: don't break the happy path)", async () => {
    const dense = new FixedRetriever([doc("a"), doc("b")]);
    const sparse = new FixedRetriever([doc("a"), doc("c")]);
    const retriever = new HybridRetriever({ dense, sparse, k: 3 });
    const hits = await retriever.invoke("any");
    // `a` ranks 1 in both → fuses to top.
    expect(hits[0]?.metadata.chunkId).toBe("a");
    expect(hits).toHaveLength(3);
  });
});
