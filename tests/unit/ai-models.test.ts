/**
 * Unit tests for the chat-tier registry + picker helpers in
 * `src/utils/ai-models.ts`.
 *
 * What we want to pin down:
 *
 *   - Every chat tier ships with `generationParams` (the chat-model
 *     adapter reads them on construction — a missing field would
 *     silently fall through to the neutral fallbacks and break tier-
 *     specific tuning).
 *   - LFM2 variants use `minP` (their documented sampler), SmolLM2
 *     uses `topP` + `noRepeatNgramSize` (its lexical-ramp-loop
 *     crutch). Mixing these up would either over-constrain the
 *     LFM2 distribution or remove SmolLM2's loop breaker.
 *   - The first-visit default is a static choice (we don't probe
 *     `navigator.deviceMemory` — Chrome caps it at 8 GB so the
 *     signal is misleading). Compact is the safe pick that fits
 *     any device we'd let near this tool.
 *   - localStorage persistence round-trips: a stored choice survives
 *     a fresh `getActiveChatVariant()` call, invalid stored values
 *     fall back to the default rather than crashing.
 *   - `migrateLegacyChatReadyFlag` doesn't double-fire or trample
 *     an existing preference.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AI_MODELS,
  CHAT_VARIANT_IDS,
  CHAT_VARIANT_TIER_LABEL,
  type ChatVariantId,
  getActiveChatModelId,
  getActiveChatVariant,
  getChatModelId,
  getDefaultChatVariant,
  migrateLegacyChatReadyFlag,
  setActiveChatVariant,
} from "../../src/utils/ai-models.ts";

/** Build a fresh in-memory localStorage shim per test. */
function makeStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, String(v));
    },
    removeItem: (k) => {
      data.delete(k);
    },
    key: (i) => Array.from(data.keys())[i] ?? null,
  } satisfies Storage;
}

beforeEach(() => {
  // Fresh empty storage per test so localStorage assertions don't
  // bleed across cases.
  vi.stubGlobal("localStorage", makeStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AI_MODELS chat-tier registry", () => {
  it("ships exactly the two documented chat variants", () => {
    // Sanity guard so a future "add a tier" PR also adds it to the
    // picker order, the tier-label map, and AI_MODELS in lockstep —
    // forgetting one would leak through here.
    expect(CHAT_VARIANT_IDS).toEqual(["lfm2.5-1.2b", "lfm2-2.6b"]);
    expect(AI_MODELS["chat:lfm2.5-1.2b"].repo).toBe("LiquidAI/LFM2.5-1.2B-Instruct-ONNX");
    for (const v of CHAT_VARIANT_IDS) {
      expect(CHAT_VARIANT_TIER_LABEL[v]).toBeTruthy();
      expect(AI_MODELS[getChatModelId(v)]).toBeDefined();
    }
  });

  it("every chat tier carries generationParams the adapter reads", () => {
    for (const v of CHAT_VARIANT_IDS) {
      const info = AI_MODELS[getChatModelId(v)];
      expect(info.generationParams).toBeDefined();
      expect(info.generationParams?.maxNewTokens).toBeGreaterThan(0);
      expect(info.generationParams?.temperature).toBeGreaterThan(0);
      expect(info.generationParams?.repetitionPenalty).toBeGreaterThanOrEqual(1);
    }
  });

  it("LFM2 variants ship Liquid AI's min_p sampler, not top_p", () => {
    for (const v of ["lfm2.5-1.2b", "lfm2-2.6b"] as const) {
      const params = AI_MODELS[getChatModelId(v)].generationParams;
      expect(params?.minP).toBeDefined();
      expect(params?.topP).toBeUndefined();
      // Liquid's recipe already discourages tight loops, so the
      // repetition penalty stays soft. Lock the upper bound so we
      // notice if a future change cranks it up to SmolLM2 territory
      // (1.15) — that would suppress legit phrase reuse.
      expect(params?.repetitionPenalty).toBeLessThan(1.1);
    }
  });

  it("every entry's id matches its registry key", () => {
    // Self-consistency check — entries are keyed by id, but the id
    // also lives inside the entry. A typo on either side would
    // produce a confusing "tier swaps to itself" bug in the picker.
    for (const [key, info] of Object.entries(AI_MODELS)) {
      expect(info.id).toBe(key);
    }
  });
});

describe("getChatModelId", () => {
  it("prefixes the variant slug with the chat role", () => {
    expect(getChatModelId("lfm2.5-1.2b")).toBe("chat:lfm2.5-1.2b");
    expect(getChatModelId("lfm2-2.6b")).toBe("chat:lfm2-2.6b");
  });
});

describe("getDefaultChatVariant", () => {
  it("returns Compact (LFM2.5-1.2B) as the static first-visit default", () => {
    // The choice deliberately ignores `navigator.deviceMemory`
    // (capped at 8 GB on Chrome, missing on Firefox/Safari) — see
    // the function's jsdoc for rationale. Locking the expected
    // value here means a future refactor that re-adds the broken
    // RAM signal will fail this test loudly.
    expect(getDefaultChatVariant()).toBe("lfm2.5-1.2b");
  });
});

describe("getActiveChatVariant / setActiveChatVariant", () => {
  it("returns the static default when nothing is stored", () => {
    expect(getActiveChatVariant()).toBe("lfm2.5-1.2b");
  });

  it("round-trips a persisted choice", () => {
    setActiveChatVariant("lfm2-2.6b");
    expect(getActiveChatVariant()).toBe("lfm2-2.6b");
  });

  it("ignores garbage stored values rather than crashing", () => {
    // Future schema change or a manually-poked localStorage entry
    // shouldn't blow up the picker — fall back to the default.
    vi.stubGlobal(
      "localStorage",
      makeStorage({ "cloakpdf:chat-variant": "definitely-not-a-tier" }),
    );
    expect(getActiveChatVariant()).toBe("lfm2.5-1.2b");
  });

  it("setActiveChatVariant writes the key the reader looks for", () => {
    const storage = makeStorage();
    vi.stubGlobal("localStorage", storage);
    setActiveChatVariant("lfm2.5-1.2b");
    expect(storage.getItem("cloakpdf:chat-variant")).toBe("lfm2.5-1.2b");
  });

  it("getActiveChatModelId composes the prefix correctly", () => {
    setActiveChatVariant("lfm2-2.6b");
    expect(getActiveChatModelId()).toBe("chat:lfm2-2.6b");
  });
});

describe("migrateLegacyChatReadyFlag (cleanup-only since SmolLM2 dropped)", () => {
  it("removes the legacy chat-ready flag", () => {
    const storage = makeStorage({ "cloakpdf:ai-model-ready:chat": "1" });
    vi.stubGlobal("localStorage", storage);

    migrateLegacyChatReadyFlag();

    expect(storage.getItem("cloakpdf:ai-model-ready:chat")).toBeNull();
  });

  it("removes the SmolLM2-specific variant-suffixed flag (orphan after tier dropped)", () => {
    const storage = makeStorage({ "cloakpdf:ai-model-ready:chat:smollm2-1.7b": "1" });
    vi.stubGlobal("localStorage", storage);

    migrateLegacyChatReadyFlag();

    expect(storage.getItem("cloakpdf:ai-model-ready:chat:smollm2-1.7b")).toBeNull();
  });

  it("clears a stale variant preference pointing at the dropped SmolLM2 tier", () => {
    // Without this clear, `getActiveChatVariant` would read the
    // smollm2-1.7b slug, find it not in CHAT_VARIANT_IDS, and
    // (correctly) fall back — but leaving the orphan around
    // pollutes localStorage with a value that'll never be valid.
    const storage = makeStorage({ "cloakpdf:chat-variant": "smollm2-1.7b" });
    vi.stubGlobal("localStorage", storage);

    migrateLegacyChatReadyFlag();

    expect(storage.getItem("cloakpdf:chat-variant")).toBeNull();
  });

  it("preserves a current-tier variant preference unchanged", () => {
    const storage = makeStorage({ "cloakpdf:chat-variant": "lfm2-2.6b" });
    vi.stubGlobal("localStorage", storage);

    migrateLegacyChatReadyFlag();

    expect(storage.getItem("cloakpdf:chat-variant")).toBe("lfm2-2.6b");
  });

  it("is a no-op on a fresh profile", () => {
    const storage = makeStorage();
    vi.stubGlobal("localStorage", storage);
    migrateLegacyChatReadyFlag();
    // No keys created, no errors.
    expect(storage.getItem("cloakpdf:chat-variant")).toBeNull();
  });

  it("is idempotent under repeated calls", () => {
    const storage = makeStorage({
      "cloakpdf:ai-model-ready:chat": "1",
      "cloakpdf:ai-model-ready:chat:smollm2-1.7b": "1",
    });
    vi.stubGlobal("localStorage", storage);

    migrateLegacyChatReadyFlag();
    migrateLegacyChatReadyFlag();
    migrateLegacyChatReadyFlag();

    expect(storage.getItem("cloakpdf:ai-model-ready:chat")).toBeNull();
    expect(storage.getItem("cloakpdf:ai-model-ready:chat:smollm2-1.7b")).toBeNull();
  });
});

describe("type guards", () => {
  it("ChatVariantId is exhaustive against AI_MODELS chat entries", () => {
    // Compile-time guard: forces every ChatVariantId to correspond
    // to an AI_MODELS entry. Adding a new variant means updating
    // both — the type system catches it if not.
    const allVariants: ChatVariantId[] = ["lfm2.5-1.2b", "lfm2-2.6b"];
    for (const v of allVariants) {
      expect(AI_MODELS[getChatModelId(v)].id).toBe(getChatModelId(v));
    }
  });
});
