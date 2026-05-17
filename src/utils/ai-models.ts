/**
 * Registry of AI models used by Ask PDF.
 *
 * Three models load together: a small instruction-tuned chat LLM, a
 * tiny sentence-embedding model, and a cross-encoder reranker. The
 * chat model answers questions; the embedder powers the RAG retriever
 * that picks which chunks of the PDF to feed the chat model; the
 * reranker re-scores the retriever's top candidates so the most
 * relevant chunks land at the front of the context window. All three
 * run locally in the browser via Transformers.js; weights are fetched
 * from huggingface.co on first use and cached in the browser's
 * CacheStorage so repeat visits work offline.
 *
 * The chat slot ships **two tiers** (see {@link CHAT_VARIANT_IDS}),
 * both from Liquid AI's LFM family:
 *
 *   - `lfm2.5-1.2b` — Compact: ~810 MB / ~2 GB peak. Liquid AI's
 *     latest 1.2B hybrid (LFM2.5 = LFM2 base + extended pretraining
 *     + RL post-training). The static default for fresh visitors.
 *   - `lfm2-2.6b` — Quality: ~1.55 GB / ~3.5 GB peak. Liquid AI's
 *     larger hybrid; purpose-built for on-device structured extraction
 *     and RAG. Liquid hasn't shipped a 2.6 B variant of LFM2.5 yet, so
 *     this tier stays on the LFM2 build. Recommended on ≥ 8 GB free RAM.
 *
 * **Why no SmolLM2 tier any more.** SmolLM2-1.7B was the historical
 * default and shipped briefly as a "Balanced" middle tier alongside
 * the two LFM tiers. The cross-tier e2e comparison (résumé fixture,
 * same prompts) showed it was the slowest of the three on real
 * model-inference questions *and* the most prone to embellishing
 * answers with items that weren't in the document — losing on both
 * speed and grounding. The fast-paths in `src/rag/fast-paths.ts`
 * still carry SmolLM2-specific defensive guards in their comments
 * (don't mistake those for "SmolLM2 is still wired in" — the guards
 * help the LFM models too, since the failure modes generalise).
 *
 * The Ask PDF tool is gated to non-mobile devices (see
 * `tool.desktopOnly` in `tool-registry.ts`), so this registry only
 * carries the desktop-tier models — no mobile-fallback variants.
 * Call sites should go through {@link getModelInfo} rather than read
 * `AI_MODELS` directly.
 */
import type { PipelineType } from "@huggingface/transformers";

/**
 * Stable id used in code to reference a model. Chat ids carry the
 * variant suffix so the pipeline cache (in ai-runtime.ts) keys
 * correctly when the user switches tiers — without the suffix two
 * variants would share one cache slot and clobber each other.
 */
export type AiModelId = "chat:lfm2.5-1.2b" | "chat:lfm2-2.6b" | "embed" | "rerank";

/**
 * Just the chat-variant slugs — used by the picker UI which doesn't
 * need to know about the `chat:` prefix.
 */
export type ChatVariantId = "lfm2.5-1.2b" | "lfm2-2.6b";

/** Convert a chat variant slug to its full {@link AiModelId}. */
export function getChatModelId(variant: ChatVariantId): AiModelId {
  return `chat:${variant}`;
}

/**
 * Sampling defaults for the chat pipeline. Co-located with the model
 * entry so each tier's params travel with it — the chat-model adapter
 * reads these straight off `AiModelInfo` rather than carrying its own
 * per-model conditional. Add a new tier → fill these in once → done.
 *
 * Only `min_p` *or* `top_p` should be set per variant: they're both
 * sampling-cutoff filters and stacking them tends to over-constrain
 * the distribution. `no_repeat_ngram_size` is the lexical-loop
 * crutch — `0` / `undefined` disables it.
 */
export interface ChatGenerationParams {
  /** Per-call cap on tokens emitted. */
  maxNewTokens: number;
  /** Sampling temperature. Lower = more deterministic / extractive. */
  temperature: number;
  /** Nucleus sampling cutoff. Mutually exclusive with `minP`. */
  topP?: number;
  /** Min-p sampling cutoff (Liquid AI's default sampler). */
  minP?: number;
  /** Repetition penalty. 1.0 disables. */
  repetitionPenalty: number;
  /**
   * Bans repeated n-grams of this size. Catches lexically-varied loops
   * the repetition penalty misses. 0 / undefined disables.
   */
  noRepeatNgramSize?: number;
}

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
   * bytes. Surfaced verbatim in the AI Model Details dialog so users
   * can compare against their own machine — we intentionally don't
   * read `navigator.deviceMemory` to auto-diagnose fit (Chrome caps
   * the signal at 8 GB for privacy, so it's useless above that),
   * preferring to inform plainly and let the user decide.
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
  /**
   * Generation defaults for chat models (omitted on the embedder).
   * The chat-model adapter reads these on construction; UI overrides
   * (e.g. a "creative" toggle, were we to add one) would layer on top.
   */
  generationParams?: ChatGenerationParams;
}

// ── Chat-variant entries ────────────────────────────────────────────
//
// **History of swaps in the chat slot** (so future-us doesn't repeat
// them). Each candidate was tested against the same résumé fixture
// and prompt set in `tests/e2e/ai-tools.e2e.ts`:
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
//   - SmolLM3-3B (q4f16)     → hybrid-reasoning model emits
//                              unclosed `<think>` tags + catastrophic
//                              repetition loops on open-ended questions
//   - SmolLM2-1.7B           → kept briefly as the Balanced tier;
//                              dropped after the LFM2-vs-LFM2.5 e2e
//                              comparison showed it was the slowest
//                              of three tested *and* most prone to
//                              embellishment (mentioning Zed/Affinity
//                              etc. that aren't in the source). The
//                              fast-paths in `src/rag/fast-paths.ts`
//                              still carry SmolLM2-shaped guards
//                              because the failure modes generalise.
//   - LFM2-1.2B (q4f16)      → first LFM family entry in this slot;
//                              superseded by LFM2.5-1.2B-Instruct
//                              once the .5 release shipped its ONNX.
//
// The pattern across all the failed swaps: small instruct models
// from Google / Meta / Alibaba optimise for conversational fluency
// and confidently fill "plausible" answers from world knowledge.
// Liquid AI's LFM family is the only one we've found in this size
// class that consistently stays anchored to the supplied excerpts.

const CHAT_LFM2_5_1_2B: AiModelInfo = {
  id: "chat:lfm2.5-1.2b",
  displayName: "LFM2.5 (1.2B, instruct, Liquid AI)",
  repo: "LiquidAI/LFM2.5-1.2B-Instruct-ONNX",
  task: "text-generation",
  // ~810 MB on disk at q4 (`model_q4.onnx_data` 850 MB on HF +
  // tokenizer/configs ~3 MB; the q4 weights count toward both disk
  // and RAM), ~2 GB peak RAM. Same hybrid architecture as LFM2-1.2B
  // (10-conv + 6-attention) but newer training recipe (extended
  // pretraining + RL post-training) — Liquid markets LFM2.5 as the
  // latest of the family. We pin `dtype: "q4"` (plain int4 with fp32
  // activations) because it's the WebGPU-validated quant on this repo;
  // q4f16 *is* shipped now (760 MB) but introduces fp16 LayerNorms
  // that have historically broken onnxruntime-web's WebGPU shader on
  // some Chrome builds — sticking with q4 keeps the pipeline robust.
  //
  // **Why this slot is LFM2.5-1.2B-Instruct and not LFM2-1.2B**:
  // straight version-superset. Same parameter count, same family,
  // newer training. We pin `dtype: "q4"` (not q4f16) because the
  // q4 build is the one we validated end-to-end on WebGPU — passes
  // phone/email/address extraction on the résumé probe the same
  // way the prior LFM2-1.2B q4f16 build did.
  //
  // **Why not LFM2.5-350M**: tried it on paper but the chat slot
  // has burned every model at ≤ 500M params (SmolLM2-360M, Qwen
  // 0.5B). Smaller models in this size class consistently fail
  // verbatim extraction — they confabulate plausible-looking
  // digits/emails instead of copying from the retrieved chunk.
  // Sticking to 1.2B keeps the discipline guarantee.
  approxSizeBytes: Math.round(810 * 1024 * 1024),
  approxPeakRamBytes: Math.round(2 * 1024 * 1024 * 1024),
  description:
    "Liquid AI's latest 1.2B hybrid (extended pretraining + RL post-training over the LFM2 base). Designed for on-device structured extraction and RAG. The smaller of the two LFM2-family tiers we ship.",
  bestFor:
    "Devices with 3-4 GB free RAM, or when you want fast first-token latency on a fresh chat.",
  license: "LFM Open License v1.0",
  modelUrl: "https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct",
  pipelineOptions: { dtype: "q4" },
  // Liquid AI's recommended sampler for the LFM2 family — see their
  // model card. min_p (not top_p) is the documented sampling
  // strategy; repetition_penalty stays low because their training
  // recipe already discourages tight loops. LFM2.5 inherits the
  // same recommended defaults.
  //
  // `noRepeatNgramSize: 6` is a *loop safety net*, not a quality
  // tweak. The e2e probe surfaced an LFM2-specific failure mode
  // (single-token "To To To … (252×)" run that mauled the warm-
  // cache overview answer) — Liquid's discipline normally avoids
  // this but sampling stochasticity occasionally trips it. With
  // ngram=6 the loop is broken after at most 6 repeats of any
  // 6-token sequence, which keeps natural prose ("Sumit Sahoo
  // is …" recurring at most once per reply) intact while making
  // a 252× repeat impossible. Documented in chat-model.ts.
  generationParams: {
    maxNewTokens: 256,
    temperature: 0.3,
    minP: 0.15,
    repetitionPenalty: 1.05,
    noRepeatNgramSize: 6,
  },
};

const CHAT_LFM2_2_6B: AiModelInfo = {
  id: "chat:lfm2-2.6b",
  displayName: "LFM2 (2.6B, Liquid AI)",
  repo: "onnx-community/LFM2-2.6B-ONNX",
  task: "text-generation",
  // ~1.55 GB on disk at q4f16 (`model_q4f16.onnx_data` 1.54 GB on HF
  // + tokenizer 3.3 MB + configs), ~3.5 GB peak RAM. The larger of
  // the two tiers — recommended on ≥ 8 GB free RAM. Same hybrid
  // architecture and training discipline as LFM2-1.2B but with the
  // extra capacity that lets it handle longer, more nuanced
  // extraction questions.
  approxSizeBytes: Math.round(1.55 * 1024 * 1024 * 1024),
  approxPeakRamBytes: Math.round(3.5 * 1024 * 1024 * 1024),
  description:
    "Liquid AI's larger hybrid model. Same on-device extraction discipline as LFM2-1.2B with more capacity for longer answers and harder questions.",
  bestFor: "Devices with ≥ 8 GB free RAM where you want the best extraction quality.",
  license: "LFM Open License v1.0",
  modelUrl: "https://huggingface.co/LiquidAI/LFM2-2.6B",
  pipelineOptions: { dtype: "q4f16" },
  // Same generation params as LFM2.5-1.2B — see that entry for the
  // rationale on each field, including why `noRepeatNgramSize: 6`
  // was added as a loop safety net after the e2e probe caught a
  // "To To … (252×)" pathology on the Quality tier specifically.
  generationParams: {
    maxNewTokens: 256,
    temperature: 0.3,
    minP: 0.15,
    repetitionPenalty: 1.05,
    noRepeatNgramSize: 6,
  },
};

const EMBED: AiModelInfo = {
  id: "embed",
  displayName: "EmbeddingGemma (300M)",
  repo: "onnx-community/embeddinggemma-300m-ONNX",
  task: "feature-extraction",
  // ~320 MB on disk (~295 MB int8 weights via `model_quantized.onnx`
  // + ~26 MB Gemma SentencePiece tokenizer — the latter is non-trivial
  // and used to be missed in the registry estimate), ~500 MB peak RAM.
  // Bigger than the prior bge-base-en-v1.5 (~140 MB) on disk but the
  // retrieval quality jump from EmbeddingGemma's asymmetric
  // task-prefix training is meaningful, and runtime RAM is
  // comparable thanks to int8 weights vs bge's fp16. 308M params
  // vs bge-base's 109M.
  //
  // **Why we swapped from bge-base**:
  //   - EmbeddingGemma is trained for asymmetric retrieval with
  //     task-specific prompt prefixes ("title: none | text: ..."
  //     for docs vs "task: search result | query: ..." for
  //     queries). bge-base used the same prefix on both sides.
  //   - Stronger on MTEB retrieval at this size class, and
  //     multilingual out of the box (100+ langs) — covers non-
  //     English PDFs without a model swap.
  //   - Still 768-dim output (with Matryoshka truncation to 512 /
  //     256 / 128 available; we currently use the full 768).
  //
  // **Why `dtype: "q8"` + `device: "wasm"`** (and not q4f16 +
  // webgpu like the chat model, nor q4):
  //
  //   - q4f16: ships LayerNorm in fp16. onnxruntime-web's WebGPU
  //     shader for that op fails to compile (`Invalid ShaderModule
  //     "LayerNorm"`). Verified failing on Chrome / macOS.
  //   - q4 (197 MB): uses `GatherBlockQuantized` for the embedding
  //     table. onnxruntime-web's WASM backend doesn't implement
  //     that op — pipeline init throws (`Could not find an
  //     implementation for GatherBlockQuantized(1) … Gather_Q4`).
  //     The `model_no_gather_q4` variant in the repo exists to
  //     work around this but Transformers.js' `dtype` option
  //     doesn't expose it; we'd have to override `model_file_name`
  //     directly. Not worth the extra plumbing for 112 MB.
  //   - q8 (this): int8-quantized weights with fp32 activations.
  //     The most universally supported variant in onnxruntime-web
  //     — works on both WebGPU and WASM with no exotic ops. Pays
  //     ~112 MB in download size relative to q4.
  //   - Pinning to WASM sidesteps any future GPU-shader risk on
  //     the smaller of the two models. Embedding a few hundred
  //     chunks per PDF + one query per turn isn't throughput-
  //     bound; the chat model gets exclusive use of WebGPU where
  //     it actually matters.
  //
  // Prefix handling lives in `src/rag/embeddings.ts` — swapping
  // back to a symmetric embedder (e.g. bge) means dropping that
  // prefix layer.
  approxSizeBytes: 320 * 1024 * 1024,
  approxPeakRamBytes: 500 * 1024 * 1024,
  description:
    "Google's on-device embedding model from the Gemma family. Trained for asymmetric retrieval — applies task-specific prompts to PDF chunks vs your question, then matches them in a 768-dim vector space so the chat model gets the right pages. Multilingual (100+ langs).",
  bestFor: "Semantic retrieval over PDFs in any of 100+ languages.",
  license: "Gemma Terms of Use",
  modelUrl: "https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX",
  pipelineOptions: { dtype: "q8", device: "wasm" },
};

/**
 * Desktop-tier registry. Read these via {@link getModelInfo} so the
 * chat-variant selection layer can be added without touching every
 * call site.
 */
const RERANK: AiModelInfo = {
  id: "rerank",
  displayName: "MS MARCO MiniLM-L-6-v2 (cross-encoder)",
  repo: "Xenova/ms-marco-MiniLM-L-6-v2",
  task: "text-classification",
  // ~23 MB on disk at int8 (`model_int8.onnx`). Peak RAM ~90 MB
  // during inference (int8 weights + fp32 activations + ONNX
  // runtime overhead). MiniLM-L6 backbone — 22M params, a 12-fold
  // size reduction over the previous BGE-base entry (278M) at the
  // cost of multilingual coverage (this model is English-only).
  // Cross-encoders are still heavier per-pair than embedders
  // because they tokenise the (query, passage) concatenation
  // end-to-end, but at 22M params the per-pair forward pass is
  // small enough that scoring the hybrid top-K (~18 candidates)
  // takes well under a second on WASM.
  //
  // **History of swaps in this slot:**
  //
  //   - `Xenova/bge-reranker-base` (278M, 279 MB int8, ~600 MB
  //     peak RAM) — multilingual XLM-RoBERTa-base. Retired after
  //     the smaller MiniLM showed equivalent top-K ranking
  //     quality on the résumé fixture; the 256 MB download saving
  //     is the practical win that drops the three-model bundle
  //     under 1.6 GB.
  //   - `onnx-community/bge-reranker-v2-m3-ONNX` (568M, 571 MB int8,
  //     ~1.2 GB peak RAM) — v2 multilingual. Briefly shipped for
  //     a measurable warm-overview quality lift (more specific
  //     TOGAF/DevOps vocabulary) but doubled both download and
  //     peak RAM. Retired in favour of bge-base for size; bge-base
  //     in turn retired for MiniLM.
  //
  // **Why MiniLM-L-6-v2 specifically:**
  //   - 23 MB int8 download — the lowest-cost cross-encoder in
  //     the Transformers.js ecosystem that still does real ranking
  //     work. MS MARCO training is purpose-built for this exact
  //     job (passage relevance over English search queries).
  //   - Drop-in for the `text-classification` pipeline and the
  //     `{text, text_pair}` input shape we already use in
  //     {@link CrossEncoderReranker}. Outputs a single raw
  //     relevance score per pair (not sigmoid-normalised like BGE,
  //     but that doesn't matter for the sort the reranker does —
  //     higher score = more relevant, regardless of scale).
  //
  // **Trade-off you should know about:** this model is English
  // only. The {@link EMBED} stage is still multilingual
  // (EmbeddingGemma covers 100+ languages), so non-English PDFs
  // still get reasonable hybrid retrieval — they just lose the
  // reranking refinement pass on their candidate chunks. For most
  // users the win on bundle size is worth this trade, but if the
  // primary use-case is non-English documents the multilingual
  // BGE-base (279 MB) is a sound fallback — swap `repo` +
  // `displayName` + `approxSizeBytes` back, the rest of the
  // pipeline is identical.
  //
  // **Why `dtype: "int8"` and not q4 / q4f16:**
  //   - At 23 MB int8 we're already operating below the threshold
  //     where further quantisation matters for download UX — the
  //     model loads in well under a second on any broadband
  //     connection. q4f16 (30 MB) and q4 (55 MB) actually weigh
  //     *more* than int8 here because the model is small enough
  //     that the unpacked weight storage exceeds the int8 cost.
  //   - `int8` (model_int8.onnx, 23 MB): int8 weights + fp32
  //     activations. Universally supported across onnxruntime-web's
  //     WASM + WebGPU backends; no exotic ops. Same file as
  //     `model_quantized.onnx` and `model_uint8.onnx` (all 23 MB).
  //
  // **Quality knob if a user complains:** swap back to BGE-base
  // by restoring repo `onnx-community/bge-reranker-base-ONNX` +
  // sizes 279 MB / 600 MB — the rest of the reranker pipeline
  // doesn't care. We don't expose this as a UI picker because
  // the user-visible difference is subtle on typical English PDFs
  // and a separate reranker picker doubles UX complexity.
  approxSizeBytes: 23 * 1024 * 1024,
  approxPeakRamBytes: 90 * 1024 * 1024,
  description:
    "Microsoft's tiny MiniLM cross-encoder trained on MS MARCO (22M params). Scores each (question, retrieved chunk) pair directly, then we keep the top scoring chunks — sharper relevance than the BM25 + dense fusion alone. English only.",
  bestFor:
    "Sharpening the chunks the LLM sees on English documents so answers stay grounded in the most relevant text.",
  license: "Apache 2.0",
  // Point at the Xenova ONNX export we actually download — the
  // upstream `cross-encoder/ms-marco-MiniLM-L-6-v2` is the source
  // model card but doesn't ship the int8 ONNX weights this entry
  // pulls. Linking the Xenova repo lets users inspect the exact
  // bytes the consent dialog is asking them to download.
  modelUrl: "https://huggingface.co/Xenova/ms-marco-MiniLM-L-6-v2",
  pipelineOptions: { dtype: "int8" },
};

export const AI_MODELS: Record<AiModelId, AiModelInfo> = {
  "chat:lfm2.5-1.2b": CHAT_LFM2_5_1_2B,
  "chat:lfm2-2.6b": CHAT_LFM2_2_6B,
  embed: EMBED,
  rerank: RERANK,
};

// ── Chat-variant picker helpers ─────────────────────────────────────

/**
 * Ordered list of chat variants — drives the picker UI. Order is
 * Compact → Balanced → Quality, matching the segmented-control flow
 * left-to-right (smallest to biggest footprint).
 */
export const CHAT_VARIANT_IDS: readonly ChatVariantId[] = ["lfm2.5-1.2b", "lfm2-2.6b"] as const;

/** Short tier label shown in the picker — never the full model name. */
export const CHAT_VARIANT_TIER_LABEL: Record<ChatVariantId, string> = {
  "lfm2.5-1.2b": "Compact",
  "lfm2-2.6b": "Quality",
};

/**
 * localStorage key holding the user's chosen chat variant. Absent /
 * invalid → fall back to {@link getDefaultChatVariant}.
 */
const CHAT_VARIANT_STORAGE_KEY = "cloakpdf:chat-variant";

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Static default for a fresh visitor who hasn't picked a tier yet.
 *
 * **Why this isn't RAM-aware.** `navigator.deviceMemory` is a noisy
 * signal — Chrome caps it at 8 GB for privacy, so a 16 GB or 32 GB
 * desktop reads identical to an 8 GB laptop. Firefox and Safari
 * don't expose the API at all (returns `null`). A "recommendation"
 * built on that signal would mis-classify the majority of desktops
 * either way, so we don't try.
 *
 * Instead we ship the smallest tier as the default — Compact /
 * LFM2.5-1.2B-Instruct fits any device we'd let near this tool,
 * downloads in a few minutes on broadband, and is purpose-built by
 * Liquid AI for on-device extraction (so the answer quality is
 * reasonable out of the box). Users who want more can pick Balanced
 * or Quality from the picker; the choice persists across reloads.
 */
export function getDefaultChatVariant(): ChatVariantId {
  return "lfm2.5-1.2b";
}

/**
 * The user's currently-selected chat variant. Reads localStorage
 * first; falls back to {@link getDefaultChatVariant} when nothing
 * is stored (fresh visitor) or the stored value is invalid (schema
 * drift, manual tampering). Pure — no side effects.
 */
export function getActiveChatVariant(): ChatVariantId {
  const storage = safeLocalStorage();
  const stored = storage?.getItem(CHAT_VARIANT_STORAGE_KEY);
  if (stored && (CHAT_VARIANT_IDS as readonly string[]).includes(stored)) {
    return stored as ChatVariantId;
  }
  return getDefaultChatVariant();
}

/**
 * Persist the user's choice. Best-effort — failures (private mode,
 * quota exceeded) are swallowed; subsequent reads simply fall back
 * to the static default.
 */
export function setActiveChatVariant(variant: ChatVariantId): void {
  const storage = safeLocalStorage();
  try {
    storage?.setItem(CHAT_VARIANT_STORAGE_KEY, variant);
  } catch {
    // ignore
  }
}

/** Convenience: full {@link AiModelId} for the currently-active chat tier. */
export function getActiveChatModelId(): AiModelId {
  return getChatModelId(getActiveChatVariant());
}

/**
 * Cleanup-only migration for stale ready flags + variant prefs left
 * over from prior shipped registry shapes. Returns nothing — this is
 * pure side-effect cleanup. Idempotent. Call once at app startup;
 * safe to re-run.
 *
 * **What it clears, and why:**
 *
 *   - `cloakpdf:ai-model-ready:chat` — the pre-tier flag (existed
 *     before we shipped a chat-variant picker). The current schema
 *     keys the flag by full model id (e.g. `chat:lfm2.5-1.2b`); the
 *     bare `chat` slot is no longer written, so anything stored here
 *     is from a much older build.
 *   - `cloakpdf:ai-model-ready:chat:smollm2-1.7b` — SmolLM2 was
 *     briefly the Balanced tier. Dropped after the LFM2 comparison.
 *     The model id isn't in `AI_MODELS` any more so the flag would
 *     just rot as an orphan.
 *   - {@link CHAT_VARIANT_STORAGE_KEY} pointing at `smollm2-1.7b` —
 *     same reason; without this clear `getActiveChatVariant` would
 *     fall back via the unknown-slug branch but the orphan slug
 *     would still sit in storage.
 *   - **`cloakpdf:ai-model-ready:rerank` (one-shot, guarded)** — the
 *     `rerank` *model id* didn't change across the BGE-base →
 *     MiniLM-L-6-v2 swap, only the underlying repo did. So the
 *     existing ready flag would silently auto-load the new MiniLM
 *     without re-consent, hiding the licence + size change from
 *     returning users. We clear it exactly once (guarded by a
 *     separate "I already cleared it" key) so the consent dialog
 *     re-appears one more time on first run after the swap, then
 *     never bothers the user again.
 *
 * **Orphan CacheStorage entries:** every retired model leaves its
 * weight files in the browser's CacheStorage — SmolLM2 (~1 GB),
 * bge-reranker-v2-m3 (571 MB), bge-reranker-base (279 MB) are the
 * notable ones. Two ways those bytes get reclaimed:
 *
 *   - User clicks "Delete cached models" in the AI Model Details
 *     dialog — `evictModelCacheBytes()` in {@link ../utils/ai-runtime.ts}
 *     drops the entire `transformers-cache`, which removes both
 *     active model weights AND any retired-model orphans in one go.
 *   - The browser hits its origin storage quota and evicts LRU.
 *
 * "Free memory" in the same dialog only releases the in-tab JS /
 * WASM heap — it does **not** clear CacheStorage. The two
 * affordances are distinct on purpose: most users want the soft
 * action (free RAM, keep instant re-load); the destructive one is
 * gated behind a two-step confirm.
 */
const RERANK_SWAP_MIGRATION_KEY = "cloakpdf:migration:rerank-minilm-swap";

export function migrateLegacyChatReadyFlag(): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem("cloakpdf:ai-model-ready:chat");
    storage.removeItem("cloakpdf:ai-model-ready:chat:smollm2-1.7b");
    // If a returning user's variant pref points at the dropped tier,
    // clear it so `getActiveChatVariant` falls back to the current
    // default rather than returning a slug that's not in CHAT_VARIANT_IDS.
    if (storage.getItem(CHAT_VARIANT_STORAGE_KEY) === "smollm2-1.7b") {
      storage.removeItem(CHAT_VARIANT_STORAGE_KEY);
    }
    // One-shot rerank ready-flag reset: the reranker repo changed
    // (BGE-base → MiniLM-L-6-v2) but the model id stayed `rerank`,
    // so without this clear the auto-load path would silently swap
    // the underlying model without re-prompting. We use a separate
    // migration key (not the ready flag itself) so a user who
    // *re-downloads* the new MiniLM and then revisits doesn't get
    // the consent dialog a third time.
    if (!storage.getItem(RERANK_SWAP_MIGRATION_KEY)) {
      storage.removeItem("cloakpdf:ai-model-ready:rerank");
      storage.setItem(RERANK_SWAP_MIGRATION_KEY, "1");
    }
  } catch {
    // ignore
  }
}

/**
 * Look up a model's metadata by id. Thin wrapper over {@link AI_MODELS}
 * — kept as a function so future per-feature variant logic (e.g.
 * device-specific dtype selection) has one place to land without
 * touching every call site.
 */
export function getModelInfo(id: AiModelId): AiModelInfo {
  return AI_MODELS[id];
}

/** Format a byte count as e.g. "≈ 28 MB" for the consent dialog. */
export function formatApproxSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `≈ ${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  return `≈ ${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * Clear every localStorage flag the AI stack uses to remember "this
 * user already consented to / downloaded model X" — the
 * `cloakpdf:ai-model-ready:*` flags **and** the one-shot migration
 * guard added for the rerank swap. Used by the "Delete cached
 * models" affordance so the user, after evicting CacheStorage
 * bytes, sees the consent dialog again on next use (matching the
 * fresh-visitor experience).
 *
 * Does **not** touch the chat-variant preference — the user picked
 * their tier and clearing the disk cache doesn't invalidate that
 * choice. They'd just have to re-pick on next use otherwise, which
 * is busywork.
 *
 * Idempotent and best-effort: failures on individual keys (private
 * mode, quota) are swallowed.
 */
export function clearAllReadyFlags(): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  const PREFIX = "cloakpdf:ai-model-ready:";
  try {
    // Iterate snapshot of keys — removeItem during iteration shifts
    // indices on some Storage shims.
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) storage.removeItem(k);
    // Also clear the migration guard so a return visit after evict
    // re-fires the "rerank swap" re-consent path uniformly with the
    // rest of the consent flow, instead of skipping it because the
    // guard says "I already did that migration once".
    storage.removeItem(RERANK_SWAP_MIGRATION_KEY);
  } catch {
    // ignore
  }
}
