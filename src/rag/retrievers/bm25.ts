/**
 * BM25 sparse retriever built on the LangChain community
 * `BM25Retriever`.
 *
 * BM25 catches the queries dense embeddings miss: exact phrases, rare
 * proper nouns, IDs, dates, and any keyword the embedder under-weighs.
 * Paired with the dense retriever via the hybrid (RRF) layer, this
 * gives noticeably better recall than either alone on real-world PDFs.
 *
 * **Case-insensitive indexing.** `@langchain/community`'s `BM25Retriever`
 * lowercases the query but keeps the corpus in its original case, and
 * the inlined scorer matches terms with a *case-sensitive* regex. The
 * result: query token `"sumit"` never matches corpus token `"Sumit"`,
 * so every capitalised word in the document is invisible to BM25 and
 * the only "hits" come from accidental substring matches (e.g. "is"
 * inside "Enterprise"). For a résumé this means BM25 ranks chunks
 * essentially by stopword overlap — adding "Sahoo" to a query gives
 * zero boost to the title block.
 *
 * Fix: index a lowercased *copy* of each chunk's `pageContent` so the
 * scorer sees query and corpus in the same case, then map results back
 * to the original-case `Document` by `chunkId` before returning. The
 * LLM still sees the original-case text downstream.
 */
import { BM25Retriever } from "@langchain/community/retrievers/bm25";
import { Document } from "@langchain/core/documents";
import {
  type BaseRetriever,
  BaseRetriever as BaseRetrieverClass,
} from "@langchain/core/retrievers";
import type { ChunkMetadata } from "../chunking.ts";

export interface Bm25RetrieverOptions {
  /** Chunk documents (page metadata preserved). */
  documents: Document<ChunkMetadata>[];
  /** Top-k for retrieval. Default 20 — the hybrid layer trims further. */
  k?: number;
}

class CaseInsensitiveBm25Retriever extends BaseRetrieverClass {
  static lc_name(): string {
    return "CaseInsensitiveBm25Retriever";
  }
  lc_namespace = ["cloakpdf", "rag", "retrievers", "bm25"];

  private inner: BaseRetriever;
  private byChunkId: Map<string, Document<ChunkMetadata>>;

  constructor(documents: Document<ChunkMetadata>[], k: number) {
    super();
    const lowered = documents.map(
      (d) =>
        new Document<ChunkMetadata>({
          pageContent: d.pageContent.toLowerCase(),
          metadata: d.metadata,
        }),
    );
    this.inner = BM25Retriever.fromDocuments(lowered, { k });
    this.byChunkId = new Map(documents.map((d) => [d.metadata.chunkId, d]));
  }

  async _getRelevantDocuments(query: string): Promise<Document[]> {
    const hits = (await this.inner.invoke(query)) as Document<ChunkMetadata>[];
    return hits.map((d) => this.byChunkId.get(d.metadata.chunkId) ?? d);
  }
}

export function buildBm25Retriever(options: Bm25RetrieverOptions): BaseRetriever {
  return new CaseInsensitiveBm25Retriever(options.documents, options.k ?? 20);
}
