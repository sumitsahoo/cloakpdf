/**
 * Unit tests for the in-memory side of the vector store. The IndexedDB
 * path is exercised via the e2e test (it needs a real browser DB); the
 * math we can verify here.
 */
import { describe, expect, it } from "vitest";
import { buildVectorStore, type PdfChunk, sha256Hex, topK } from "../../src/utils/vector-store.ts";

/** Unit-norm a vector so the cosine = dot product invariant holds. */
function normalised(values: number[]): Float32Array {
  const v = new Float32Array(values);
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const norm = Math.sqrt(sum) || 1;
  for (let i = 0; i < v.length; i++) v[i] = v[i] / norm;
  return v;
}

function chunk(pageNumber: number, ordinal: number, text: string): PdfChunk {
  return { pageNumber, ordinal, text };
}

describe("buildVectorStore", () => {
  it("packs per-chunk vectors into one contiguous Float32Array", () => {
    const chunks = [chunk(1, 0, "a"), chunk(1, 1, "b")];
    const vectors = [normalised([1, 0, 0]), normalised([0, 1, 0])];
    const store = buildVectorStore("doc-1", chunks, vectors);
    expect(store.hiddenSize).toBe(3);
    expect(store.vectors.length).toBe(6);
    // First row is [1,0,0], second is [0,1,0]
    expect(Array.from(store.vectors.slice(0, 3))).toEqual([1, 0, 0]);
    expect(Array.from(store.vectors.slice(3, 6))).toEqual([0, 1, 0]);
  });

  it("rejects mismatched chunk / vector lengths", () => {
    expect(() =>
      buildVectorStore("doc", [chunk(1, 0, "a")], [normalised([1]), normalised([0])]),
    ).toThrow(/length mismatch/);
  });

  it("rejects vectors with inconsistent hidden sizes", () => {
    expect(() =>
      buildVectorStore(
        "doc",
        [chunk(1, 0, "a"), chunk(1, 1, "b")],
        [normalised([1, 0, 0]), normalised([1, 0])],
      ),
    ).toThrow(/has length 2, expected 3/);
  });

  it("returns an empty store for zero chunks", () => {
    const store = buildVectorStore("doc", [], []);
    expect(store.chunks).toEqual([]);
    expect(store.vectors.length).toBe(0);
    expect(store.hiddenSize).toBe(0);
  });
});

describe("topK", () => {
  it("returns chunks ordered by cosine similarity", () => {
    const chunks = [chunk(1, 0, "north"), chunk(2, 1, "south"), chunk(3, 2, "east")];
    const vectors = [
      normalised([1, 0, 0]), // north
      normalised([0, 1, 0]), // south
      normalised([0, 0, 1]), // east
    ];
    const store = buildVectorStore("doc", chunks, vectors);

    // Query close to the "south" vector
    const query = normalised([0.1, 0.9, 0]);
    const hits = topK(store, query, 2);
    expect(hits.map((h) => h.chunk.text)).toEqual(["south", "north"]);
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
  });

  it("caps results at the requested k", () => {
    const chunks = [chunk(1, 0, "a"), chunk(2, 1, "b"), chunk(3, 2, "c")];
    const vectors = [normalised([1, 0]), normalised([0, 1]), normalised([1, 1])];
    const store = buildVectorStore("doc", chunks, vectors);
    const hits = topK(store, normalised([1, 0]), 2);
    expect(hits).toHaveLength(2);
  });

  it("returns nothing on dimension mismatch", () => {
    const chunks = [chunk(1, 0, "a")];
    const vectors = [normalised([1, 0, 0])];
    const store = buildVectorStore("doc", chunks, vectors);
    const hits = topK(store, normalised([1, 0]), 5);
    expect(hits).toEqual([]);
  });

  it("returns nothing when the store is empty", () => {
    const store = buildVectorStore("doc", [], []);
    expect(topK(store, new Float32Array(3), 5)).toEqual([]);
  });
});

describe("sha256Hex", () => {
  it("produces the canonical SHA-256 hex digest", async () => {
    const bytes = new TextEncoder().encode("hello").buffer;
    const digest = await sha256Hex(bytes);
    // Reference digest of "hello"
    expect(digest).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("changes when the bytes change", async () => {
    const a = await sha256Hex(new TextEncoder().encode("foo").buffer);
    const b = await sha256Hex(new TextEncoder().encode("bar").buffer);
    expect(a).not.toBe(b);
  });
});
