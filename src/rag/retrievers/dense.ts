/**
 * Dense vector retriever built on the packed-Float32Array
 * {@link PackedVectorStore}.
 *
 * This is a thin factory — the heavy lifting (embedding, packing,
 * cosine search) lives in `vector-store.ts`. We expose
 * `buildDenseRetriever` so the index pipeline and the graph stay free
 * of vector-store details and can be tested against any
 * `BaseRetriever`.
 */
import type { Document } from "@langchain/core/documents";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { BaseRetriever } from "@langchain/core/retrievers";
import { PackedVectorStore } from "../vector-store.ts";

export interface DenseRetrieverOptions {
  /** Pre-computed embeddings, one per document, in matching order. */
  vectors: number[][];
  /** Chunk documents (page metadata preserved). */
  documents: Document[];
  /** Embeddings adapter the store can use for `addDocuments` fallback. */
  embeddings: EmbeddingsInterface;
  /** Top-k for retrieval. Default 20 — the hybrid layer trims further. */
  k?: number;
}

/**
 * Build a `BaseRetriever` over pre-embedded chunks. We do the embedding
 * up-front (with progress) and pass the vectors in here so this
 * function is synchronous and deterministic.
 */
export function buildDenseRetriever(options: DenseRetrieverOptions): BaseRetriever {
  const store = PackedVectorStore.fromVectors(
    options.vectors,
    options.documents,
    options.embeddings,
  );
  return store.asRetriever({ k: options.k ?? 20 });
}

/**
 * Build a dense retriever from a previously cached store snapshot —
 * used when we restore from IndexedDB and don't need to re-embed.
 */
export function buildDenseRetrieverFromStore(store: PackedVectorStore, k = 20): BaseRetriever {
  return store.asRetriever({ k });
}
