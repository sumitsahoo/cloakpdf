/**
 * Unit tests for pure helpers exported from the LangGraph state
 * machine. Spinning up the full graph in a test environment is
 * heavy (it needs a chat model + embedder); for the deterministic
 * pieces we test the helpers in isolation.
 */
import { describe, expect, it } from "vitest";
import {
  CHITCHAT_PROMPT,
  extractCoreQuery,
  HYDE_PROMPT,
  looksLikePastedProse,
  OFF_TOPIC_REFUSAL,
  SYSTEM_PROMPT,
} from "../../src/rag/graph.ts";

describe("extractCoreQuery (dilution-attack defence)", () => {
  it("returns the question alone when prose follows a `?` (canonical attack)", () => {
    // The exact shape a user can use to dilute an off-topic query:
    // off-topic question, then a long passage of generic English
    // that shifts the mean-pooled embedding toward neutral. We want
    // retrieval + the relevance gate to see only the question.
    const padded =
      "What is Lorem Ipsum? Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book.";
    expect(extractCoreQuery(padded)).toBe("What is Lorem Ipsum?");
  });

  it("truncates at the first proper sentence boundary even when there is no `?` (all-prose attack)", () => {
    // The variant the `?`-only heuristic missed: no question at all,
    // pure Lorem Ipsum prose. We need to truncate at the first
    // sentence end so the embedder sees a focused span instead of
    // mean-pooling across the whole passage.
    const padded =
      "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it.";
    expect(extractCoreQuery(padded)).toBe(
      "Lorem Ipsum is simply dummy text of the printing and typesetting industry.",
    );
  });

  it("leaves a single-sentence question untouched", () => {
    expect(extractCoreQuery("What is the title of this document?")).toBe(
      "What is the title of this document?",
    );
  });

  it("leaves a question with only a tiny trailing word untouched", () => {
    // A stray trailing word after the `?` (<20 chars) doesn't count
    // as padding — preserving the user's wording matters more than
    // micro-truncation.
    expect(extractCoreQuery("What is the phone? Thanks")).toBe("What is the phone? Thanks");
  });

  it("leaves a declarative input without any sentence terminator untouched", () => {
    expect(extractCoreQuery("Tell me about the work experience")).toBe(
      "Tell me about the work experience",
    );
  });

  it("preserves the 'Mr.' abbreviation pattern (head < 10 chars before the dot)", () => {
    // "Mr." has only 2 chars before the period — below the head
    // floor — so we don't truncate at that boundary. The full
    // sentence stays intact for retrieval.
    expect(extractCoreQuery("Mr. Sahoo works at Vodafone.")).toBe("Mr. Sahoo works at Vodafone.");
  });

  it("preserves a short two-sentence input where the tail isn't substantial", () => {
    // Both sentences together are < 200 chars, and the tail past
    // the first true sentence boundary is < PADDING_MIN_TAIL chars.
    // Nothing to truncate.
    expect(extractCoreQuery("Mr. Sahoo works at Google. He is great.")).toBe(
      "Mr. Sahoo works at Google. He is great.",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(extractCoreQuery("   What is the email?  ")).toBe("What is the email?");
  });

  it("handles a leading `?` defensively (no truncation)", () => {
    // Pathological input — `?` at position 0 means there's no
    // meaningful prefix to extract. We pass it through and let the
    // downstream gate / embedder decide.
    expect(extractCoreQuery("?")).toBe("?");
    expect(extractCoreQuery("? rest of text after stray punctuation")).toBe(
      "? rest of text after stray punctuation",
    );
  });

  it("handles multi-sentence questions where padding is on-topic", () => {
    // Padding doesn't have to be off-topic to trip the heuristic.
    // We unconditionally trim to the first proper sentence boundary
    // when there's substantial tail prose — the trade-off is that
    // the user's follow-up sentence isn't included in retrieval.
    // For Q&A this is the right call: retrieve on the first
    // question, the model can use the follow-up if it adds context
    // (it's in `state.question` for the LLM prompt).
    const input =
      "What are Sumit's main projects? I'm asking because I want to understand his background better before we have a conversation about engineering leadership.";
    expect(extractCoreQuery(input)).toBe("What are Sumit's main projects?");
  });

  it("caps long unpunctuated walls of text at 200 chars (no-sentence-boundary fallback)", () => {
    // The pathological variant: no sentence terminators at all,
    // just a wall of text. We cap the input fed to the embedder so
    // the mean-pooled vector stays focused regardless.
    const wall = "lorem ipsum ".repeat(40); // ~480 chars, no punctuation
    const result = extractCoreQuery(wall);
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it("does not cap short unpunctuated inputs", () => {
    const short = "tell me about sumit and his cloud work";
    expect(extractCoreQuery(short)).toBe(short);
  });
});

describe("looksLikePastedProse (pasted-prose attack defence)", () => {
  it("flags the canonical Lorem Ipsum paragraph (4 sentences = 3 boundaries, no `?`)", () => {
    const lorem =
      "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it. It has survived not only five centuries, but also the leap into electronic typesetting. It was popularised in the 1960s with the release of Letraset sheets.";
    expect(looksLikePastedProse(lorem)).toBe(true);
  });

  it("flags the same paragraph even when copied without the leading `L`", () => {
    // The exact shape the user pasted in the bug report — four
    // sentences = three sentence boundaries, no `?` anywhere.
    const lorem =
      "orem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets.";
    expect(looksLikePastedProse(lorem)).toBe(true);
  });

  it("does NOT flag a single-sentence question", () => {
    expect(looksLikePastedProse("What is the title of this document?")).toBe(false);
  });

  it("does NOT flag a single-sentence declarative input (no `?`)", () => {
    // No sentence boundaries past the first sentence — not the
    // pasted-prose shape.
    expect(looksLikePastedProse("Tell me about the work experience")).toBe(false);
  });

  it("does NOT flag a two-sentence input with no `?` (under the boundary threshold)", () => {
    // Two sentences = one boundary. We need >= 3 boundaries to flag.
    expect(looksLikePastedProse("Tell me about Sumit. He works at Vodafone.")).toBe(false);
  });

  it("does NOT flag a three-sentence input with no `?` (at boundary count 2, still under threshold)", () => {
    // Three sentences = two boundaries. Boundary threshold is >= 3.
    expect(
      looksLikePastedProse("Explain Sumit's work. List his projects. Describe his achievements."),
    ).toBe(false);
  });

  it("does NOT flag a long multi-sentence question that has a `?`", () => {
    // The presence of a `?` is the user signalling intent — even a
    // padded question goes through extractCoreQuery instead of
    // being refused outright.
    const padded =
      "What is Lorem Ipsum? Lorem Ipsum is simply dummy text. It has been around since the 1500s. It was popularised in the 1960s.";
    expect(looksLikePastedProse(padded)).toBe(false);
  });

  it("does NOT flag empty / whitespace input", () => {
    expect(looksLikePastedProse("")).toBe(false);
    expect(looksLikePastedProse("   ")).toBe(false);
  });
});

/**
 * Regression guard: the strings that get sent to the chat model as
 * system/user instructions must not bake in concrete content the
 * model could lift into its answer. Small LLMs (LFM2-2.6B in our
 * default bundle) copy in-prompt examples verbatim, so any stray
 * concrete value becomes a hallucination shape that fires on every
 * non-matching document.
 *
 * **History.** The system prompt once used the e2e résumé fixture's
 * exact header line — `"Sumit Sahoo is an Enterprise Architect …"` —
 * as a by-example illustration of "lead with name + role". On a
 * totally unrelated Google whitepaper the model reproduced it
 * verbatim: *"Sumit Sahoo is the Enterprise Architect behind the
 * content, focusing on prompt engineering strategies."* The
 * follow-up principle is **describe the output shape in words; never
 * by example** — placeholders like `<Name>` get copied just as
 * eagerly, often with the brackets included.
 *
 * Two categories of forbidden content:
 *   1. Test-fixture identifiers (the résumé fixture's name, phone,
 *      email, city, role) — direct leak of test data.
 *   2. Generic by-example content (concrete tool names,
 *      `<angle-bracket placeholders>`, demonstration phrases) —
 *      anything the model could treat as a template.
 */
describe("prompt hygiene (no by-example content)", () => {
  const FIXTURE_TOKENS = [
    // Test-fixture identifiers (résumé sample.pdf header):
    "Sumit",
    "Sahoo",
    "sumitsahoo",
    "7899800899",
    "+91-78",
    "Pune",
    "Maharashtra",
    "Enterprise Architect",
  ];
  // Common concrete content that's a smell when seen inside an
  // instruction string — these have shown up historically as
  // by-example illustrations and the model latches onto them. The
  // list is not exhaustive (any concrete name/tool is a smell);
  // these are the specific patterns the previous prompt drift
  // demonstrated.
  const BY_EXAMPLE_SMELLS = [
    // Placeholders the model literally echoes:
    "<Name>",
    "<Role>",
    "<Person>",
    // Concrete tool names that were used as "do not pad with these"
    // counter-examples in an earlier draft of SYSTEM_PROMPT — the
    // model treated them as a *suggestion list* on tech résumés.
    "Vue, Angular",
    "Django, Kubernetes",
    "Python (used for",
  ];
  const PROMPTS = {
    SYSTEM_PROMPT,
    HYDE_PROMPT,
    CHITCHAT_PROMPT,
    OFF_TOPIC_REFUSAL,
  };

  for (const [name, prompt] of Object.entries(PROMPTS)) {
    it(`${name} contains no résumé-fixture identifiers`, () => {
      for (const token of FIXTURE_TOKENS) {
        // Case-insensitive — the model's verbatim copies aren't case-
        // sensitive, so neither is the guard.
        expect(
          prompt.toLowerCase(),
          `${name} must not contain "${token}" — the model will copy it verbatim into answers. Describe the output shape in words, not by example.`,
        ).not.toContain(token.toLowerCase());
      }
    });

    it(`${name} contains no by-example illustrations`, () => {
      for (const token of BY_EXAMPLE_SMELLS) {
        expect(
          prompt,
          `${name} must not contain "${token}" — by-example content (placeholders, concrete tool names, demonstration phrases) gets lifted into answers by small LLMs.`,
        ).not.toContain(token);
      }
    });
  }
});
