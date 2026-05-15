/**
 * Unit tests for pure helpers exported from the LangGraph state
 * machine. Spinning up the full graph in a test environment is
 * heavy (it needs a chat model + embedder); for the deterministic
 * pieces we test the helpers in isolation.
 */
import { describe, expect, it } from "vitest";
import { extractCoreQuery } from "../../src/rag/graph.ts";

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
