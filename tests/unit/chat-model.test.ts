/**
 * Unit tests for `TransformersJsChatModel` — the LangChain adapter
 * that bridges our chat-tier registry to the underlying
 * Transformers.js `text-generation` pipeline.
 *
 * The contract we want to pin down here:
 *
 *   - When constructed with any LFM tier entry, the call that hits
 *     the pipeline ships `min_p` (Liquid AI's documented sampler)
 *     and a soft repetition penalty — *not* `top_p` or any of the
 *     SmolLM2-era loop crutches.
 *   - Constructor overrides win on a per-field basis without
 *     accidentally trashing the other tuned defaults.
 *   - A registry entry without `generationParams` falls back to
 *     neutral defaults rather than crashing.
 *
 * We don't run real inference — that's e2e territory. We stub the
 * pipeline as a plain function so we can inspect the options bag
 * the adapter sends to Transformers.js.
 */
import { HumanMessage } from "@langchain/core/messages";
import { describe, expect, it, vi } from "vitest";
import { TransformersJsChatModel } from "../../src/rag/chat-model.ts";
import { AI_MODELS, getChatModelId } from "../../src/utils/ai-models.ts";
import type { AiPipeline } from "../../src/utils/ai-runtime.ts";

/**
 * Build a stub pipeline that satisfies the structural shape `runChat`
 * casts to: a callable with a `tokenizer` field. Returns whatever the
 * caller hands in as the generated reply and records the options bag
 * that was passed in.
 */
function makeStubPipeline(reply = "stub answer"): {
  pipe: AiPipeline;
  lastOptions: () => Record<string, unknown> | null;
} {
  let last: Record<string, unknown> | null = null;
  const fn = vi
    .fn(async (_messages: unknown, options: Record<string, unknown>) => {
      last = options;
      return [{ generated_text: [{ role: "assistant", content: reply }] }];
    })
    // The cast in `runChat` reads `.tokenizer` off the callable;
    // attach a dummy so it doesn't blow up when we're not streaming.
    .mockName("stubPipeline") as unknown as ((
    msgs: unknown,
    opts: Record<string, unknown>,
  ) => Promise<unknown>) & { tokenizer: unknown };
  fn.tokenizer = {};
  return { pipe: fn as unknown as AiPipeline, lastOptions: () => last };
}

describe("TransformersJsChatModel — per-variant generation params", () => {
  it("LFM2-2.6B sends Liquid AI's min_p sampler, soft repetition penalty, and a degenerate-loop safety net", async () => {
    const { pipe, lastOptions } = makeStubPipeline();
    const info = AI_MODELS[getChatModelId("lfm2-2.6b")];
    const model = new TransformersJsChatModel({ pipeline: pipe, info });

    await model._call([new HumanMessage("hello")]);
    const opts = lastOptions();

    expect(opts).not.toBeNull();
    // Temperature 0.3 — Liquid AI's recommended default. We briefly
    // tried 0.4 hoping more variance would break single-token traps
    // ("To To …" loops), but the extra entropy started destabilising
    // the model in a different direction (off-language drift —
    // Arabic / French / philosophy-of-law content on questions
    // about a résumé). Staying at 0.3 + `no_repeat_ngram_size: 6`
    // gives us the loop safety net without the drift.
    expect(opts?.temperature).toBe(0.3);
    expect(opts?.min_p).toBe(0.15);
    expect(opts?.top_p).toBeUndefined();
    expect(opts?.repetition_penalty).toBe(1.05);
    // ngram=6 is a safety net for the "To To To … (252×)" single-
    // token loop the e2e probe surfaced. Locking it down so a future
    // PR that drops the safety net for "cleanliness" gets a test
    // failure to read before merging.
    expect(opts?.no_repeat_ngram_size).toBe(6);
    expect(opts?.max_new_tokens).toBe(256);
  });

  it("LFM2.5-1.2B sends the same Liquid AI sampler defaults (same family as LFM2-2.6B)", async () => {
    // Both Liquid AI tiers we ship (LFM2.5-1.2B-Instruct + LFM2-2.6B)
    // share the same training-recipe lineage and documented sampler —
    // we want a regression here if a future change makes them diverge
    // silently.
    const { pipe, lastOptions } = makeStubPipeline();
    const info = AI_MODELS[getChatModelId("lfm2.5-1.2b")];
    const model = new TransformersJsChatModel({ pipeline: pipe, info });

    await model._call([new HumanMessage("hello")]);
    const opts = lastOptions();

    expect(opts?.min_p).toBe(0.15);
    expect(opts?.top_p).toBeUndefined();
    expect(opts?.repetition_penalty).toBe(1.05);
    expect(opts?.no_repeat_ngram_size).toBe(6);
  });

  it("constructor overrides win without trashing other tuned defaults", async () => {
    // A test that overrides one knob shouldn't accidentally erase
    // the other variant-specific ones. Catches a refactor where
    // someone replaces `??` with `||` (which would zero out 0
    // values) or restructures the merge incorrectly.
    const { pipe, lastOptions } = makeStubPipeline();
    const info = AI_MODELS[getChatModelId("lfm2-2.6b")];
    const model = new TransformersJsChatModel({
      pipeline: pipe,
      info,
      temperature: 0.1, // override
    });

    await model._call([new HumanMessage("hello")]);
    const opts = lastOptions();

    expect(opts?.temperature).toBe(0.1); // overridden
    expect(opts?.min_p).toBe(0.15); // preserved
    expect(opts?.repetition_penalty).toBe(1.05); // preserved
    expect(opts?.max_new_tokens).toBe(256); // preserved
  });

  it("a model without generationParams falls back to neutral defaults", async () => {
    // Defensive — registry entries should always carry
    // generationParams, but the adapter shouldn't crash if one
    // doesn't. We synthesize a minimal info object missing the
    // params block and verify the adapter substitutes sensible
    // values rather than erroring or sending `undefined` knobs.
    const { pipe, lastOptions } = makeStubPipeline();
    const minimalInfo = {
      ...AI_MODELS[getChatModelId("lfm2.5-1.2b")],
      generationParams: undefined,
    };
    const model = new TransformersJsChatModel({ pipeline: pipe, info: minimalInfo });

    await model._call([new HumanMessage("hello")]);
    const opts = lastOptions();

    expect(opts?.max_new_tokens).toBe(256);
    expect(opts?.temperature).toBe(0.3);
    expect(opts?.repetition_penalty).toBe(1.1);
  });
});
