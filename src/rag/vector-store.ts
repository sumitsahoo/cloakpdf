/**
 * Packed-`Float32Array` LangChain `VectorStore` for in-browser RAG.
 *
 * The store keeps all chunk vectors in one contiguous typed array (row-
 * major `[numChunks × hiddenSize]`) and computes cosine similarity as a
 * plain dot product — embeddings are pre-normalised by the embedder.
 * One tight loop over a contiguous Float32Array is fast enough for the
 * few-thousand-vector scale we expect from PDFs in this tool, and it
 * avoids the per-document allocation overhead a LangChain
 * `MemoryVectorStore` would pay.
 *
 * It still satisfies the abstract `VectorStore` contract so the rest of
 * the LangChain stack (retrievers, runnables, the graph) treats it like
 * any other vector store. `addVectors` is the only path we use to
 * populate it; `addDocuments` would re-embed and isn't worth supporting
 * for our offline build-once flow.
 */
import { Document } from "@langchain/core/documents";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import { VectorStore } from "@langchain/core/vectorstores";

interface PackedVectors {
  /** `numChunks × hiddenSize` row-major typed array. */
  data: Float32Array;
  /** Embedding dimensionality (per-row stride). */
  hiddenSize: number;
}

export class PackedVectorStore extends VectorStore {
  declare FilterType: (doc: Document) => boolean;

  /** Per-document metadata, ordered to match the packed matrix. */
  private documents: Document[] = [];
  private packed: PackedVectors | null = null;

  _vectorstoreType(): string {
    return "packed-float32";
  }

  constructor(embeddings: EmbeddingsInterface) {
    super(embeddings, {});
  }

  /**
   * Total number of vectors stored. Useful in tests and for budgeting
   * `k` against the document size.
   */
  get size(): number {
    return this.documents.length;
  }

  /** Embedding dimensionality, or `0` when the store is empty. */
  get hiddenSize(): number {
    return this.packed?.hiddenSize ?? 0;
  }

  /**
   * Add vectors + their documents in one shot. Vectors must already
   * be L2-normalised — we treat cosine similarity as a dot product
   * everywhere and skip the per-query renormalisation other stores do.
   */
  async addVectors(vectors: number[][], documents: Document[]): Promise<void> {
    if (vectors.length !== documents.length) {
      throw new Error(
        `vectors (${vectors.length}) and documents (${documents.length}) length mismatch`,
      );
    }
    if (vectors.length === 0) return;
    const hiddenSize = vectors[0].length;
    if (this.packed && this.packed.hiddenSize !== hiddenSize) {
      throw new Error(
        `Embedding size mismatch: store has ${this.packed.hiddenSize}, new vectors have ${hiddenSize}`,
      );
    }

    const existing = this.packed?.data ?? new Float32Array(0);
    const next = new Float32Array(existing.length + vectors.length * hiddenSize);
    next.set(existing, 0);
    for (let i = 0; i < vectors.length; i++) {
      if (vectors[i].length !== hiddenSize) {
        throw new Error(`Vector ${i} has length ${vectors[i].length}, expected ${hiddenSize}`);
      }
      next.set(vectors[i], existing.length + i * hiddenSize);
    }
    this.packed = { data: next, hiddenSize };
    this.documents.push(...documents);
  }

  /**
   * `addDocuments` requires us to embed first; LangChain's default
   * implementation walks `embeddings.embedDocuments`. We never use this
   * path (the indexer pre-embeds in batches with its own progress
   * reporting) — but it's a one-liner and keeps the abstract contract
   * honest.
   */
  async addDocuments(documents: Document[]): Promise<void> {
    const texts = documents.map((d) => d.pageContent);
    const vectors = await this.embeddings.embedDocuments(texts);
    await this.addVectors(vectors, documents);
  }

  async similaritySearchVectorWithScore(
    query: number[],
    k: number,
    filter?: this["FilterType"],
  ): Promise<[Document, number][]> {
    if (!this.packed || this.documents.length === 0) return [];
    if (query.length !== this.packed.hiddenSize) return [];

    const { data, hiddenSize } = this.packed;
    const scores: number[] = Array.from({ length: this.documents.length });
    for (let i = 0; i < this.documents.length; i++) {
      let dot = 0;
      const base = i * hiddenSize;
      for (let j = 0; j < hiddenSize; j++) dot += data[base + j] * query[j];
      scores[i] = dot;
    }

    // Full sort by descending score, then slice to top-k. For our
    // scale (a few hundred to low thousands of chunks per PDF), an
    // O(N log N) sort is dominated by the cosine matmul above, so
    // there's no win from quickselect / partial-sort heap. If chunk
    // counts ever reach ~50 k we'd revisit — for now, simplicity
    // beats premature optimisation.
    const indices = scores.map((_, i) => i);
    if (filter) {
      const filtered = indices.filter((i) =>
        (filter as (d: Document) => boolean)(this.documents[i]),
      );
      filtered.sort((a, b) => scores[b] - scores[a]);
      return filtered.slice(0, k).map((i) => [this.documents[i], scores[i]] as [Document, number]);
    }
    indices.sort((a, b) => scores[b] - scores[a]);
    return indices.slice(0, k).map((i) => [this.documents[i], scores[i]] as [Document, number]);
  }

  /**
   * Static factory mirroring LangChain's other vector stores — accepts
   * pre-computed vectors so the caller can drive batching + progress
   * reporting from the outside.
   */
  static fromVectors(
    vectors: number[][],
    documents: Document[],
    embeddings: EmbeddingsInterface,
  ): PackedVectorStore {
    const store = new PackedVectorStore(embeddings);
    // Internal call: vectors are already prepared; the async
    // `addVectors` resolves synchronously today so this is safe.
    void store.addVectors(vectors, documents);
    return store;
  }

  /** Internal accessor used by the persistence layer to snapshot the matrix. */
  toSnapshot(): { documents: Document[]; data: Float32Array; hiddenSize: number } | null {
    if (!this.packed) return null;
    return {
      documents: this.documents,
      data: this.packed.data,
      hiddenSize: this.packed.hiddenSize,
    };
  }

  /** Rehydrate from a snapshot produced by {@link toSnapshot}. */
  static fromSnapshot(
    snapshot: { documents: Document[]; data: Float32Array; hiddenSize: number },
    embeddings: EmbeddingsInterface,
  ): PackedVectorStore {
    const store = new PackedVectorStore(embeddings);
    store.documents = snapshot.documents;
    store.packed = { data: snapshot.data, hiddenSize: snapshot.hiddenSize };
    return store;
  }
}
