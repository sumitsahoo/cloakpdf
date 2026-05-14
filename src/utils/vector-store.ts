/**
 * Tiny in-memory + IndexedDB-backed vector store for the Ask PDF RAG
 * pipeline.
 *
 * Design:
 *
 *   - A `VectorStore` is one PDF worth of chunk vectors + metadata.
 *     Vectors are packed into a single `Float32Array` of shape
 *     `[numChunks × hiddenSize]` so cosine top-K is a single pass
 *     over contiguous memory — no per-chunk object dereferences.
 *   - Embeddings are pre-normalised by {@link runEmbed} (`normalize:
 *     true`), so cosine similarity reduces to a dot product. That
 *     means top-K is `O(numChunks × hiddenSize)` math and nothing
 *     else.
 *   - Stores are cached in IndexedDB keyed by the PDF's SHA-256.
 *     Reopening the same file skips extraction + embedding entirely.
 *     LRU cap (~10 PDFs) keeps the cache from growing without bound.
 *
 * `Float32Array` was picked over `Uint8Array` quantization on purpose:
 * the math is well-supported in TypedArray-aware browsers, IndexedDB
 * round-trips the buffer natively, and 384 dims × 4 bytes × ~2500
 * chunks for a 500-page PDF is only ~4 MB — small enough that the
 * complexity of quantization isn't worth the savings.
 */

/**
 * One chunk of PDF text with the metadata needed to (a) build a prompt
 * with citations and (b) show the user where an answer came from.
 */
export interface PdfChunk {
  /** 1-based page number this chunk came from. */
  pageNumber: number;
  /** Zero-based ordinal among the chunks the document was split into. */
  ordinal: number;
  /** The chunk text fed to the embedder and surfaced to the LLM. */
  text: string;
}

export interface VectorStore {
  /** SHA-256 of the source PDF — used as the IndexedDB cache key. */
  documentId: string;
  /** Per-chunk metadata, ordered to match {@link vectors}. */
  chunks: PdfChunk[];
  /** Packed `numChunks × hiddenSize` row-major embedding matrix. */
  vectors: Float32Array;
  /** Embedding dimensionality (e.g. 384 for MiniLM). */
  hiddenSize: number;
}

export interface RetrievalHit {
  chunk: PdfChunk;
  /** Cosine similarity in `[-1, 1]` — higher is better. */
  score: number;
}

/**
 * Build an in-memory {@link VectorStore} from per-chunk embeddings.
 * Caller is responsible for chunking and embedding; this just packs
 * the vectors into a contiguous buffer.
 */
export function buildVectorStore(
  documentId: string,
  chunks: PdfChunk[],
  vectors: Float32Array[],
): VectorStore {
  if (chunks.length !== vectors.length) {
    throw new Error(`chunks (${chunks.length}) and vectors (${vectors.length}) length mismatch`);
  }
  if (chunks.length === 0) {
    return { documentId, chunks: [], vectors: new Float32Array(0), hiddenSize: 0 };
  }
  const hiddenSize = vectors[0].length;
  const packed = new Float32Array(chunks.length * hiddenSize);
  for (let i = 0; i < vectors.length; i++) {
    if (vectors[i].length !== hiddenSize) {
      throw new Error(`vector ${i} has length ${vectors[i].length}, expected ${hiddenSize}`);
    }
    packed.set(vectors[i], i * hiddenSize);
  }
  return { documentId, chunks, vectors: packed, hiddenSize };
}

/**
 * Return the `k` chunks whose vectors are most similar to `query`.
 *
 * Inputs are assumed to be unit-norm (the embedder normalises), so the
 * cosine similarity collapses to a plain dot product — one tight loop
 * over the packed matrix.
 */
export function topK(store: VectorStore, query: Float32Array, k: number): RetrievalHit[] {
  if (store.chunks.length === 0 || query.length !== store.hiddenSize) return [];
  const n = store.chunks.length;
  const dim = store.hiddenSize;
  const scores = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let dot = 0;
    const base = i * dim;
    for (let j = 0; j < dim; j++) dot += store.vectors[base + j] * query[j];
    scores[i] = dot;
  }
  // Pull the top-k via a partial selection — cheaper than sorting all
  // scores when n >> k, which is the common case (k=6, n~thousands).
  const indices = Array.from({ length: n }, (_, i) => i);
  indices.sort((a, b) => scores[b] - scores[a]);
  const out: RetrievalHit[] = [];
  for (let i = 0; i < Math.min(k, n); i++) {
    out.push({ chunk: store.chunks[indices[i]], score: scores[indices[i]] });
  }
  return out;
}

// ── IndexedDB cache ───────────────────────────────────────────────

const DB_NAME = "cloakpdf-rag";
const DB_VERSION = 1;
const STORE_NAME = "stores";
/**
 * Cap on the number of PDF stores we keep in IndexedDB. LRU eviction
 * runs after each write. The peak embeddings size for ~500 pages is
 * around 4 MB, so 10 ≈ 40 MB on disk — well within IndexedDB quotas.
 */
const MAX_CACHED_STORES = 10;

/** Persisted shape — same as {@link VectorStore} plus a touched-at. */
interface CachedStoreRecord {
  documentId: string;
  chunks: PdfChunk[];
  vectors: Float32Array;
  hiddenSize: number;
  /** Epoch millis — bumped on every read so LRU eviction works. */
  touchedAt: number;
}

let _dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "documentId" });
        store.createIndex("touchedAt", "touchedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return _dbPromise;
}

/**
 * Try to fetch a cached store for `documentId`. Returns `null` on
 * miss or when IndexedDB isn't available (Safari private mode, etc.).
 */
export async function getCachedStore(documentId: string): Promise<VectorStore | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(documentId);
    req.onsuccess = () => {
      const rec = req.result as CachedStoreRecord | undefined;
      if (!rec) {
        resolve(null);
        return;
      }
      // Touch so LRU keeps recently-used files alive.
      rec.touchedAt = Date.now();
      store.put(rec);
      resolve({
        documentId: rec.documentId,
        chunks: rec.chunks,
        vectors: rec.vectors,
        hiddenSize: rec.hiddenSize,
      });
    };
    req.onerror = () => resolve(null);
  });
}

/**
 * Persist a vector store. Best-effort; failures are swallowed so a
 * full IndexedDB doesn't break the user-visible flow (we still have
 * the store in memory and can answer this session's questions).
 */
export async function cacheStore(store: VectorStore): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const os = tx.objectStore(STORE_NAME);
    const rec: CachedStoreRecord = {
      documentId: store.documentId,
      chunks: store.chunks,
      vectors: store.vectors,
      hiddenSize: store.hiddenSize,
      touchedAt: Date.now(),
    };
    os.put(rec);
    tx.oncomplete = () => {
      void evictOldStores();
      resolve();
    };
    tx.onerror = () => resolve();
  });
}

/**
 * LRU eviction. Keeps at most {@link MAX_CACHED_STORES} entries by
 * dropping the oldest `touchedAt` values when the cache overflows.
 */
async function evictOldStores(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const os = tx.objectStore(STORE_NAME);
    const countReq = os.count();
    countReq.onsuccess = () => {
      const excess = countReq.result - MAX_CACHED_STORES;
      if (excess <= 0) {
        resolve();
        return;
      }
      const cursorReq = os.index("touchedAt").openCursor();
      let removed = 0;
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || removed >= excess) {
          resolve();
          return;
        }
        cursor.delete();
        removed += 1;
        cursor.continue();
      };
      cursorReq.onerror = () => resolve();
    };
    countReq.onerror = () => resolve();
  });
}

// ── Hashing helper ────────────────────────────────────────────────

/**
 * Hex SHA-256 of the bytes — used as the document key into the
 * vector-store cache. Stable across browsers and orderings.
 */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(hash);
  let hex = "";
  for (let i = 0; i < view.length; i++) hex += view[i].toString(16).padStart(2, "0");
  return hex;
}
