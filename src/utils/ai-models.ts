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
 * To swap either model, edit its entry below — every call site reads
 * its config from `AI_MODELS[id]` and won't otherwise care.
 */
import type { PipelineType } from "@huggingface/transformers";

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

export const AI_MODELS: Record<AiModelId, AiModelInfo> = {
  chat: {
    id: "chat",
    displayName: "SmolLM2 (360M, instruct)",
    repo: "HuggingFaceTB/SmolLM2-360M-Instruct",
    task: "text-generation",
    approxSizeBytes: 250 * 1024 * 1024,
    // Working figure for inference peak: ~200 MB weights expanded in
    // memory plus the KV cache and ONNX runtime overhead for a few
    // thousand tokens of context. Comfortable on phones.
    approxPeakRamBytes: 800 * 1024 * 1024,
    description:
      "Hugging Face's small chat model purpose-built for on-device inference. Fast, mobile-friendly, and reliable in Transformers.js.",
    bestFor: "Answering questions about a PDF on phones, tablets, and laptops with ≤ 8 GB RAM.",
    license: "Apache 2.0",
    modelUrl: "https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct",
    pipelineOptions: { dtype: "q4f16" },
  },
  embed: {
    id: "embed",
    displayName: "all-MiniLM-L6-v2",
    repo: "Xenova/all-MiniLM-L6-v2",
    task: "feature-extraction",
    approxSizeBytes: 25 * 1024 * 1024,
    approxPeakRamBytes: 80 * 1024 * 1024,
    description:
      "Compact sentence-embedding model. Turns PDF chunks and your question into 384-dim vectors so we can retrieve the right pages before asking the chat model.",
    bestFor: "Semantic retrieval over English PDFs.",
    license: "Apache 2.0",
    modelUrl: "https://huggingface.co/Xenova/all-MiniLM-L6-v2",
    pipelineOptions: { dtype: "q8" },
  },
};

/** Format a byte count as e.g. "≈ 28 MB" for the consent dialog. */
export function formatApproxSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `≈ ${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  return `≈ ${Math.round(bytes / (1024 * 1024))} MB`;
}
