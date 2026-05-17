/**
 * Task-typed wrappers around the opaque {@link AiPipeline} handles
 * returned by `loadPipeline()`.
 *
 * **Why this file exists.** Transformers.js exposes one concrete pipeline
 * class per task (`TextGenerationPipeline`, `FeatureExtractionPipeline`)
 * with subtly different call shapes. If every consumer called the
 * pipeline directly it would have to cast and hard-code those shapes —
 * swapping the underlying model would mean touching every call site.
 *
 * Instead, each task gets one helper here. Callers use the helper; the
 * helper knows the pipeline shape. To swap a model, update its entry in
 * {@link AI_MODELS} — no consumer code changes.
 *
 * Currently exposed tasks:
 *
 *   - {@link runChat}  — chat-style generation with optional streaming.
 *   - {@link runEmbed} — sentence embeddings (Float32Array per input).
 */
import type { AiPipeline } from "./ai-runtime.ts";

/**
 * Module-level cache for the dynamically-imported `TextStreamer`
 * constructor. The first `runChat({ onToken })` call has to wait for
 * the import to resolve; subsequent calls re-use the same constructor
 * without paying the dynamic-import cost again.
 */
let _textStreamerCtor: typeof import("@huggingface/transformers").TextStreamer | null = null;
async function getTextStreamerCtor(): Promise<
  typeof import("@huggingface/transformers").TextStreamer
> {
  if (!_textStreamerCtor) {
    const mod = await import("@huggingface/transformers");
    _textStreamerCtor = mod.TextStreamer;
  }
  return _textStreamerCtor;
}

// ── Chat / text-generation ────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatGenerationOptions {
  /** Cap on tokens emitted by this call. Default 256. */
  maxNewTokens?: number;
  /**
   * `true` enables nucleus/temperature sampling. Default `true` because
   * small (≤1.5B) on-device models reliably collapse into single-token
   * loops under greedy decoding — passing `false` here is opt-in for
   * cases where strict determinism beats stability (e.g. tests).
   */
  doSample?: boolean;
  /** Sampling temperature. Ignored when `doSample` is false. */
  temperature?: number;
  /**
   * Nucleus sampling cutoff (top_p). Pass *or* {@link minP}, not both
   * — they're alternative cutoff strategies and stacking them tends to
   * over-constrain the distribution. Omit to disable nucleus sampling.
   */
  topP?: number;
  /**
   * Min-p sampling cutoff. Liquid AI's LFM2 family is trained against
   * this sampler (they recommend `min_p: 0.15`); SmolLM2 still uses
   * `top_p`. Omit to disable.
   */
  minP?: number;
  /**
   * Penalty applied to tokens already in the output, suppressing repeat
   * loops. 1.0 / omitted disables. Tune per-model — Liquid recommends
   * `1.05` for LFM2; SmolLM2-1.7B needs `~1.15` against the résumé probe.
   */
  repetitionPenalty?: number;
  /**
   * Bans the model from emitting any n-gram of this size that has
   * already appeared in the output. Catches lexically-varied loops the
   * repetition penalty misses (each surface form is technically
   * distinct, so per-token penalties don't add up). 0 / undefined
   * disables. Tune per-model in the adapter — see the comment on
   * `TransformersJsChatModel`.
   */
  noRepeatNgramSize?: number;
  /**
   * Fires for each decoded text fragment as the model generates. Use it
   * to stream tokens into a chat UI. The callback receives the *delta*
   * (only the newly generated piece), not the cumulative text.
   */
  onToken?: (delta: string) => void;
}

/**
 * Run a chat-template generation against a text-generation pipeline.
 *
 * Returns the assistant's final reply as a plain string. When
 * `onToken` is supplied, fragments are also streamed to the callback
 * as they're decoded — perfect for a typewriter-style chat UI.
 */
export async function runChat(
  pipe: AiPipeline,
  messages: ChatMessage[],
  options: ChatGenerationOptions = {},
): Promise<string> {
  // We treat the pipeline as a function with an attached `tokenizer`.
  // This matches the shape of TextGenerationPipeline; Transformers.js
  // doesn't export a plain callable type, so we spell it inline.
  const generator = pipe as unknown as ((
    messages: ChatMessage[],
    opts: Record<string, unknown>,
  ) => Promise<Array<{ generated_text: ChatMessage[] | string }>>) & {
    tokenizer: unknown;
  };

  let streamer: unknown;
  if (options.onToken) {
    const TextStreamer = await getTextStreamerCtor();
    streamer = new TextStreamer(
      generator.tokenizer as ConstructorParameters<typeof TextStreamer>[0],
      {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: options.onToken,
      },
    );
  }

  // Neutral fallbacks. The chat-model adapter reads each variant's
  // tuned `generationParams` (see `src/utils/ai-models.ts`) and
  // passes them through explicitly — so the defaults here only fire
  // when the helper is called directly without options (rare; mostly
  // tests). Conservative temperature and a mild rep-penalty are safe
  // for any small instruct model; sampler cutoffs are *only* applied
  // when the caller asks for one, so we never accidentally stack
  // top_p + min_p on a model that's tuned against only one.
  const result = await generator(messages, {
    max_new_tokens: options.maxNewTokens ?? 256,
    do_sample: options.doSample ?? true,
    temperature: options.temperature ?? 0.3,
    ...(typeof options.topP === "number" ? { top_p: options.topP } : {}),
    ...(typeof options.minP === "number" ? { min_p: options.minP } : {}),
    repetition_penalty: options.repetitionPenalty ?? 1.1,
    ...(options.noRepeatNgramSize && options.noRepeatNgramSize > 0
      ? { no_repeat_ngram_size: options.noRepeatNgramSize }
      : {}),
    ...(streamer ? { streamer } : {}),
  });

  const generated = result[0]?.generated_text;
  if (Array.isArray(generated)) {
    // Chat output: array of messages. The model's reply is the last
    // entry (it appends after the prompt's `system`/`user` turns).
    const last = generated[generated.length - 1];
    return last?.content?.trim() ?? "";
  }
  return (typeof generated === "string" ? generated : "").trim();
}

// ── Embeddings ────────────────────────────────────────────────────

/**
 * Run sentence embeddings against a `feature-extraction` pipeline.
 *
 * Returns one L2-normalised `Float32Array` per input string. The
 * embedder is configured with `pooling: "mean"` and `normalize: true`
 * so callers can compute cosine similarity as a plain dot product.
 *
 * Batching: Transformers.js accepts an array and runs the inputs in a
 * single forward pass — much faster than calling once per string when
 * embedding a whole PDF's worth of chunks.
 */
export async function runEmbed(pipe: AiPipeline, inputs: string[]): Promise<Float32Array[]> {
  // Cast the pipeline to the feature-extraction call shape. The
  // returned `Tensor` from Transformers.js exposes `.data` (the raw
  // typed array) and `.dims` (so we can recover the per-input split).
  const extractor = pipe as unknown as (
    texts: string[],
    options: Record<string, unknown>,
  ) => Promise<{ data: Float32Array; dims: number[] }>;

  if (inputs.length === 0) return [];
  const out = await extractor(inputs, { pooling: "mean", normalize: true });

  // `dims` is `[batch, hiddenSize]`. Split the flat tensor back into
  // per-input slices so callers don't have to do the math themselves.
  const [, hiddenSize] = out.dims;
  if (typeof hiddenSize !== "number" || hiddenSize <= 0) {
    throw new Error(`Unexpected embedding output dims: ${out.dims.join(",")}`);
  }
  const vectors: Float32Array[] = [];
  for (let i = 0; i < inputs.length; i++) {
    vectors.push(out.data.slice(i * hiddenSize, (i + 1) * hiddenSize));
  }
  return vectors;
}
