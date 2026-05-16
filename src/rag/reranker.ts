/**
 * Cross-encoder reranker — rescores hybrid-retriever output before
 * the LLM sees it.
 *
 * **Why this exists.** [HybridRetriever](./retrievers/hybrid.ts)
 * fuses BM25 + dense via reciprocal rank fusion. RRF works on
 * **rank** rather than score, so a chunk that scored marginally on
 * both retrievers can outrank a chunk that scored strongly on just
 * one. A cross-encoder sees the (query, passage) pair concatenated
 * end-to-end and produces a calibrated relevance score — a much
 * sharper basis for the final top-K than rank fusion.
 *
 * **Architecture.** This module exposes:
 *
 *   - {@link CrossEncoderReranker} — thin wrapper around the
 *     Transformers.js `text-classification` pipeline, scoring N
 *     (query, passage) pairs in a single batched call.
 *   - {@link RerankingRetriever} — `BaseRetriever` that wraps any
 *     other retriever, fetches a wider candidate set (e.g. 3× the
 *     final k), and returns the top-k after rescoring.
 *
 * **When the reranker is unavailable** (model failed to load, user
 * has disabled it) the upstream graph should skip wrapping; the
 * hybrid retriever still produces a perfectly usable top-K. The
 * reranker is a precision multiplier, not a correctness requirement.
 */
import type { Document } from "@langchain/core/documents";
import {
  type BaseRetriever,
  BaseRetriever as BaseRetrieverClass,
} from "@langchain/core/retrievers";
import type { AiPipeline } from "../utils/ai-runtime.ts";

// ── Cross-encoder wrapper ────────────────────────────────────────

/**
 * Output shape Transformers.js' `text-classification` pipeline emits
 * for a sequence-classification model. The score is the per-pair
 * relevance: higher = more relevant. Concrete shapes vary by model
 * family:
 *
 *   - BGE rerankers expose a single "LABEL_0" head with a
 *     sigmoid-normalised score in [0, 1].
 *   - MS MARCO MiniLM-class cross-encoders emit a raw logit (any
 *     real number — a single positive vs negative example pair
 *     might come back as `8.66` vs `-11.25`).
 *
 * Either is fine because we only sort by score — the absolute scale
 * doesn't matter. Some models also return an array of {label, score}
 * entries per item (one per class head); we take the first entry
 * which is the relevance class for every model we've shipped.
 */
type ClassificationOutput =
  | { label: string; score: number }
  | Array<{ label: string; score: number }>;

export class CrossEncoderReranker {
  private pipeline: AiPipeline;

  constructor(pipeline: AiPipeline) {
    this.pipeline = pipeline;
  }

  /**
   * Score every (query, passage) pair and return the passages
   * sorted by descending relevance. Pairs are batched into one
   * pipeline call so the runtime can fuse them into a single
   * forward pass — much faster than N sequential calls.
   *
   * The Transformers.js convention for sentence-pair classification
   * is to pass `{ text, text_pair }` objects in the input array;
   * the runtime tokenises with the model's pair format (`[CLS] query
   * [SEP] passage [SEP]`) automatically.
   */
  async rerank(query: string, passages: Document[], topK: number): Promise<Document[]> {
    if (passages.length === 0) return [];
    if (passages.length === 1) return passages.slice(0, topK);

    const fn = this.pipeline as unknown as (
      input: Array<{ text: string; text_pair: string }>,
    ) => Promise<ClassificationOutput[]>;

    const inputs = passages.map((p) => ({ text: query, text_pair: p.pageContent }));
    const results = await fn(inputs);

    // Normalise the score-array shape so we always have a number
    // per input. Missing scores default to `-Infinity` (not `0`) so
    // a malformed pipeline output sinks the affected passages to the
    // bottom regardless of the model's score range. BGE outputs
    // sigmoid-normalised [0, 1] where `0` is "least relevant", so
    // defaulting to `0` was benign; MiniLM outputs raw logits where
    // `0` is *middling* — defaulting to `0` would put missing-score
    // passages above legitimately-negative-scored ones.
    const scores = results.map((r) => {
      if (Array.isArray(r)) {
        // Multi-label output — take the first label's score (every
        // single-relevance reranker we ship exposes one head, so
        // this is the relevance score).
        return r[0]?.score ?? Number.NEGATIVE_INFINITY;
      }
      return r.score ?? Number.NEGATIVE_INFINITY;
    });

    return passages
      .map((doc, idx) => ({ doc, score: scores[idx] ?? Number.NEGATIVE_INFINITY }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((entry) => entry.doc);
  }
}

// ── Retriever wrapper ────────────────────────────────────────────

export interface RerankingRetrieverOptions {
  /**
   * The retriever whose output we'll rescore — typically
   * HybridRetriever, constructed with `k = candidate-K` (i.e. the
   * wider candidate pool, not the final top-K). The reranker has
   * no way to change `base`'s per-call k, so the candidate pool
   * size is whatever `base` was constructed to return.
   */
  base: BaseRetriever;
  /** Loaded reranker — `null` skips rescoring and passes `base` through. */
  reranker: CrossEncoderReranker | null;
  /** Final top-K returned to the graph after rescoring. */
  k: number;
}

export class RerankingRetriever extends BaseRetrieverClass {
  static lc_name(): string {
    return "RerankingRetriever";
  }
  lc_namespace = ["cloakpdf", "rag", "retrievers", "reranking"];

  private base: BaseRetriever;
  private reranker: CrossEncoderReranker | null;
  private k: number;

  constructor(options: RerankingRetrieverOptions) {
    super();
    this.base = options.base;
    this.reranker = options.reranker;
    this.k = options.k;
  }

  async _getRelevantDocuments(query: string): Promise<Document[]> {
    const candidates = (await this.base.invoke(query)) as Document[];
    if (!this.reranker) {
      // No reranker loaded — pass through the base's top-K so
      // the graph still receives a usable ranking.
      return candidates.slice(0, this.k);
    }
    // Defensive: if reranking throws (model crash, malformed
    // output) we degrade to the base ranking rather than killing
    // the question.
    try {
      return await this.reranker.rerank(query, candidates, this.k);
    } catch (e) {
      console.error("[reranker] scoring failed; falling back to base ranking", e);
      return candidates.slice(0, this.k);
    }
  }
}
