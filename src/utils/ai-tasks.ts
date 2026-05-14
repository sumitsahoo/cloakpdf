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
  /** Cap on tokens emitted by this call. Default 512. */
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
  /** Nucleus sampling cutoff. Ignored when `doSample` is false. */
  topP?: number;
  /**
   * Penalty applied to tokens already in the output, suppressing repeat
   * loops. Default 1.1 — the value the small-model authors recommend.
   * 1.0 disables.
   */
  repetitionPenalty?: number;
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

  // Defaults tuned for SmolLM2-360M to stop the loop pathologies we
  // saw on real PDFs (e.g. "1. An API related to X" repeating for 39
  // numbered lines). The relevant knobs:
  //
  //   - `no_repeat_ngram_size: 4` — bans the model from emitting any
  //     4-gram that's already appeared in the output. Catches paraphrased
  //     loops the plain repetition penalty misses (the loop above
  //     re-used the phrase "An API related to" but with a different
  //     leading number, so per-token penalty alone wasn't enough).
  //   - `repetition_penalty: 1.3` — stronger than the 1.1 default. The
  //     small-model literature suggests 1.1–1.3; we sit at the upper end
  //     since the lower end didn't hold on our content.
  //   - `max_new_tokens: 256` — half the previous cap. Even if a loop
  //     starts the user only sees a short blast of repetition before it
  //     stops, instead of 512 tokens of garbage.
  //   - `temperature: 0.7` — slightly hotter than 0.6; gives the model
  //     more room to break out of a loop once one starts.
  const result = await generator(messages, {
    max_new_tokens: options.maxNewTokens ?? 256,
    do_sample: options.doSample ?? true,
    temperature: options.temperature ?? 0.7,
    top_p: options.topP ?? 0.9,
    repetition_penalty: options.repetitionPenalty ?? 1.3,
    no_repeat_ngram_size: 4,
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
