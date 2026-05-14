/**
 * Registry of AI models used by Ask PDF.
 *
 * Two models load together: a small instruction-tuned chat LLM and a
 * tiny sentence-embedding model. The chat model answers questions; the
 * embedder powers the RAG retriever that picks which chunks of the PDF
 * to feed the chat model. Both run locally in the browser via
 * Transformers.js; weights are fetched from huggingface.co on first
 * use and cached in the browser's CacheStorage so repeat visits work
 * offline.
 *
 * Two flavours per id are possible — a default ("desktop-tier") in
 * `AI_MODELS` and an optional smaller variant in `MOBILE_OVERRIDES`.
 * Call sites should always go through {@link getModelInfo} rather than
 * read `AI_MODELS` directly so the right variant is picked for the
 * user's device.
 */
import type { PipelineType } from "@huggingface/transformers";
import { getDeviceMemoryGb, isMobileDevice } from "./device-memory.ts";

/** Stable id used in code to reference a model. */
export type AiModelId = "chat" | "embed";

export interface AiModelInfo {
  /** Stable id referenced by tools. */
  id: AiModelId;
  /** Short, user-facing name (shown in the consent dialog title). */
  displayName: string;
  /**
   * Hugging Face repository id passed to `pipeline(...)`.
   * Format: `<author>/<model>`.
   */
  repo: string;
  /** Transformers.js pipeline task. */
  task: PipelineType;
  /**
   * Approximate total download size in bytes — used to render a friendly
   * "~28 MB" hint before the download starts.
   */
  approxSizeBytes: number;
  /**
   * Approximate **peak RAM** the model occupies during inference, in
   * bytes. Used by `assessMemoryFit()` to gauge whether the user's
   * device can run the model without crashing the tab.
   */
  approxPeakRamBytes: number;
  /** One-liner shown under the model name in the consent dialog. */
  description: string;
  /** Short, concrete description of what this model handles well. */
  bestFor?: string;
  /** License string shown verbatim in the consent dialog. */
  license: string;
  /** Hugging Face model page URL. */
  modelUrl: string;
  /**
   * Pipeline options merged into the `pipeline(task, repo, {...})` call.
   * Use this to pin `dtype` (e.g. "q4f16") so we deterministically pull
   * the quantized weights instead of the full-precision ones.
   */
  pipelineOptions?: Record<string, unknown>;
}

/**
 * Desktop-tier defaults. Read these via {@link getModelInfo}; on a
 * memory-constrained device the matching entry in
 * {@link MOBILE_OVERRIDES} takes precedence.
 */
export const AI_MODELS: Record<AiModelId, AiModelInfo> = {
  chat: {
    id: "chat",
    displayName: "SmolLM2 (1.7B, instruct)",
    repo: "HuggingFaceTB/SmolLM2-1.7B-Instruct",
    task: "text-generation",
    // q4f16 weights are ~1.0 GB on disk. Peak RAM during inference
    // sits around 2.5 GB once the KV cache, embedding table, and ONNX
    // runtime overhead are accounted for. Runs well on desktops,
    // laptops, and tablets with ≥ 4 GB free; marginal on phones with
    // 6 GB total RAM.
    //
    // **History of swaps in this slot** (so future-us doesn't repeat
    // them). Same résumé fixture and prompt in each test:
    //
    //   - Qwen 2.5 0.5B / 1.5B   → broken ONNX (pure token noise)
    //   - Llama 3.2 1B           → severe extraction hallucinations
    //                              ("Gemini developed by Facebook" etc.)
    //   - Gemma 4 E2B            → same failure mode as Llama 1B —
    //                              lists generic AI categories
    //                              (Anthropic Claude, OpenAI GPT,
    //                              Docker, Kubernetes) none of which
    //                              appear in the chunks
    //   - SmolLM2-360M           → fabricated identifiers under load
    //   - SmolLM2-1.7B           → near-verbatim extraction (winner)
    //
    // The pattern that emerged across these tests: small instruct
    // models from Google / Meta optimise for conversational fluency
    // and fill in "plausible" answers from world knowledge. SmolLM2
    // alone in the small-model space stays close to the supplied
    // excerpts. Until that changes we hold the line at 1.7B.
    approxSizeBytes: 1024 * 1024 * 1024,
    approxPeakRamBytes: Math.round(2.5 * 1024 * 1024 * 1024),
    description:
      "Hugging Face's most capable sub-2 B chat model. Tuned to read the supplied document excerpts and answer from them, instead of guessing from general knowledge.",
    bestFor:
      "Answering questions about a PDF on desktops, laptops, and tablets with ≥ 4 GB free RAM.",
    license: "Apache 2.0",
    modelUrl: "https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct",
    pipelineOptions: { dtype: "q4f16" },
  },
  embed: {
    id: "embed",
    displayName: "bge-base-en-v1.5",
    repo: "Xenova/bge-base-en-v1.5",
    task: "feature-extraction",
    // ~140 MB on disk (q8), ~450 MB peak RAM. 4× the size of
    // bge-small but the 768-dim vectors give noticeably stronger
    // semantic match — bge-small was ranking the right chunk at #4
    // for the "what is this about?" query (the doc header chunk),
    // landing past the fused top-K. bge-base is one of the strongest
    // sub-200 MB embedders on MTEB and is what we'll feed every
    // device until we add a mobile-specific override.
    approxSizeBytes: 140 * 1024 * 1024,
    approxPeakRamBytes: 450 * 1024 * 1024,
    description:
      "BAAI's mid-size sentence-embedding model. Turns PDF chunks and your question into 768-dim vectors so we can retrieve the right pages before asking the chat model — a clear step up over bge-small on PDFs with overlapping section topics.",
    bestFor: "Semantic retrieval over English PDFs.",
    license: "MIT",
    modelUrl: "https://huggingface.co/Xenova/bge-base-en-v1.5",
    pipelineOptions: { dtype: "q8" },
  },
};

/**
 * Smaller variants used on memory-constrained devices (phones / tablets
 * with ≤ 4 GB total RAM). Only the chat model gets a swap today — the
 * embedder is already ~33 MB so there's nothing meaningful to swap to.
 *
 * Why these specific overrides:
 *   - SmolLM2-360M shares the prompt template, tokenizer, and decoding
 *     conventions of the 1.7 B, so the SYSTEM_PROMPT and ai-tasks.ts
 *     defaults written for the desktop model port cleanly. The 360 M's
 *     loop pathology on long answers is largely tamed now that the
 *     retriever pre-trims context with bge-small + RRF.
 */
const MOBILE_OVERRIDES: Partial<Record<AiModelId, AiModelInfo>> = {
  chat: {
    id: "chat",
    displayName: "SmolLM2 (360M, instruct)",
    repo: "HuggingFaceTB/SmolLM2-360M-Instruct",
    task: "text-generation",
    approxSizeBytes: 250 * 1024 * 1024,
    approxPeakRamBytes: 800 * 1024 * 1024,
    description:
      "Hugging Face's pocket-sized chat model. Loaded automatically on phones and other low-RAM devices where the 1.7 B variant won't fit.",
    bestFor: "Phones, tablets, and laptops with < 4 GB free RAM.",
    license: "Apache 2.0",
    modelUrl: "https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct",
    pipelineOptions: { dtype: "q4f16" },
  },
};

/**
 * Pick the right model variant for the current device. Falls through
 * to `AI_MODELS[id]` whenever there's no smaller override or the
 * heuristics decide the device has the headroom for the default.
 *
 * Heuristics (cheapest first):
 *   1. `navigator.deviceMemory` is the cleanest signal. Chrome / Edge /
 *      Opera return a quantised GB number; 4 GB and below routes to the
 *      mobile-tier model. Desktops with 8+ GB stay on the default.
 *   2. When the browser doesn't expose `deviceMemory` (Firefox, Safari),
 *      the UA-string `isMobileDevice()` check kicks in — phones get the
 *      smaller model; laptops/desktops keep the default.
 */
export function getModelInfo(id: AiModelId): AiModelInfo {
  const fallback = MOBILE_OVERRIDES[id];
  if (fallback && shouldUseMobileFallback()) return fallback;
  return AI_MODELS[id];
}

function shouldUseMobileFallback(): boolean {
  const gb = getDeviceMemoryGb();
  if (gb !== null) return gb <= 4;
  return isMobileDevice();
}

/** Format a byte count as e.g. "≈ 28 MB" for the consent dialog. */
export function formatApproxSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `≈ ${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  return `≈ ${Math.round(bytes / (1024 * 1024))} MB`;
}
