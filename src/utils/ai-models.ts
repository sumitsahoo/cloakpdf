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
    displayName: "Qwen2.5 (1.5B, instruct)",
    repo: "onnx-community/Qwen2.5-1.5B-Instruct",
    task: "text-generation",
    // q4f16 weights are ~0.9 GB on disk. Peak RAM during inference
    // sits around 2.5–3 GB once the KV cache, embedding table, and
    // ONNX runtime overhead are accounted for — comfortably under
    // 4 GB so the tool still runs on tablets and mid-range laptops,
    // marginal on phones with 6 GB total RAM.
    approxSizeBytes: 900 * 1024 * 1024,
    approxPeakRamBytes: 3 * 1024 * 1024 * 1024,
    description:
      "Alibaba's Qwen 2.5 1.5B instruct model — strong at answering questions grounded in supplied document excerpts, with markedly better reasoning than the 300–500 M tier we used before.",
    bestFor:
      "Answering questions about a PDF on desktops, laptops, and tablets with ≥ 4 GB free RAM.",
    license: "Apache 2.0",
    modelUrl: "https://huggingface.co/onnx-community/Qwen2.5-1.5B-Instruct",
    pipelineOptions: { dtype: "q4f16" },
  },
  embed: {
    id: "embed",
    displayName: "bge-small-en-v1.5",
    repo: "Xenova/bge-small-en-v1.5",
    task: "feature-extraction",
    // ~33 MB on disk (q8). Slightly bigger than MiniLM-L6 (~25 MB)
    // but worth it: BAAI's BGE family scores ~6 points higher on
    // MTEB at the same 384 dimensions, and on real PDFs (see
    // tests/retrieval-debug/) MiniLM was demonstrably ranking the
    // obviously-correct chunks at #5 instead of #1, dragging the
    // fusion top-K with it.
    approxSizeBytes: 33 * 1024 * 1024,
    approxPeakRamBytes: 110 * 1024 * 1024,
    description:
      "BAAI's compact sentence-embedding model. Turns PDF chunks and your question into 384-dim vectors so we can retrieve the right pages before asking the chat model — measurably better grounding than the older MiniLM family.",
    bestFor: "Semantic retrieval over English PDFs.",
    license: "MIT",
    modelUrl: "https://huggingface.co/Xenova/bge-small-en-v1.5",
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
