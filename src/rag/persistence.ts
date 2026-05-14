/**
 * IndexedDB-backed cache for the per-PDF RAG index.
 *
 * Stores chunked documents alongside their packed dense-vector matrix
 * keyed by the PDF's SHA-256. Reopening the same file skips text
 * extraction, chunking, and embedding entirely — the most expensive
 * parts of the pipeline. The BM25 side is re-built in memory from the
 * cached documents on load because it's cheap (tokenisation only).
 *
 * Eviction is LRU with a fixed cap (10 PDFs). The peak embeddings
 * size for ~500 pages is roughly 4 MB, so 10 ≈ 40 MB on disk — well
 * inside IndexedDB quotas across browsers.
 */
import { Document } from "@langchain/core/documents";

const DB_NAME = "cloakpdf-rag";
// Bump when the cached schema becomes incompatible with the current
// pipeline — e.g. swapping the embedder model (vectors are stale even
// though the dimension may match) or changing the chunking strategy.
//
//   v1: initial release with MiniLM-L6-v2 (Xenova/all-MiniLM-L6-v2).
//   v2: switched to bge-small-en-v1.5 (Xenova/bge-small-en-v1.5).
//       Both are 384-dim, so a naive cache hit would silently retrieve
//       against the wrong embedding space and return garbage chunks.
//   v3: switched to bge-base-en-v1.5 (Xenova/bge-base-en-v1.5).
//       768-dim — incompatible with v2's 384-dim packed vectors at the
//       struct level, but we drop the store on every upgrade anyway.
const DB_VERSION = 3;
const STORE_NAME = "index-cache";
const MAX_CACHED = 10;

export interface CachedIndex {
  /** SHA-256 of the source PDF bytes. */
  documentId: string;
  /** Chunked documents with page metadata. */
  documents: Document[];
  /** Packed `numDocs × hiddenSize` dense embeddings. */
  vectors: Float32Array;
  /** Per-row stride of `vectors`. */
  hiddenSize: number;
}

interface CacheRecord extends CachedIndex {
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
      // Schema bumps imply old data is incompatible (embedder or
      // chunking change). Drop and recreate the store so we never
      // hand stale vectors to a new embedding model.
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      const store = db.createObjectStore(STORE_NAME, { keyPath: "documentId" });
      store.createIndex("touchedAt", "touchedAt");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return _dbPromise;
}

/**
 * Fetch a cached index for `documentId`. Returns `null` on miss or
 * when IndexedDB is unavailable (Safari private mode, etc.).
 */
export async function getCachedIndex(documentId: string): Promise<CachedIndex | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const os = tx.objectStore(STORE_NAME);
    const req = os.get(documentId);
    req.onsuccess = () => {
      const rec = req.result as CacheRecord | undefined;
      if (!rec) {
        resolve(null);
        return;
      }
      rec.touchedAt = Date.now();
      os.put(rec);
      // Rehydrate `Document` instances — IndexedDB round-trips them as
      // plain objects, which would break LangChain's instanceof checks.
      resolve({
        documentId: rec.documentId,
        documents: rec.documents.map(
          (d) => new Document({ pageContent: d.pageContent, metadata: d.metadata }),
        ),
        vectors: rec.vectors,
        hiddenSize: rec.hiddenSize,
      });
    };
    req.onerror = () => resolve(null);
  });
}

/**
 * Persist an index. Best-effort; failures are swallowed so a full
 * IndexedDB doesn't break the user-visible flow.
 */
export async function cacheIndex(index: CachedIndex): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const os = tx.objectStore(STORE_NAME);
    // Document instances serialise to plain objects in IndexedDB —
    // that's fine, `getCachedIndex` re-wraps them on read.
    os.put({ ...index, touchedAt: Date.now() } satisfies CacheRecord);
    tx.oncomplete = () => {
      void evictOld();
      resolve();
    };
    tx.onerror = () => resolve();
  });
}

async function evictOld(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const os = tx.objectStore(STORE_NAME);
    const countReq = os.count();
    countReq.onsuccess = () => {
      const excess = countReq.result - MAX_CACHED;
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

/** Hex SHA-256 of the bytes — the cache key we use everywhere. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(hash);
  let hex = "";
  for (let i = 0; i < view.length; i++) hex += view[i].toString(16).padStart(2, "0");
  return hex;
}
