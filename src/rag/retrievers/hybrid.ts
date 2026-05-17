/**
 * Hybrid retriever combining a dense (vector) retriever with a sparse
 * (BM25) retriever via **Reciprocal Rank Fusion**.
 *
 * RRF (Cormack et al., 2009) is parameter-free relative to the
 * underlying scores: it ranks each list, then sums `1 / (k + rank)`
 * across all lists. This sidesteps the perennial pain of weighted-sum
 * fusion — BM25 scores live on an unbounded log-frequency scale while
 * cosine similarities are in `[-1, 1]`, so any weighted blend needs
 * per-corpus tuning that doesn't survive a model swap. RRF needs none.
 *
 * The constant `k` (60 below) is the standard from the original paper;
 * it controls how steeply later ranks decay. 60 is robust across IR
 * benchmarks and we follow that prior.
 */
import type { Document } from "@langchain/core/documents";
import {
  type BaseRetriever,
  BaseRetriever as BaseRetrieverClass,
} from "@langchain/core/retrievers";

export interface HybridRetrieverOptions {
  /** Dense (vector) retriever. */
  dense: BaseRetriever;
  /** Sparse (BM25) retriever. */
  sparse: BaseRetriever;
  /** How many results to keep after fusion. */
  k: number;
  /**
   * RRF constant. Larger values flatten the rank contribution; smaller
   * values make top ranks dominate more. Default 60 (Cormack et al.).
   */
  rrfK?: number;
}

export class HybridRetriever extends BaseRetrieverClass {
  static lc_name(): string {
    return "HybridRetriever";
  }
  lc_namespace = ["cloakpdf", "rag", "retrievers", "hybrid"];

  private dense: BaseRetriever;
  private sparse: BaseRetriever;
  private k: number;
  private rrfK: number;

  constructor(options: HybridRetrieverOptions) {
    super();
    this.dense = options.dense;
    this.sparse = options.sparse;
    this.k = options.k;
    this.rrfK = options.rrfK ?? 60;
  }

  async _getRelevantDocuments(query: string): Promise<Document[]> {
    // `allSettled` so a fault in one retriever (e.g. a WASM crash in
    // the dense embedder, an unexpected throw from the BM25 library on
    // some pathological query) doesn't kill the whole retrieve step.
    // We fuse whatever survived and only rethrow if BOTH sides failed
    // — that's the only case where there's nothing to feed the LLM.
    const [denseResult, sparseResult] = await Promise.allSettled([
      this.dense.invoke(query),
      this.sparse.invoke(query),
    ]);
    const denseHits = denseResult.status === "fulfilled" ? denseResult.value : [];
    const sparseHits = sparseResult.status === "fulfilled" ? sparseResult.value : [];
    if (denseResult.status === "rejected" && sparseResult.status === "rejected") {
      // Both sides failed — surface the dense error (typically the
      // more diagnostic one since BM25 is a pure-JS sort) so the
      // session caller can show it to the user.
      throw denseResult.reason;
    }
    recordHybridDebug(query, denseHits, sparseHits);
    return reciprocalRankFusion([denseHits, sparseHits], this.k, this.rrfK);
  }
}

/**
 * Push per-retriever results onto `window.__cloakpdfHybridDebug` when
 * `localStorage["cloakpdf:debug"]` is set. Off by default; only the
 * retrieval probe reads this back.
 */
interface HybridDebugRecord {
  query: string;
  dense: Array<{ chunkId: string; pageNumber: number; preview: string }>;
  sparse: Array<{ chunkId: string; pageNumber: number; preview: string }>;
}
function recordHybridDebug(query: string, dense: Document[], sparse: Document[]): void {
  if (typeof window === "undefined") return;
  try {
    if (!window.localStorage?.getItem("cloakpdf:debug")) return;
  } catch {
    return;
  }
  const w = window as unknown as { __cloakpdfHybridDebug?: HybridDebugRecord[] };
  if (!Array.isArray(w.__cloakpdfHybridDebug)) w.__cloakpdfHybridDebug = [];
  const summarise = (docs: Document[]) =>
    docs.map((d) => {
      const meta = d.metadata as { chunkId?: string; pageNumber?: number };
      return {
        chunkId: meta.chunkId ?? "(unknown)",
        pageNumber: meta.pageNumber ?? -1,
        preview: d.pageContent.slice(0, 200),
      };
    });
  w.__cloakpdfHybridDebug.push({
    query,
    dense: summarise(dense),
    sparse: summarise(sparse),
  });
}

/**
 * Reciprocal Rank Fusion over an arbitrary number of ranked lists.
 *
 *   score(d) = Σ_{list ∋ d}  1 / (k + rank_list(d))
 *
 * Documents are deduplicated by content hash (page-aware metadata
 * isn't enough — the same surface text can appear via both retrievers
 * with subtly different metadata casts). Exported so unit tests can
 * cover the fusion math without spinning up retrievers.
 */
export function reciprocalRankFusion(rankings: Document[][], topK: number, rrfK = 60): Document[] {
  const scores = new Map<string, { score: number; doc: Document }>();
  for (const ranking of rankings) {
    ranking.forEach((doc, idx) => {
      const key = dedupKey(doc);
      const contribution = 1 / (rrfK + idx + 1);
      const prev = scores.get(key);
      if (prev) {
        prev.score += contribution;
      } else {
        scores.set(key, { score: contribution, doc });
      }
    });
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((entry) => entry.doc);
}

/**
 * Pick a dedup key that's stable across retrievers. Prefer the
 * `chunkId` we attach in chunking; fall back to the raw page content
 * when callers feed in documents from outside the pipeline (e.g.
 * direct unit tests).
 */
function dedupKey(doc: Document): string {
  const id = (doc.metadata as { chunkId?: unknown })?.chunkId;
  if (typeof id === "string" && id) return id;
  return doc.pageContent;
}
