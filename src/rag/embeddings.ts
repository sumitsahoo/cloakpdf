/**
 * LangChain `Embeddings` adapter that delegates to a Transformers.js
 * `feature-extraction` pipeline.
 *
 * Why this adapter exists: every retriever / vector store in LangChain
 * accepts the abstract `Embeddings` shape. Pointing them at our local
 * Transformers.js pipeline through this thin wrapper means BM25,
 * MemoryVectorStore, the ensemble retriever, and the LangGraph nodes
 * don't have to know our model came from on-device inference.
 *
 * Vectors are L2-normalised by Transformers.js (`normalize: true`) so
 * downstream cosine similarity collapses to a dot product.
 *
 * **Task-specific prompts.** EmbeddingGemma is trained for asymmetric
 * retrieval: passages get one prompt prefix, queries get another. The
 * prefixes are part of the training objective — feeding raw text into
 * both sides produces materially worse retrieval. We apply them here
 * so call sites stay unchanged (`embedDocuments` for chunks,
 * `embedQuery` for the user's question and for the relevance gate).
 * Swapping back to a symmetric embedder (e.g. bge-*) means deleting
 * the prefix calls — they're a no-op on those models but spend a few
 * tokens of context per pass.
 */
import { Embeddings, type EmbeddingsParams } from "@langchain/core/embeddings";
import { runEmbed } from "../utils/ai-tasks.ts";
import type { AiPipeline } from "../utils/ai-runtime.ts";

export interface TransformersJsEmbeddingsOptions extends EmbeddingsParams {
  /** Resolved Transformers.js `feature-extraction` pipeline. */
  pipeline: AiPipeline;
  /**
   * Batch size for `embedDocuments`. 32 is a good middle ground for
   * the 300M-class encoder in WASM — bigger batches don't gain much
   * throughput once the WASM threads saturate, and small batches
   * hurt latency.
   */
  batchSize?: number;
}

/**
 * EmbeddingGemma prompt prefix for indexed passages.
 *
 * The model card recommends `title: {title} | text: {chunk}`; we don't
 * carry a title per chunk (PDF pages aren't titled) so we use the
 * documented `none` sentinel. Same prefix on every chunk keeps the
 * matrix uniform.
 */
const DOC_PREFIX = "title: none | text: ";

/**
 * EmbeddingGemma prompt prefix for the user's query and for the
 * off-topic relevance gate. `search result` is the right task tag for
 * retrieval-style use: the trained objective optimises cosine between
 * a `search result`-tagged query and `title: ... | text: ...`-tagged
 * passages.
 *
 * Other task tags exist (`question answering`, `fact checking`, etc.)
 * but produce different score distributions; mixing tags within one
 * session would invalidate the relevance threshold tuning.
 */
const QUERY_PREFIX = "task: search result | query: ";

export class TransformersJsEmbeddings extends Embeddings {
  private pipeline: AiPipeline;
  private batchSize: number;

  constructor(options: TransformersJsEmbeddingsOptions) {
    super(options);
    this.pipeline = options.pipeline;
    this.batchSize = options.batchSize ?? 32;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const prefixed = batch.map((t) => DOC_PREFIX + t);
      const vectors = await runEmbed(this.pipeline, prefixed);
      for (const v of vectors) out.push(Array.from(v));
    }
    return out;
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vec] = await runEmbed(this.pipeline, [QUERY_PREFIX + text]);
    return Array.from(vec);
  }
}
