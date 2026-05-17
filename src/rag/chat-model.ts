/**
 * LangChain `SimpleChatModel` adapter wrapping a Transformers.js
 * `text-generation` pipeline.
 *
 * Why this adapter exists: LangGraph nodes, prompt templates, and any
 * future chains/agents speak in LangChain's `BaseMessage` / `ChatResult`
 * vocabulary. This class bridges that abstraction to our on-device
 * inference.
 *
 * Generation defaults travel with the model — each entry in
 * `src/utils/ai-models.ts` carries its own `generationParams`. Pass
 * the active model's {@link AiModelInfo} and the adapter pulls
 * sampler / penalty / cap defaults straight off it. Constructor
 * overrides win where the caller cares (rare; primarily tests).
 *
 * Streaming is implemented via `_streamResponseChunks` so consumers
 * can pipe tokens straight into the UI (typewriter chat) without
 * waiting for the full response.
 */
import {
  type BaseChatModelParams,
  SimpleChatModel,
} from "@langchain/core/language_models/chat_models";
import {
  AIMessageChunk,
  type BaseMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { ChatGenerationChunk } from "@langchain/core/outputs";
import type { AiModelInfo, ChatGenerationParams } from "../utils/ai-models.ts";
import type { AiPipeline } from "../utils/ai-runtime.ts";
import { type ChatMessage, runChat } from "../utils/ai-tasks.ts";

export interface TransformersJsChatModelOptions extends BaseChatModelParams {
  /** Resolved Transformers.js `text-generation` pipeline. */
  pipeline: AiPipeline;
  /**
   * Metadata for the active chat variant — supplies the generation
   * defaults (`generationParams`). Required so a tier switch
   * (SmolLM2 ↔ LFM2) automatically picks up the right sampler / rep-
   * penalty / loop-breaker combo without a per-call override.
   */
  info: AiModelInfo;
  /** Per-call cap on tokens emitted. Overrides `info.generationParams`. */
  maxNewTokens?: number;
  /** Sampling temperature. Overrides `info.generationParams`. */
  temperature?: number;
  /** Top-p (nucleus) cutoff. Overrides `info.generationParams`. */
  topP?: number;
  /** Min-p cutoff (LFM2-style sampler). Overrides `info.generationParams`. */
  minP?: number;
  /** Repetition penalty. Overrides `info.generationParams`. */
  repetitionPenalty?: number;
  /** Bans repeated n-grams of this size. Overrides `info.generationParams`. */
  noRepeatNgramSize?: number;
}

/**
 * Per-variant tuning history (so future-us doesn't repeat past
 * dead-ends). Each entry below is keyed to the model in
 * `src/utils/ai-models.ts` and lists the actual sampler walks against
 * the résumé probe in `tests/e2e/retrieval-probe.ts`.
 *
 * **SmolLM2-1.7B-Instruct**  — `{ temp: 0.2, top_p: 0.85, rep: 1.15,
 *                                no_repeat_ngram_size: 6, max: 256 }`
 *
 *   - 0.6 / 0.9 / 512 / 1.1 (original) → too much rope on factual
 *     questions; the model would correctly extract a phone number
 *     then add three paragraphs of hedging and confabulated context.
 *   - 0.5 / 0.85 / 384 / 1.1 → caps verbosity but probe still
 *     shows tool-list editorializing ("JavaScript (used in
 *     Next.js, React, TypeScript)") and confident hallucination on
 *     negative-topic questions ("what does the document say about
 *     Docker?" → invented Docker content).
 *   - 0.2 / 0.85 / 384 / 1.15 → near-greedy sampling pushes the
 *     model to copy from retrieved chunks rather than confabulate,
 *     but the expanded probe still caught two failure modes the
 *     rep-penalty bump alone couldn't fix: (a) padding tool lists
 *     with common-but-absent items, and (b) lexically-varied loops
 *     ("Restricted tool sets, restricted tool selections, …") that
 *     the rep penalty can't catch because each surface form is
 *     distinct.
 *   - 0.2 / 0.85 / 256 / 1.15 → capping new tokens at 256
 *     truncates the worst of (a) and (b). A correct list fits
 *     comfortably; a fabricated 50-item list runs into the cap.
 *   - 0.2 / 0.85 / 256 / 1.15 + `no_repeat_ngram_size: 6` → e2e
 *     still caught a lexical "ramp" loop on the overview question
 *     ("X - Y - A - B - …") where each iteration extends the
 *     previous by one token so the repetition penalty never fires.
 *     The n-gram ban at size 6 is gentle enough that common short
 *     phrases ("the document doesn't mention", "Sumit Sahoo is")
 *     can still recur naturally, strict enough that an 8+ token
 *     prefix-extension loop is broken immediately.
 *
 * **LFM2 family (1.2B + 2.6B)** — `{ temp: 0.3, min_p: 0.15,
 *                                    rep: 1.05, no_repeat_ngram: 6,
 *                                    max: 256 }`
 *
 *   - Liquid AI's documented sampler. `min_p` (not `top_p`) is the
 *     LFM2 family's documented cutoff — they're trained against it;
 *     stacking `top_p` on top tends to over-constrain. Repetition
 *     penalty stays low (1.05) because Liquid's training recipe
 *     already discourages tight loops.
 *   - `no_repeat_ngram_size: 6` is on as a *safety net*, not because
 *     the family routinely loops. We shipped without it first; the
 *     e2e probe surfaced single-token runs ("To To … 252×") and
 *     asterisk-only Markdown loops on the warm-cache overview path
 *     — rare but reproducible enough to ship past. At size 6 it
 *     only fires on genuine degenerate loops (no natural 6-gram
 *     repeats in prose) so it doesn't restrict normal phrasing.
 *   - We briefly tested bumping `temperature` to 0.4 hoping the
 *     extra variance would break the loops on its own, but 0.4
 *     started causing off-language drift (Arabic / French gibberish
 *     instead of the document content). 0.3 + the ngram safety net
 *     is the combination that keeps both pathologies at bay.
 */
export class TransformersJsChatModel extends SimpleChatModel {
  private pipeline: AiPipeline;
  private params: Required<
    Pick<ChatGenerationParams, "maxNewTokens" | "temperature" | "repetitionPenalty">
  > & {
    topP?: number;
    minP?: number;
    noRepeatNgramSize?: number;
  };

  constructor(options: TransformersJsChatModelOptions) {
    super(options);
    this.pipeline = options.pipeline;

    // The active variant supplies tuned defaults; constructor options
    // override per-field. `??` (not `||`) so a deliberate `0` stays.
    const base = options.info.generationParams ?? {
      maxNewTokens: 256,
      temperature: 0.3,
      repetitionPenalty: 1.1,
    };
    this.params = {
      maxNewTokens: options.maxNewTokens ?? base.maxNewTokens,
      temperature: options.temperature ?? base.temperature,
      repetitionPenalty: options.repetitionPenalty ?? base.repetitionPenalty,
      topP: options.topP ?? base.topP,
      minP: options.minP ?? base.minP,
      noRepeatNgramSize: options.noRepeatNgramSize ?? base.noRepeatNgramSize,
    };
  }

  _llmType(): string {
    return "transformers-js";
  }

  /** Build the option bag passed to `runChat` — one definition, used by both call paths. */
  private genOptions() {
    return {
      maxNewTokens: this.params.maxNewTokens,
      temperature: this.params.temperature,
      topP: this.params.topP,
      minP: this.params.minP,
      repetitionPenalty: this.params.repetitionPenalty,
      noRepeatNgramSize: this.params.noRepeatNgramSize,
    };
  }

  /**
   * Non-streaming generation. Required by `SimpleChatModel`; the
   * streaming hook below is what the UI actually drives.
   */
  async _call(messages: BaseMessage[]): Promise<string> {
    const chatMessages = toChatMessages(messages);
    return runChat(this.pipeline, chatMessages, this.genOptions());
  }

  /**
   * Streaming generation. Yields one `ChatGenerationChunk` per decoded
   * fragment — matches what `RunnableSequence.stream()` expects so the
   * graph can stream end-to-end without intermediate buffering.
   */
  async *_streamResponseChunks(messages: BaseMessage[]): AsyncGenerator<ChatGenerationChunk> {
    const chatMessages = toChatMessages(messages);

    // Adapt the imperative `onToken` callback into an async generator
    // using a small in-flight queue. Each token resolves a pending
    // promise; when generation completes we close the queue.
    type Deferred = {
      resolve: (chunk: string | null) => void;
      reject: (err: unknown) => void;
    };
    const waiters: Deferred[] = [];
    const buffer: string[] = [];
    let done = false;
    let error: unknown = null;

    const push = (chunk: string | null) => {
      const w = waiters.shift();
      if (w) {
        if (chunk === null) w.resolve(null);
        else w.resolve(chunk);
      } else if (chunk !== null) {
        buffer.push(chunk);
      }
    };

    const next = () =>
      new Promise<string | null>((resolve, reject) => {
        if (buffer.length > 0) {
          resolve(buffer.shift() as string);
        } else if (done) {
          resolve(null);
        } else if (error) {
          reject(error);
        } else {
          waiters.push({ resolve, reject });
        }
      });

    // Kick off generation. We don't await here so we can yield tokens
    // through the async generator as they arrive.
    const generationPromise = runChat(this.pipeline, chatMessages, {
      ...this.genOptions(),
      onToken: (delta) => push(delta),
    })
      .then(() => {
        done = true;
        push(null);
      })
      .catch((e) => {
        error = e;
        // Reject any pending waiters so the consumer sees the failure.
        while (waiters.length) {
          const w = waiters.shift();
          w?.reject(e);
        }
      });

    while (true) {
      const token = await next();
      if (token === null) break;
      yield new ChatGenerationChunk({
        text: token,
        message: new AIMessageChunk({ content: token }),
      });
    }

    // Surface any error that fired after the queue drained.
    await generationPromise;
  }
}

/**
 * Translate LangChain `BaseMessage[]` into the simple
 * `{role, content}[]` shape `runChat` expects. Anything that isn't a
 * system / human / AI message is coerced to a user turn — fine for
 * our tool's single-prompt-per-call usage.
 */
function toChatMessages(messages: BaseMessage[]): ChatMessage[] {
  return messages.map((m): ChatMessage => {
    const content = flattenContent(m.content);
    if (m instanceof SystemMessage) return { role: "system", content };
    if (m instanceof HumanMessage) return { role: "user", content };
    if (m.getType() === "ai") return { role: "assistant", content };
    return { role: "user", content };
  });
}

/**
 * Reduce LangChain's `MessageContent` (string OR array of complex
 * parts, e.g. `[{ type: "text", text: "..." }, { type: "image_url", ... }]`)
 * down to a plain string our text-generation pipeline understands.
 * Image / non-text parts are skipped — Transformers.js text-generation
 * pipelines don't accept them anyway.
 */
function flattenContent(content: BaseMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content) {
    if (typeof part === "string") {
      parts.push(part);
    } else if (part && typeof part === "object" && "type" in part && part.type === "text") {
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") parts.push(text);
    }
  }
  return parts.join("\n");
}
