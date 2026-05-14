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
import { Document } from "@langchain/core/documents";
import type { AiPipeline } from "../utils/ai-runtime.ts";
import { TransformersJsChatModel } from "./chat-model.ts";
import { type ChunkMetadata, chunkDocuments } from "./chunking.ts";
import { TransformersJsEmbeddings } from "./embeddings.ts";
import { buildRagGraph, type RagState } from "./graph.ts";
import { loadPdf } from "./pdf-loader.ts";
import { cacheIndex, getCachedIndex, sha256Hex } from "./persistence.ts";
import { buildBm25Retriever } from "./retrievers/bm25.ts";
import { buildDenseRetrieverFromStore } from "./retrievers/dense.ts";
import { HybridRetriever } from "./retrievers/hybrid.ts";
import { PackedVectorStore } from "./vector-store.ts";

export interface CreateSessionOptions {
  /** Resolved Transformers.js `text-generation` pipeline. */
  chatPipe: AiPipeline;
  /** Resolved Transformers.js `feature-extraction` pipeline. */
  embedPipe: AiPipeline;
  /** The PDF the session indexes and answers questions about. */
  file: File;
  /**
   * Reports progress through extraction → chunking → embedding so the
   * UI can render a determinate progress bar.
   */
  onIndexProgress?: (info: IndexingProgress) => void;
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
  intent: "question" | "chitchat";
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
 * How many chunks the hybrid retriever surfaces per query.
 *
 * Bumped from 3 → 6 after the retrieval probe showed the right chunk
 * sat at rank ~5 in MiniLM-L6 and got cut off entirely at k=3 (see
 * `tests/retrieval-debug/*.json`). 6 keeps the LLM context modest
 * (~4 KB at chunkSize=700) while giving the right chunk a real chance
 * of landing in scope. When we add a cross-encoder reranker we can
 * drop this back down — the reranker is a strict upgrade over RRF's
 * top-k slice and 3 reranked chunks beats 6 fused ones.
 */
const HYBRID_TOP_K = 6;
/**
 * How many candidates each underlying retriever fetches pre-fusion.
 *
 * Bumped from 12 → 20 so RRF has more rope when MiniLM ranks the
 * right chunk weakly. Cost is negligible: BM25 returns a slice of a
 * sorted in-memory list; the dense store does a top-K reduction over
 * cosine scores — both are O(n) in chunk count regardless of k.
 */
const CANDIDATE_K = 20;

/**
 * Build a RAG session for the given PDF + models. Loads from the
 * IndexedDB cache when available; otherwise extracts, chunks, embeds,
 * and persists.
 */
export async function createRagSession(options: CreateSessionOptions): Promise<RagSession> {
  const { chatPipe, embedPipe, file, onIndexProgress } = options;

  const bytes = await file.arrayBuffer();
  const documentId = await sha256Hex(bytes);

  const embeddings = new TransformersJsEmbeddings({ pipeline: embedPipe });
  const chatModel = new TransformersJsChatModel({ pipeline: chatPipe });

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
      throw new Error("Document chunked to zero pieces — text may be too sparse.");
    }

    // Pre-embed in batches so we can stream progress to the UI. We
    // delegate the actual matmul to `Embeddings.embedDocuments`,
    // which handles batching internally, but report at the chunk
    // level so the user sees a moving bar.
    onIndexProgress?.({ kind: "embed", current: 0, total: chunks.length });
    const BATCH = 32;
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
  const dense = buildDenseRetrieverFromStore(vectorStore, CANDIDATE_K);
  const sparse = buildBm25Retriever({ documents: chunks, k: CANDIDATE_K });
  const retriever = new HybridRetriever({ dense, sparse, k: HYBRID_TOP_K });

  // The graph is built fresh per `ask` so the streaming `onToken`
  // callback is scoped to one question. Compiling LangGraph is cheap;
  // we don't share the compiled graph across questions.
  return {
    documentId,
    chunkCount: chunks.length,
    ask: async ({ question, onToken }) => {
      const graph = buildRagGraph({ retriever, chatModel, onToken });
      const result = (await graph.invoke({ question })) as RagState;
      return {
        answer: result.answer,
        citedPages: result.citedPages,
        intent: result.intent ?? "question",
      };
    },
  };
}
