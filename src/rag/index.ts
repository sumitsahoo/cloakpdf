/**
 * Public RAG entry point used by the Ask PDF tool.
 *
 * Lifecycle:
 *
 *   const session = await createRagSession({ chatPipe, embedPipe, file, onIndexProgress });
 *   await session.ask({ question, onToken });
 *
 * One session = one PDF + one pair of models. The session owns the
 * hybrid retriever (BM25 + dense + RRF) and a compiled LangGraph. Per
 * question the graph routes through classify → (retrieve → generate)
 * or classify → chitchat → end.
 *
 * IndexedDB caching is keyed by SHA-256 of the PDF bytes — re-opening
 * the same file skips extraction, chunking, and embedding.
 */
import type { Document } from "@langchain/core/documents";
import type { AiModelInfo } from "../utils/ai-models.ts";
import type { AiPipeline } from "../utils/ai-runtime.ts";
import { TransformersJsChatModel } from "./chat-model.ts";
import { type ChunkMetadata, chunkDocuments } from "./chunking.ts";
import { TransformersJsEmbeddings } from "./embeddings.ts";
import { buildRagGraph, type RagState, type RelevanceContext } from "./graph.ts";
import { loadPdf } from "./pdf-loader.ts";
import { cacheIndex, getCachedIndex, sha256Hex } from "./persistence.ts";

// Re-export for consumers (e.g. the "Delete cached models" flow in
// useRagModels) — the rag barrel is the only place outside src/rag/
// that should reach into persistence internals.
export { clearAllCachedIndexes } from "./persistence.ts";
import { CrossEncoderReranker, RerankingRetriever } from "./reranker.ts";
import { buildBm25Retriever } from "./retrievers/bm25.ts";
import { buildDenseRetrieverFromStore } from "./retrievers/dense.ts";
import { HybridRetriever } from "./retrievers/hybrid.ts";
import { PackedVectorStore } from "./vector-store.ts";

export interface CreateSessionOptions {
  /** Resolved Transformers.js `text-generation` pipeline. */
  chatPipe: AiPipeline;
  /**
   * Metadata for the active chat variant. Carries per-tier generation
   * defaults (sampler, repetition penalty, n-gram ban) — passed
   * straight through to {@link TransformersJsChatModel} so SmolLM2
   * keeps its top_p + n-gram crutches while LFM2 gets its min_p
   * sampler.
   */
  chatInfo: AiModelInfo;
  /** Resolved Transformers.js `feature-extraction` pipeline. */
  embedPipe: AiPipeline;
  /**
   * Resolved Transformers.js `text-classification` pipeline for the
   * cross-encoder reranker. Optional: when omitted (or when the user
   * has disabled reranking via the localStorage flag, see
   * `RAG_RERANK_FLAG`) the session uses raw hybrid retrieval — same
   * correctness, slightly worse precision on the top-K.
   */
  rerankPipe?: AiPipeline;
  /** The PDF the session indexes and answers questions about. */
  file: File;
  /**
   * Reports progress through extraction → chunking → embedding so the
   * UI can render a determinate progress bar.
   */
  onIndexProgress?: (info: IndexingProgress) => void;
}

/**
 * localStorage flag that disables reranking when set to "0".
 * Default = enabled. Read by `createRagSession` so a power user can
 * A/B without touching code. The e2e comparison orchestrator flips
 * this for cross-cut measurement runs.
 */
export const RAG_RERANK_FLAG = "cloakpdf:rag-rerank";

function rerankEnabled(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    return localStorage.getItem(RAG_RERANK_FLAG) !== "0";
  } catch {
    return true;
  }
}

export type IndexingProgress =
  | { kind: "extract"; phase: "text-layer" | "ocr"; current: number; total: number }
  | { kind: "embed"; current: number; total: number };

export interface AskOptions {
  question: string;
  /** Fires for each decoded token as the chat model streams. */
  onToken?: (delta: string) => void;
}

export interface AskResult {
  answer: string;
  citedPages: number[];
  /**
   * How the graph classified and routed the query:
   *
   *   - `question`  — retrieve + generate produced this answer.
   *   - `chitchat`  — short greeting, no retrieval.
   *   - `off-topic` — relevance gate fired, canned refusal returned.
   *
   * Callers use this to decide whether to render citation chrome
   * (only `question` gets a "Context from pages …" footer).
   */
  intent: "question" | "chitchat" | "off-topic";
}

export interface RagSession {
  /** SHA-256 of the indexed PDF — also the cache key. */
  documentId: string;
  /** Total number of chunks indexed. */
  chunkCount: number;
  /** Run one question through the graph. */
  ask: (options: AskOptions) => Promise<AskResult>;
}

/**
 * How many chunks the LLM ultimately sees per question — i.e. the
 * size of the final top-K after reranking (when enabled) or after
 * RRF fusion alone (when disabled).
 *
 * Bumped from 3 → 6 after the retrieval probe showed the right chunk
 * sat at rank ~5 with the older bge-small embedder and got cut off
 * entirely at k=3 (see `tests/retrieval-debug/*.json`). 6 keeps the
 * LLM context modest (~4 KB at chunkSize=700) while giving the right
 * chunk a real chance of landing in scope.
 */
const FINAL_TOP_K = 6;
/**
 * How many candidates the hybrid retriever returns *before* the
 * cross-encoder reranks them down to {@link FINAL_TOP_K}. 3× the
 * final K is the standard rule of thumb: wide enough that a chunk
 * the embedder ranked weakly but is actually most relevant can
 * still reach the reranker, narrow enough that we don't pay
 * per-pair cross-encoder inference on obvious garbage.
 *
 * When the reranker is disabled (user flag, or model failed to
 * load) the hybrid retriever is built with `k = FINAL_TOP_K`
 * directly — no point fetching candidates we won't filter.
 */
const RERANK_CANDIDATE_K = FINAL_TOP_K * 3;
/**
 * How many candidates each underlying retriever fetches pre-fusion.
 *
 * 20 gives RRF generous overlap to work with: more chunks in each
 * ranking means a chunk picked up weakly by one retriever still has a
 * chance of surviving fusion when the other ranks it strongly. Cost
 * is negligible: BM25 returns a slice of a sorted in-memory list; the
 * dense store does a top-K reduction over cosine scores — both are
 * O(n) in chunk count regardless of k.
 */
const CANDIDATE_K = 20;

/**
 * Build a RAG session for the given PDF + models. Loads from the
 * IndexedDB cache when available; otherwise extracts, chunks, embeds,
 * and persists.
 */
export async function createRagSession(options: CreateSessionOptions): Promise<RagSession> {
  const { chatPipe, chatInfo, embedPipe, file, onIndexProgress } = options;

  const bytes = await file.arrayBuffer();
  const documentId = await sha256Hex(bytes);

  const embeddings = new TransformersJsEmbeddings({ pipeline: embedPipe });
  const chatModel = new TransformersJsChatModel({ pipeline: chatPipe, info: chatInfo });

  // ── Build (or load) the index ────────────────────────────────────
  const cached = await getCachedIndex(documentId);

  let chunks: Document<ChunkMetadata>[];
  let vectorStore: PackedVectorStore;

  if (cached) {
    chunks = cached.documents as Document<ChunkMetadata>[];
    vectorStore = PackedVectorStore.fromSnapshot(
      { documents: chunks, data: cached.vectors, hiddenSize: cached.hiddenSize },
      embeddings,
    );
  } else {
    onIndexProgress?.({ kind: "extract", phase: "text-layer", current: 0, total: 1 });
    const pages = await loadPdf(file, {
      onProgress: (info) => onIndexProgress?.({ kind: "extract", ...info }),
    });
    if (pages.length === 0) {
      throw new Error("No usable text in this PDF — try a different file.");
    }

    chunks = await chunkDocuments(pages, { chunkSize: 700, chunkOverlap: 100 });
    if (chunks.length === 0) {
      // Same error shape as the "no pages" branch above so the
      // AskPdf catch (which matches /no usable text/i) routes both
      // failure modes to the "scanned PDF" recovery card. Without
      // this match, an all-whitespace or all-glyph-fallback PDF would
      // build an empty index, look "indexed" successfully, and then
      // return "no relevant passages" for every question — a silent
      // failure that's easy to mistake for a model bug.
      throw new Error("No usable text in this PDF — chunking produced zero pieces.");
    }

    // Pre-embed in batches so we can stream progress to the UI. We
    // delegate the actual matmul to `Embeddings.embedDocuments`,
    // which handles batching internally, but report at the chunk
    // level so the user sees a moving bar.
    //
    // `BATCH = 4` is a deliberate tradeoff: bigger batches are
    // marginally faster on throughput but a typical 4-page PDF
    // chunks to ~10 pieces, which finishes in 1–2 batches under
    // BATCH=16 — the user sees the bar stuck at 0 % for several
    // seconds, then snap to 100 %. The WASM forward pass against
    // EmbeddingGemma int8 takes seconds *per batch* regardless of
    // size, so dropping to 4 trades a small throughput penalty for
    // a visibly advancing progress bar across small-to-medium PDFs.
    onIndexProgress?.({ kind: "embed", current: 0, total: chunks.length });
    const BATCH = 4;
    const vectors: number[][] = [];
    for (let i = 0; i < chunks.length; i += BATCH) {
      const slice = chunks.slice(i, i + BATCH);
      const batch = await embeddings.embedDocuments(slice.map((c) => c.pageContent));
      vectors.push(...batch);
      onIndexProgress?.({
        kind: "embed",
        current: Math.min(i + BATCH, chunks.length),
        total: chunks.length,
      });
      // Yield to a macrotask so React renders the progress update
      // before the next batch's WASM forward pass starts. Without
      // this the setState fires, the next batch synchronously
      // continues, and the browser never gets a paint window — the
      // bar visually freezes between updates.
      await new Promise<void>((r) => setTimeout(r, 0));
    }

    vectorStore = new PackedVectorStore(embeddings);
    await vectorStore.addVectors(vectors, chunks);

    // Snapshot for IndexedDB. Float32 round-trips natively.
    const snapshot = vectorStore.toSnapshot();
    if (snapshot) {
      void cacheIndex({
        documentId,
        documents: chunks,
        vectors: snapshot.data,
        hiddenSize: snapshot.hiddenSize,
      });
    }
  }

  // ── Wire retrievers + graph ──────────────────────────────────────
  //
  // Reranker presence flips the hybrid retriever's `k` between two
  // regimes:
  //   - reranker available + enabled → hybrid returns
  //     RERANK_CANDIDATE_K (~18) and the reranker rescores down to
  //     FINAL_TOP_K (6) before the LLM sees them.
  //   - reranker absent → hybrid returns FINAL_TOP_K directly; no
  //     point fetching candidates we won't filter.
  const reranker =
    options.rerankPipe && rerankEnabled() ? new CrossEncoderReranker(options.rerankPipe) : null;
  const hybridK = reranker ? RERANK_CANDIDATE_K : FINAL_TOP_K;

  const dense = buildDenseRetrieverFromStore(vectorStore, CANDIDATE_K);
  const sparse = buildBm25Retriever({ documents: chunks, k: CANDIDATE_K });
  const hybrid = new HybridRetriever({ dense, sparse, k: hybridK });
  const retriever = reranker
    ? new RerankingRetriever({
        base: hybrid,
        reranker,
        k: FINAL_TOP_K,
      })
    : hybrid;

  /**
   * "Document anchor" chunk(s) — always merged into the retrieve
   * result so the LLM has the document's header block in context
   * regardless of what the user asked.
   *
   * **Why**: identity questions like "whose résumé is this?" or
   * "what's the title of the report?" route through hybrid retrieval
   * but BGE/BM25 score them weakly against the title chunk (the
   * chunk says "Sumit Sahoo / Enterprise Architect", the query says
   * "whose résumé"). The title chunk lands at rank 7+ and falls off
   * the top-K, so the LLM has to guess from work-experience snippets
   * — producing "this seems to be about Solution Architects" instead
   * of "this is Sumit Sahoo's résumé".
   *
   * Anchoring the first chunk of the document fixes the failure
   * mode at near-zero cost: at most one extra chunk of context per
   * question, deduplicated against the fused top-K so we never send
   * the same chunk twice. The chunks array is already in document
   * order (page → ordinal) so `chunks[0]` is reliably the first
   * thing the user wrote.
   */
  const anchorChunks: Document<ChunkMetadata>[] = chunks.length > 0 ? [chunks[0]] : [];

  /**
   * Score the query against every chunk in the document in one pass.
   * Returns both the best-in-corpus score (off-topic gate input) and
   * a `chunkId → score` map (per-chunk filter input) so the graph
   * can apply both checks without re-embedding the query.
   *
   * Used by the graph's retrieve node as a cheap deterministic
   * safety net: small LLMs (SmolLM2-1.7B in our case) can't reliably
   * refuse to answer general-knowledge questions just from a "stay
   * grounded" system prompt — they happily emit the right answer
   * from training data and even fabricate a citation. A threshold
   * on the embedder's own scores catches this before the LLM gets
   * to invent.
   *
   * Embeddings are L2-normalised, so the dot product returned here
   * is cosine similarity in `[-1, 1]`. EmbeddingGemma typically lands
   * in `[0.3, 0.8]` for in-domain queries and well below `0.3` for
   * truly off-topic ones.
   */
  const scoreQueryRelevance = async (query: string): Promise<RelevanceContext> => {
    const queryVec = await embeddings.embedQuery(query);
    // Sweep the whole corpus in one shot — for our scale (a few
    // hundred chunks) this is microseconds and avoids embedding the
    // query twice. The store sorts by score descending, so the first
    // entry's score is the top.
    const all = await vectorStore.similaritySearchVectorWithScore(queryVec, vectorStore.size);
    const chunkScores = new Map<string, number>();
    let topScore = 0;
    for (const [doc, score] of all) {
      const meta = doc.metadata as ChunkMetadata;
      if (meta.chunkId) chunkScores.set(meta.chunkId, score);
      if (score > topScore) topScore = score;
    }
    return { topScore, chunkScores };
  };

  // The graph is built fresh per `ask` so the streaming `onToken`
  // callback is scoped to one question. Compiling LangGraph is cheap;
  // we don't share the compiled graph across questions.
  return {
    documentId,
    chunkCount: chunks.length,
    ask: async ({ question, onToken }) => {
      const graph = buildRagGraph({
        retriever,
        chatModel,
        scoreRelevance: scoreQueryRelevance,
        anchorChunks,
        onToken,
      });
      const result = (await graph.invoke({ question })) as RagState;
      return {
        answer: result.answer,
        citedPages: result.citedPages,
        intent: result.intent ?? "question",
      };
    },
  };
}
