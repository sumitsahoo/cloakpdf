/**
 * Unit tests for the packed-Float32Array `PackedVectorStore` used as
 * the dense leg of the hybrid retriever. We bypass the real embedder
 * by passing in a tiny stub — the tests are about the math
 * (similarity ordering, top-k, dimension checks) not the model.
 */
import { Document } from "@langchain/core/documents";
import { Embeddings } from "@langchain/core/embeddings";
import { describe, expect, it } from "vitest";
import { PackedVectorStore } from "../../src/rag/vector-store.ts";

/**
 * Stub embedder — returns whatever was passed in. The vector store
 * never calls into us during these tests because we go through
 * `addVectors` (pre-computed vectors), but the abstract `Embeddings`
 * interface still needs concrete methods.
 */
class IdentityEmbeddings extends Embeddings {
  constructor() {
    super({});
  }
  async embedQuery(_text: string): Promise<number[]> {
    return [];
  }
  async embedDocuments(_texts: string[]): Promise<number[][]> {
    return [];
  }
}

function normalised(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((s, x) => s + x * x, 0)) || 1;
  return values.map((x) => x / norm);
}

function doc(id: string, page = 1): Document {
  return new Document({
    pageContent: id,
    metadata: { chunkId: id, pageNumber: page },
  });
}

describe("PackedVectorStore", () => {
  it("adds vectors + documents and reports size + hiddenSize", async () => {
    const store = new PackedVectorStore(new IdentityEmbeddings());
    await store.addVectors([normalised([1, 0, 0]), normalised([0, 1, 0])], [doc("a"), doc("b")]);
    expect(store.size).toBe(2);
    expect(store.hiddenSize).toBe(3);
  });

  it("returns documents ordered by cosine similarity to the query", async () => {
    const store = new PackedVectorStore(new IdentityEmbeddings());
    await store.addVectors(
      [normalised([1, 0, 0]), normalised([0, 1, 0]), normalised([0, 0, 1])],
      [doc("north"), doc("south"), doc("east")],
    );
    const hits = await store.similaritySearchVectorWithScore(normalised([0.1, 0.9, 0]), 2);
    const ids = hits.map(([d]) => d.metadata.chunkId);
    expect(ids).toEqual(["south", "north"]);
    expect(hits[0][1]).toBeGreaterThan(hits[1][1]);
  });

  it("caps results at k", async () => {
    const store = new PackedVectorStore(new IdentityEmbeddings());
    await store.addVectors(
      [normalised([1, 0]), normalised([0, 1]), normalised([1, 1])],
      [doc("a"), doc("b"), doc("c")],
    );
    const hits = await store.similaritySearchVectorWithScore(normalised([1, 0]), 2);
    expect(hits).toHaveLength(2);
  });

  it("returns nothing when query dimension mismatches", async () => {
    const store = new PackedVectorStore(new IdentityEmbeddings());
    await store.addVectors([normalised([1, 0, 0])], [doc("a")]);
    const hits = await store.similaritySearchVectorWithScore(normalised([1, 0]), 5);
    expect(hits).toEqual([]);
  });

  it("returns nothing when the store is empty", async () => {
    const store = new PackedVectorStore(new IdentityEmbeddings());
    const hits = await store.similaritySearchVectorWithScore([0, 0, 0], 5);
    expect(hits).toEqual([]);
  });

  it("rejects vectors with inconsistent hidden size", async () => {
    const store = new PackedVectorStore(new IdentityEmbeddings());
    await store.addVectors([normalised([1, 0, 0])], [doc("a")]);
    await expect(store.addVectors([normalised([1, 0])], [doc("b")])).rejects.toThrow(
      /Embedding size mismatch/,
    );
  });

  it("rejects vector / document length mismatches", async () => {
    const store = new PackedVectorStore(new IdentityEmbeddings());
    await expect(store.addVectors([normalised([1, 0])], [doc("a"), doc("b")])).rejects.toThrow(
      /length mismatch/,
    );
  });

  it("round-trips through toSnapshot / fromSnapshot", async () => {
    const original = new PackedVectorStore(new IdentityEmbeddings());
    await original.addVectors([normalised([1, 0, 0]), normalised([0, 1, 0])], [doc("a"), doc("b")]);
    const snapshot = original.toSnapshot();
    expect(snapshot).not.toBeNull();
    if (!snapshot) throw new Error("snapshot is null");

    const restored = PackedVectorStore.fromSnapshot(snapshot, new IdentityEmbeddings());
    const hits = await restored.similaritySearchVectorWithScore(normalised([1, 0, 0]), 1);
    expect(hits).toHaveLength(1);
    expect(hits[0][0].metadata.chunkId).toBe("a");
  });
});
