/**
 * LangGraph state machine for the Ask PDF chat loop.
 *
 *                   ┌──────────────┐
 *                   │    START     │
 *                   └──────┬───────┘
 *                          │
 *                          ▼
 *                   ┌──────────────┐
 *                   │   classify   │  reads:  state.question
 *                   └──────┬───────┘  writes: state.intent
 *                          │
 *           ┌──────────────┴──────────────┐
 *  intent == chitchat               intent == question
 *  (small-talk regex)               (everything else)
 *           │                              │
 *           ▼                              ▼
 *   ┌──────────────┐               ┌──────────────┐
 *   │   chitchat   │               │   retrieve   │  reads:  state.question
 *   └──────┬───────┘               └──────┬───────┘  writes: state.docs,
 *          │                              │                 state.citedPages,
 *          │                              │                 state.offTopic
 *          │                              │
 *          │                ┌─────────────┴─────────────┐
 *          │           offTopic == true            offTopic == false
 *          │           (top cosine <                (top cosine ≥
 *          │            RELEVANCE_THRESHOLD)         RELEVANCE_THRESHOLD)
 *          │                │                              │
 *          │                ▼                              ▼
 *          │         ┌──────────────┐               ┌──────────────┐
 *          │         │    refuse    │               │   generate   │  reads:  state.docs
 *          │         └──────┬───────┘               └──────┬───────┘          state.question
 *          │                │                              │           writes: state.answer
 *          ▼                ▼                              ▼
 *                   ┌──────────────┐
 *                   │     END      │
 *                   └──────────────┘
 *
 * **Why a graph for what feels like a 3-step pipeline:**
 *
 *   - The two branch points (chitchat-vs-question, off-topic-vs-on-
 *     topic) compose cleanly as conditional edges. The alternative
 *     — `if/else` inside one giant `ask` function — buries the
 *     control flow in imperative code and makes adding a fourth
 *     branch (e.g. a future "low-confidence ⇒ ask user to clarify"
 *     node) much harder.
 *
 *   - State has a single typed schema (`RagState`). Every node
 *     reads/writes a tagged subset, so when a new node is added the
 *     surface area to think about is the state diff, not "what does
 *     this function take and return".
 *
 *   - LangGraph's compiled graph is the durable artifact other parts
 *     of LangChain (callbacks, tracing, streaming) hook into. Rolling
 *     our own state machine would re-implement that infrastructure.
 *
 * **Why two gates instead of just trusting the system prompt:**
 *
 *   1. `classify` (SMALL_TALK_RE) routes greetings to `chitchat` so
 *      we don't burn an embedder pass + retrieval round-trip on
 *      "hi" / "thanks" / "ok".
 *   2. `retrieve` runs the cosine-similarity gate (top dense match
 *      vs RELEVANCE_THRESHOLD) and tags the state as `offTopic`
 *      when no chunk is a plausible answer. The `refuse` node then
 *      returns a canned message without ever calling the chat model.
 *      Background: SmolLM2-1.7B's instruction-following caves to
 *      confident general-knowledge answers — "the capital of France
 *      is Paris (page 5 of your document)" was the literal failure
 *      mode we observed. A prompt-only "do not use general
 *      knowledge" rule wasn't enough; a deterministic gate is.
 *
 * **Why a document anchor on retrieve:**
 *
 *   Identity / overview questions ("whose résumé is this?",
 *   "what's the title?") often score poorly against the title chunk
 *   under BGE — the title says "Sumit Sahoo / Enterprise Architect",
 *   the query says "whose résumé", and the encoder doesn't bridge
 *   them strongly enough for the chunk to land in the top-K. The
 *   answer is structurally always in the title block, so we merge
 *   `anchorChunks` (the doc's first chunk) into every retrieve
 *   result, deduplicated by chunkId. Cost: at most one extra chunk
 *   in context.
 */
import type { Document } from "@langchain/core/documents";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseRetriever } from "@langchain/core/retrievers";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { TransformersJsChatModel } from "./chat-model.ts";
import type { ChunkMetadata } from "./chunking.ts";
import {
  tryDocumentTypeAnswer,
  tryTopicAbsenceRefusal,
  tryVerbatimExtraction,
} from "./fast-paths.ts";

/**
 * System prompt for the on-device chat model (currently SmolLM2-1.7B).
 *
 * Three things this phrasing is specifically engineered for:
 *
 *   1. **Structural inference.** The first version refused to say
 *      "this is a résumé" because no excerpt literally claimed so —
 *      even though the chunks contained a name, a contact block, a
 *      work experience section, a skills list, and a "Languages"
 *      block (textbook résumé layout). We explicitly grant the model
 *      permission to identify document type from those cues instead
 *      of demanding verbatim grounding for every claim.
 *
 *   2. **Format adapts to the question.** "What is this about?" wants
 *      prose; "What tools are mentioned?" wants a list. The earlier
 *      "1–3 sentences, never a list" rule (a SmolLM2-360M loop crutch)
 *      forced a single shape regardless of intent.
 *
 *   3. **Honest about gaps.** When the excerpts don't cover the
 *      question we want a one-line "the excerpts don't say", not a
 *      confident hallucination. Stays at the end so the model has
 *      already considered the rest of the rules.
 *
 *   4. **Identity questions get described, not just named.** An
 *      earlier version of the verbatim-extraction rule listed
 *      "names" alongside phone numbers / emails / URLs, with a "no
 *      preamble, no hedging — lead with the value" instruction.
 *      That worked for `Give me Sumit's phone number.` → `+91-…`
 *      but broke `who is sumit` → the model dumped just
 *      `Sumit Sahoo` with no description. The fix splits names off
 *      into a separate "who is X" rule that asks for 1-3 sentences
 *      of context on top of the name. Phone / email / address
 *      extraction is unchanged because those go through the
 *      verbatim fast-path (which never invokes the LLM) on the
 *      common phrasings, and the rule-1 verbatim-quote-only
 *      instruction still applies to the long-tail phrasings that
 *      do reach the LLM.
 */
/**
 * **Hard rule: no by-example illustrations of names, roles, tools, or
 * any other content the model could lift into an answer.**
 *
 * Small chat models (LFM2-2.6B in our shipping bundle) are prone to
 * copying any concrete example they see in their instructions into
 * the answer — especially when the retrieved excerpts don't strongly
 * anchor an alternative. A previous version of this prompt
 * illustrated the "lead with name + role" shape with the literal
 * string `"Sumit Sahoo is an Enterprise Architect …"` (matching the
 * e2e résumé fixture's header). On the Google Prompt Engineering
 * whitepaper — a totally unrelated PDF — the model echoed it back
 * verbatim: *"Sumit Sahoo is the Enterprise Architect behind the
 * content, focusing on prompt engineering strategies."*
 *
 * The fix is *not* to swap in a placeholder example (`<Name> is a
 * <Role>`) — the model will copy that just as readily, sometimes
 * outputting the angle brackets unchanged. Instead, describe the
 * desired output **shape** in words and rely on the grounded
 * excerpts to supply the actual values. The unit test in
 * `tests/unit/rag-graph.test.ts` blocks any concrete name / phone /
 * email / city / common tool name from appearing here in future.
 */
export const SYSTEM_PROMPT = `You answer questions about a PDF. The user message contains the document header (title and contact block) followed by relevant excerpts.

How to answer:
- Read the header and excerpts. Most questions can be answered directly from them — scan for the relevant span and use it.
- For specific values (phone numbers, emails, URLs, addresses, dates, prices, IDs): find the value in the header or excerpts and quote it EXACTLY, every character. Lead the reply with the value itself — no preamble, no hedging.
- For "who is X?" / "tell me about X" / "describe X" where X is a person named in the header: write 1-3 sentences describing X's role, expertise, and key details from the header and excerpts. Lead with the person's full name followed by their role, taken verbatim from the header. Do not invent or substitute a name — if the header does not name a person, do not produce one. Do not reply with just the name on its own.
- For "what is this document?" / "whose document is this?": identify the type from structure. A person's name plus a contact block plus work-experience sections is a résumé / CV. An executive summary plus numbered sections is a report. Line items plus a total is an invoice. Name the person or entity from the header — never "the author".
- For lists (tools, technologies, skills, dates): copy the names verbatim from the excerpts as a short comma-separated list. Do not add parenthetical descriptions for any item. Do not pad the list with items the excerpts do not name.
- Keep answers tight: one sentence for a single fact, up to three for overviews. Cite (page N) only for facts visible on that page.

When the question asks about a specific topic, technology, or named entity:
- Scan the excerpts for that exact word (or an obvious variant). If it is not present, reply with exactly one sentence: "The document doesn't mention {topic}." Do not describe the topic from general knowledge, even briefly.

When the answer is not in the header or excerpts:
- Reply with exactly one sentence: "I couldn't find that in this document." Do not guess. Do not invent values, names, or numbers.

When the question is unrelated to the document:
- Decline in one sentence and invite a question about the PDF. Do not answer the off-topic question even partially.

Never use general knowledge. Never fabricate facts or citations. Treat the header as authoritative for identity, title, and contact information.`;

export const CHITCHAT_PROMPT =
  "You are a friendly assistant who helps a user explore a PDF document. Respond briefly to the user's greeting and invite them to ask something specific about the document.";

/**
 * HyDE prompt — asks the chat model for a 1-sentence guess of what
 * the answer would be, given only the question. The guess doesn't
 * need to be *correct* (the model probably can't be without seeing
 * the document); it just needs to sit in the same semantic
 * neighborhood as the real answer would. That neighborhood is what
 * the embedder uses to retrieve the right chunks.
 *
 * Intentionally constrained: "one short sentence" cap keeps the
 * generation under ~80 tokens, capping the latency penalty per
 * question to a single chat-model forward pass.
 */
export const HYDE_PROMPT = `You are a helper that writes a single short hypothetical answer to a question. The answer will be used to search a document for relevant passages — it doesn't need to be correct, just plausible in shape and vocabulary.

Rules:
- Output exactly one sentence.
- Use the kind of words that would appear in a real answer (specific nouns, concrete terms — not "the document discusses...").
- Don't ask for clarification. Don't say "I don't know". Just guess.`;

/**
 * Canned reply for questions whose best embedding match against the
 * corpus falls below {@link RELEVANCE_THRESHOLD}. Written to be polite
 * but unambiguous about the scope — "I can only answer questions about
 * the uploaded document" is the entire contract.
 */
export const OFF_TOPIC_REFUSAL =
  "I can only answer questions about the document you uploaded. Could you ask something about its contents instead?";

/**
 * Minimum cosine similarity between the query embedding and the
 * best-matching chunk for us to attempt an answer.
 *
 * **bge-base history (kept for context):**
 *
 *   - on-topic "what tools are mentioned?"  → top cosine ≈ 0.65
 *   - on-topic "what is this about?"        → top cosine ≈ 0.50
 *   - off-topic "capital of France?"        → top cosine ≈ 0.40 (!)
 *
 *   The off-topic floor sat at 0.40 because bge embedded "capital of
 *   France" weakly against the contact block ("Pune, Maharashtra,
 *   India" — a city + country combo). 0.50 was the safe threshold.
 *
 * **EmbeddingGemma (current).** The model is trained for asymmetric
 * retrieval with task prefixes, so the absolute scale is different.
 * Empirically the gap between on-topic and off-topic widens — the
 * search-result/document prefixes effectively encode "this is a
 * retrieval scenario" into both sides, so generic-knowledge queries
 * that incidentally word-overlap with chunks score lower than they
 * did under bge. We keep the threshold at **0.5** as a starting
 * point and recalibrate from the retrieval probe (see
 * `tests/retrieval-debug/*.json` — re-run `pnpm test:probe` after a
 * model swap and confirm the off-topic question still refuses).
 *
 * False rejections on legitimate obscure questions are possible at
 * this threshold — that's an accuracy/safety trade we accept because
 * the alternative (the LLM hallucinating a fake page citation —
 * literal failure mode we observed) is materially worse.
 */
const RELEVANCE_THRESHOLD = 0.5;

/**
 * Per-chunk dense-cosine floor for the post-retrieval relevance
 * filter.
 *
 * **Why a separate, lower threshold than {@link RELEVANCE_THRESHOLD}.**
 * The off-topic gate at the top of retrieve fires on the
 * **best-in-corpus** chunk's score — if even the strongest match
 * falls below 0.5 the question is almost certainly off-topic and the
 * graph routes to `refuse`. Past that gate we have a top-K from the
 * hybrid retriever, but RRF can surface chunks that scored high on
 * BM25's lexical signal while scoring weakly on the embedder. Those
 * are the noise inputs SmolLM2-1.7B reliably hallucinates around —
 * the LLM tries to weave the marginal chunk's contents into an
 * answer even when the chunk is only tangentially on topic.
 *
 * 0.30 is set below the off-topic gate so it almost always preserves
 * the top-ranked chunk that justified passing the gate, but above
 * the "pure noise" floor where chunks contribute meaningful
 * grounding. Empirically (probe dumps in `tests/retrieval-debug/`):
 *
 *   - top-of-corpus on-topic chunks score 0.5-0.8
 *   - mid-relevant chunks score 0.35-0.5
 *   - BM25-only lexical surfaces score 0.20-0.30
 *
 * Filtering at 0.30 catches the third tier while keeping the first
 * two. If filtering would drop everything (worst-case adversarial
 * input), we degrade gracefully and keep the raw RRF top-K.
 */
const PER_CHUNK_FLOOR = 0.3;

/** Recognises greetings / acknowledgements that don't need retrieval. */
const SMALL_TALK_RE =
  /^(hi+|hello|hey+|yo|sup|hola|howdy|good (morning|afternoon|evening)|thanks?|thank you|ok|okay|cool|nice|got it)[!.?]*$/i;

function isSmallTalk(q: string): boolean {
  const trimmed = q.trim().toLowerCase();
  if (trimmed.length <= 2) return true;
  return SMALL_TALK_RE.test(trimmed);
}

/**
 * localStorage flag that disables HyDE when set to "0". Default =
 * enabled. The e2e comparison orchestrator flips this for cross-cut
 * measurement runs.
 */
export const RAG_HYDE_FLAG = "cloakpdf:rag-hyde";

function hydeEnabled(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    return localStorage.getItem(RAG_HYDE_FLAG) !== "0";
  } catch {
    return true;
  }
}

/**
 * Heuristics that gate when HyDE is worth running.
 *
 *   - **Very short queries** (< 18 chars): too little signal to
 *     meaningfully re-encode. The hypothetical-answer prompt would
 *     spend more inference time than the embedding lookup it's
 *     trying to improve.
 *   - **Fast-path-eligible shapes**: contact extraction (phone /
 *     email / address) and "who is X" identity questions hit the
 *     deterministic fast-paths in [fast-paths.ts](./fast-paths.ts)
 *     before the LLM ever sees them — the retrieval result for these
 *     is only used as a sanity check, not as the actual answer
 *     source. HyDE here is pure latency tax.
 *   - **Pasted prose** (multi-sentence paragraph with no `?`): the
 *     pasted-prose defense in `looksLikePastedProse` short-circuits
 *     to off-topic anyway; HyDE on top would waste a generation.
 *
 * Everything else (open-ended questions, paraphrased queries) gets
 * the HyDE rewrite — that's where the recall lift actually shows.
 */
const HYDE_SKIP_MIN_LEN = 18;
const HYDE_FAST_PATH_RE = /\b(phone|email|address|contact|who\s+is|who's|who\b)\b/i;

function shouldSkipHyde(question: string): boolean {
  const trimmed = question.trim();
  if (trimmed.length < HYDE_SKIP_MIN_LEN) return true;
  if (HYDE_FAST_PATH_RE.test(trimmed)) return true;
  if (looksLikePastedProse(trimmed)) return true;
  return false;
}

/**
 * Minimum length of trailing prose past a sentence boundary for
 * {@link extractCoreQuery} to treat the input as "padded" and
 * truncate. Picked so a trailing space + a stray word doesn't trip
 * the truncation, but a sentence or more does.
 */
const PADDING_MIN_TAIL = 20;

/**
 * Minimum length of content *before* a sentence boundary for
 * {@link extractCoreQuery} to consider it a real boundary rather
 * than a fragment ending in an abbreviation. Catches "Mr.", "Dr.",
 * "U.S.", "etc." — anything shorter than this floor is presumed an
 * abbreviation and the matcher walks to the next candidate.
 */
const PADDING_MIN_HEAD = 10;

/**
 * Hard cap on what's fed to the embedder + BM25 when the input has
 * no sentence terminator at all. EmbeddingGemma's vector is mean-
 * pooled across all tokens; capping the input keeps the centroid
 * focused even if the user pastes a long unpunctuated wall of text.
 */
const EMBED_HARD_CAP = 200;

/**
 * Pluck the user's actual question out of a padded input.
 *
 * **The dilution attack this defends against.** EmbeddingGemma
 * mean-pools tokens to produce a single 768-dim vector per input.
 * A short focused query like `"What is Lorem Ipsum?"` produces a
 * vector that's well off-axis from any chunk of an arbitrary PDF —
 * top dense cosine ≈ 0.30–0.40, comfortably under the 0.5 off-topic
 * gate. Appending a paragraph of generic English ("Lorem Ipsum is
 * simply dummy text of the printing and typesetting industry…")
 * dilutes that vector toward the centroid of common English prose,
 * which sits closer to *any* arbitrary text chunk than the focused
 * query did. The top cosine drifts up past 0.5, the gate accepts
 * the question, and SmolLM2 confabulates an answer with fabricated
 * page citations from the RRF top-K.
 *
 * BM25 has the symmetric problem: padding adds high-frequency
 * English tokens that match against arbitrary chunks lexically,
 * boosting their BM25 score for the wrong reasons.
 *
 * **The strategy.** Three layers, applied in order:
 *
 *   1. **Sentence-boundary truncation.** If the input contains any
 *      sentence-ending punctuation (`.`, `?`, `!`) followed by
 *      whitespace + a capital letter — the canonical sentence-break
 *      shape in English — and the punctuation is preceded by at
 *      least {@link PADDING_MIN_HEAD} chars (to dodge abbreviations
 *      like `Mr.`) and followed by at least {@link PADDING_MIN_TAIL}
 *      chars of further prose, truncate to that boundary.
 *
 *   2. **Length cap.** If no sentence boundary triggers but the
 *      input is longer than {@link EMBED_HARD_CAP} chars, cap it.
 *      Catches the no-punctuation flavour of the attack ("lorem
 *      ipsum is simply dummy text of the printing and typesetting
 *      industry lorem ipsum has been …").
 *
 *   3. **Pass-through.** Short, single-sentence inputs go through
 *      untouched.
 *
 * The full text is still shown to the LLM via `state.question` so
 * the caller's wording is preserved on legitimate long-question
 * cases. Retrieval and the off-topic gate are the only consumers
 * of the truncated form, and a focused query is what they're
 * designed to operate on.
 */
/**
 * Detect the "pasted prose" attack shape — multiple declarative
 * sentences with no question mark anywhere in the input. This is
 * the signature of someone copy-pasting a paragraph (Lorem Ipsum,
 * a chunk of an unrelated article, etc.) instead of asking a
 * question.
 *
 * **Why this exists in addition to the off-topic gate.** With a
 * strong general-purpose embedder like EmbeddingGemma, any English
 * prose embeds into a "generic explanation" cluster that has
 * positive cosine with the prose chunks of *any* well-written PDF.
 * The 0.5 absolute threshold can be defeated by enough English-y
 * tokens. Meanwhile BM25's score (with the upstream library's
 * substring-TF behaviour) collapses to "which chunk has the most
 * stopwords" because the discriminating tokens — `lorem`, `ipsum`,
 * `dummy`, `typesetting` — don't appear in any real PDF. The result:
 * retrieval surfaces chunks ranked by stopword density, the gate
 * thinks the question is on-topic, and the LLM confabulates an
 * answer with fabricated citations.
 *
 * **The shape signal.** Real users type questions or commands:
 * either one sentence ending in `?`, or a short imperative. A
 * paragraph of 4+ sentences with no `?` anywhere is virtually never
 * a real chat input. The check is deliberately strict on both axes
 * (>= 3 sentence boundaries AND no `?`) so we never refuse a
 * legitimate query that happens to span a couple of sentences for
 * context.
 */
export function looksLikePastedProse(question: string): boolean {
  const trimmed = question.trim();
  if (trimmed.includes("?")) return false;
  // Match `[.!] whitespace + capital letter` — the canonical English
  // sentence-break shape. We don't require 100% accuracy; the
  // threshold of 3 sentence boundaries (= 4 sentences in the input)
  // is high enough that occasional miscounts on abbreviations don't
  // false-positive on real questions.
  const boundaries = trimmed.match(/[.!]\s+[A-Z]/g);
  return (boundaries?.length ?? 0) >= 3;
}

export function extractCoreQuery(question: string): string {
  const trimmed = question.trim();
  // Walk every `[punct][space][capital]` candidate; pick the first
  // one with enough content before AND enough prose after to
  // qualify as a real sentence boundary worth truncating at.
  const boundaryRe = /[.?!]\s+[A-Z]/g;
  for (const match of trimmed.matchAll(boundaryRe)) {
    if (match.index === undefined || match.index < PADDING_MIN_HEAD) continue;
    const cutPoint = match.index + 1;
    const tailLength = trimmed.length - cutPoint;
    if (tailLength < PADDING_MIN_TAIL) continue;
    return trimmed.slice(0, cutPoint).trim();
  }
  if (trimmed.length > EMBED_HARD_CAP) {
    return trimmed.slice(0, EMBED_HARD_CAP).trim();
  }
  return trimmed;
}

/**
 * Shared state schema for the RAG graph. `Annotation.Root` gives us a
 * typed channel-based state with default reducers (last-write-wins on
 * primitives, override on objects) — fine for a linear flow.
 */
export const RagStateAnnotation = Annotation.Root({
  question: Annotation<string>(),
  /**
   * Query used for retrieval — either the user's original question or
   * a HyDE-generated hypothetical answer. Defaults to `question` when
   * the `hyde` node short-circuits (small queries, fast-path-eligible
   * shapes, or the user-disabled feature flag).
   */
  searchQuery: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
  /**
   * Routing tag. `classify` sets this to `"chitchat"` or `"question"`;
   * `retrieve` may then re-tag a `"question"` as `"off-topic"` when
   * the dense-similarity gate fires. Surfaced on `AskResult` so the
   * UI can hide citation chrome on refused turns.
   */
  intent: Annotation<"chitchat" | "question" | "off-topic" | undefined>(),
  /**
   * Set by `retrieve` when the best-matching chunk scores below the
   * relevance threshold. Routes the graph to `refuse` instead of
   * `generate` so the chat model never sees obviously off-topic
   * queries.
   */
  offTopic: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  docs: Annotation<Document<ChunkMetadata>[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  citedPages: Annotation<number[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  answer: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
});

export type RagState = typeof RagStateAnnotation.State;

/**
 * What {@link BuildGraphOptions.scoreRelevance} returns: the best
 * dense-cosine score in the corpus (drives the off-topic gate) plus
 * a map from `chunkId` to that chunk's individual score (drives the
 * post-retrieval per-chunk filter in {@link PER_CHUNK_FLOOR}).
 *
 * Bundling both into one call avoids embedding the query twice per
 * question — the dense pass over the corpus is what produces both
 * numbers anyway.
 */
export interface RelevanceContext {
  /** Maximum dense-cosine score across the whole corpus. */
  topScore: number;
  /** `chunkId` → that chunk's dense-cosine score. */
  chunkScores: Map<string, number>;
}

export interface BuildGraphOptions {
  /** Hybrid retriever (BM25 ⨂ dense, fused via RRF). */
  retriever: BaseRetriever;
  /** Wrapped chat model — drives both `generate` and `chitchat` nodes. */
  chatModel: TransformersJsChatModel;
  /**
   * Returns the maximum cosine similarity between the query and the
   * indexed document, plus the per-chunk scores. When provided, the
   * graph short-circuits to a canned refusal when the top score
   * falls below {@link RELEVANCE_THRESHOLD}, and filters individual
   * retrieved chunks below {@link PER_CHUNK_FLOOR} before handing
   * them to the LLM — see the file header comment for why a
   * prompt-only guard isn't sufficient with SmolLM2-1.7B.
   */
  scoreRelevance?: (query: string) => Promise<RelevanceContext>;
  /**
   * "Anchor" chunks merged into every retrieve result, deduplicated
   * against the hybrid hits by `chunkId`. Typically the document's
   * first chunk — the place where titles, names, and other
   * structural identifiers live. Lets the LLM answer "whose résumé
   * is this?" / "what's the document title?" reliably without
   * relying on the embedder to bridge "whose" → a name.
   */
  anchorChunks?: Document<ChunkMetadata>[];
  /**
   * Streaming callback fired for each decoded token during the
   * `generate` and `chitchat` nodes. Lets the UI render a typewriter
   * effect without owning the model directly.
   */
  onToken?: (delta: string) => void;
}

/**
 * Build (but don't run) the LangGraph state graph. The caller invokes
 * `.compile().invoke(...)` per question.
 */
export function buildRagGraph(options: BuildGraphOptions) {
  const { retriever, chatModel, scoreRelevance, anchorChunks, onToken } = options;

  /** classify → mark the user's input as chitchat vs. real question. */
  async function classify(state: RagState): Promise<Partial<RagState>> {
    return { intent: isSmallTalk(state.question) ? "chitchat" : "question" };
  }

  /**
   * hyde → optionally rewrite the retrieval query as a hypothetical
   * answer (Hypothetical Document Embeddings, [Gao et al. 2022]).
   *
   * The user's question and a hypothetical answer occupy different
   * regions of the embedding space — a question is a *query* shape
   * ("what tools does X use?") while a document chunk is a *statement*
   * shape ("X uses Python, JavaScript, and Docker"). Embedding the
   * question directly asks the retriever to match a query against
   * statements, which works but bridges a stylistic gap each time.
   * Embedding a hypothetical answer (a fake statement that sits in
   * the same semantic neighborhood as the real answer) lets the
   * retriever do statement-to-statement matching — typically tighter
   * cosine on the right chunk.
   *
   * **When we skip:** see {@link shouldSkipHyde}. Fast-path-eligible
   * questions (phone, email, "who is X") and very short queries don't
   * benefit enough to justify the extra chat-model forward pass. The
   * `RAG_HYDE_FLAG` localStorage flag also disables HyDE globally for
   * A/B testing.
   *
   * **Cost:** one chat-model call with `maxNewTokens: 80`. On
   * LFM2.5-1.2B that's ~600-1500 ms added per question. Bounded.
   */
  async function hyde(state: RagState): Promise<Partial<RagState>> {
    // Skip-cases set searchQuery = original question so retrieve
    // uses the user's wording. The reducer is last-write-wins so
    // this is the canonical place to set the default.
    if (!hydeEnabled() || shouldSkipHyde(state.question)) {
      return { searchQuery: state.question };
    }
    try {
      // No `onToken` callback — HyDE is an internal step the user
      // shouldn't see token-by-token. The chat model's own
      // `maxNewTokens` (256 for our LFM tiers) caps total latency
      // and the prompt explicitly asks for "one short sentence" so
      // the model typically stops well before the cap.
      const hypothetical = await streamReply(
        chatModel,
        HYDE_PROMPT,
        null,
        state.question,
        undefined,
      );
      const trimmed = hypothetical.trim();
      // Defensive: if the model returned nothing useful (whitespace,
      // single token), fall back to the question rather than
      // embedding noise.
      if (trimmed.length < 8) {
        return { searchQuery: state.question };
      }
      // Compose: original question + hypothetical. The original keeps
      // discriminating tokens (named entities, specific nouns) that
      // the hypothetical may have generalised away; the hypothetical
      // adds the statement-shape vocabulary HyDE is meant to provide.
      return { searchQuery: `${state.question}\n${trimmed}` };
    } catch (e) {
      console.warn("[hyde] hypothetical generation failed; using raw question", e);
      return { searchQuery: state.question };
    }
  }

  /**
   * retrieve → hybrid BM25 + dense, top-K via RRF, plus a cosine-
   * similarity guard that flags off-topic queries AND a per-chunk
   * relevance filter that drops marginal noise before the LLM ever
   * sees it.
   *
   * Four things happen here, in parallel where possible:
   *
   *   1. **Hybrid retrieval.** BM25 and dense each return up to
   *      CANDIDATE_K candidates; RRF fuses them to the top
   *      HYBRID_TOP_K. See `retrievers/hybrid.ts`.
   *
   *   2. **Relevance gate.** The best dense cosine across the whole
   *      corpus tells us if any chunk is plausibly an answer. When
   *      it falls below RELEVANCE_THRESHOLD we tag the state as
   *      `offTopic` so the conditional edge routes to `refuse`. The
   *      dense pass also produces per-chunk scores used in step 3.
   *
   *   3. **Per-chunk filter.** Among the RRF-fused top-K, drop any
   *      chunk whose dense cosine is below PER_CHUNK_FLOOR. RRF can
   *      surface chunks that scored on BM25's lexical signal while
   *      barely matching semantically; those are the noise inputs
   *      SmolLM2-1.7B reliably hallucinates around. If filtering
   *      would drop everything (worst-case), degrade gracefully and
   *      keep the raw RRF top-K so the LLM still has something.
   *
   *   4. **Anchor merge.** The document's title chunk gets merged
   *      into the result set if it isn't already there. Done after
   *      filtering so the anchor is never filtered out — see the
   *      file-header rationale.
   *
   * Errors in `scoreRelevance` (e.g. embedder crash) degrade
   * gracefully — we skip both the gate and the filter rather than
   * silently refusing every question.
   */
  async function retrieve(state: RagState): Promise<Partial<RagState>> {
    // Shape check first — pasted prose (multi-sentence paragraph
    // with no question mark) is virtually never a real chat input,
    // and both BM25 and dense retrieval will surface noise chunks
    // for it. Short-circuit to off-topic so the user gets an
    // immediate refusal with empty citations, no embedder pass, no
    // RRF fusion. See `looksLikePastedProse`.
    if (looksLikePastedProse(state.question)) {
      recordRetrievalDebug(state.question, [], 0, true);
      return { docs: [], citedPages: [], offTopic: true };
    }
    // Defang the dilution attack (see `extractCoreQuery`) by routing
    // retrieval + the relevance gate through the user's actual
    // question, not the full padded input. `state.question` still
    // carries the original text downstream (fast-paths, LLM prompt),
    // so the user sees their own wording answered or refused.
    //
    // If the `hyde` node ran, `state.searchQuery` holds the
    // hypothetical-answer rewrite (concatenated with the original
    // question). Use that for retrieval — the embedder gets a
    // statement-shape query that matches chunk-shape text better
    // than a bare question. Fall back to the user's question when
    // HyDE was skipped or disabled.
    const queryForRetrieval =
      state.searchQuery && state.searchQuery.trim().length > 0 ? state.searchQuery : state.question;
    const coreQuery = extractCoreQuery(queryForRetrieval);
    const [hitsRaw, relevance] = await Promise.all([
      retriever.invoke(coreQuery) as Promise<Document<ChunkMetadata>[]>,
      scoreRelevance ? scoreRelevance(coreQuery).catch(() => null) : Promise.resolve(null),
    ]);
    const topScore = relevance?.topScore ?? 1;
    const offTopic = topScore < RELEVANCE_THRESHOLD;
    const filteredRaw = filterByChunkRelevance(hitsRaw, relevance);
    const hits = mergeAnchorChunks(filteredRaw, anchorChunks ?? []);
    const citedPages = uniqueSortedPages(hits);
    recordRetrievalDebug(state.question, hits, topScore, offTopic);
    return { docs: hits, citedPages, offTopic };
  }

  /** refuse → canned polite decline for off-topic queries. */
  async function refuse(_state: RagState): Promise<Partial<RagState>> {
    const message = OFF_TOPIC_REFUSAL;
    // Emit as a single chunk for UX consistency with the streaming
    // nodes — the assistant bubble fills in without needing to
    // special-case "non-streamed" rendering in the UI.
    onToken?.(message);
    return { answer: message, citedPages: [], intent: "off-topic" };
  }

  /**
   * generate → stream the grounded answer.
   *
   * Context layout: anchor chunks (the document header / contact block)
   * are pulled out and presented FIRST under an explicit
   * `[Document header — Page N]` label, with the rest of the
   * retrieval hits following under `[Relevant excerpts]`. Two reasons
   * to label them this way:
   *
   *   1. **Framing for overview questions.** Without the explicit
   *      label the model treats every chunk equally and can frame the
   *      document around whichever project chunk got fused in first —
   *      we observed it summarising the résumé as "a Dell finance
   *      reporting platform document" because a Dell project chunk
   *      scored highly. Labelling the header tells the model "this is
   *      what the document IS".
   *   2. **Authority for extraction questions.** When the user asks
   *      for a phone/email/address, the model should look at the
   *      contact block first. Putting it under an explicit header
   *      label makes that lookup an obvious move rather than a
   *      heuristic the model has to discover.
   */
  async function generate(state: RagState): Promise<Partial<RagState>> {
    if (state.docs.length === 0) {
      return { answer: "I could not find any relevant passages for that question." };
    }

    // ── Deterministic fast paths ──────────────────────────────────
    //
    // Each function in `fast-paths.ts` is a pure pattern-match over
    // (question, docs) → {value, citedPages} | null. They bypass the
    // chat model for question shapes where regex / substring checks
    // over the retrieved chunks are far more reliable than asking
    // SmolLM2-1.7B to do it — see the module's header comment for
    // the failure modes that motivated each.
    //
    // Order: narrowest → broadest. Verbatim contact extraction
    // matches a very tight phone/email intent against anchor chunks;
    // doc-type identification fires only when the anchor structure
    // looks like a résumé; topic-absence refusal catches "what does
    // the document say about X?" when X isn't anywhere in the
    // retrieved chunks (the most common hallucination trigger). The
    // first hit short-circuits the LLM call entirely.
    const anchors = anchorChunks ?? [];
    const fastHit =
      tryVerbatimExtraction(state.question, anchors) ??
      tryDocumentTypeAnswer(state.question, anchors) ??
      tryTopicAbsenceRefusal(state.question, state.docs);
    if (fastHit) {
      onToken?.(fastHit.value);
      return { answer: fastHit.value, citedPages: fastHit.citedPages };
    }

    const anchorIds = new Set((anchorChunks ?? []).map((c) => c.metadata.chunkId));
    const headers = state.docs.filter((d) => anchorIds.has(d.metadata.chunkId));
    const others = state.docs.filter((d) => !anchorIds.has(d.metadata.chunkId));
    const orderedOthers = [...others].sort((a, b) => a.metadata.pageNumber - b.metadata.pageNumber);
    const headerBlock = headers
      .map((d) => `[Document header — Page ${d.metadata.pageNumber}]\n${d.pageContent.trim()}`)
      .join("\n\n");
    const excerptsBlock = orderedOthers
      .map((d) => `[Page ${d.metadata.pageNumber}]\n${d.pageContent.trim()}`)
      .join("\n\n");
    const contextBlock =
      headerBlock && excerptsBlock
        ? `${headerBlock}\n\n[Relevant excerpts]\n${excerptsBlock}`
        : headerBlock || excerptsBlock;
    const answer = await streamReply(
      chatModel,
      SYSTEM_PROMPT,
      contextBlock,
      state.question,
      onToken,
    );
    return { answer };
  }

  /** chitchat → friendly reply without retrieval. */
  async function chitchat(state: RagState): Promise<Partial<RagState>> {
    const answer = await streamReply(chatModel, CHITCHAT_PROMPT, null, state.question, onToken);
    return { answer, citedPages: [] };
  }

  const builder = new StateGraph(RagStateAnnotation)
    .addNode("classify", classify)
    .addNode("hyde", hyde)
    .addNode("retrieve", retrieve)
    .addNode("generate", generate)
    .addNode("chitchat", chitchat)
    .addNode("refuse", refuse)
    .addEdge(START, "classify")
    // classify routes chitchat directly to its own node; questions
    // run through `hyde` (which may no-op based on shape / flag)
    // before retrieve so the embedder gets the best-shaped query.
    .addConditionalEdges("classify", (s: RagState) =>
      s.intent === "chitchat" ? "chitchat" : "hyde",
    )
    .addEdge("hyde", "retrieve")
    .addConditionalEdges("retrieve", (s: RagState) => (s.offTopic ? "refuse" : "generate"))
    .addEdge("refuse", END)
    .addEdge("generate", END)
    .addEdge("chitchat", END);

  return builder.compile();
}

/**
 * Helper: stream the chat model and accumulate the full reply. We use
 * `.stream()` so the `onToken` callback can drive the typewriter UI
 * without buffering the whole response first.
 */
async function streamReply(
  model: TransformersJsChatModel,
  system: string,
  context: string | null,
  question: string,
  onToken?: (delta: string) => void,
): Promise<string> {
  const userContent = context
    ? `Document excerpts:\n${context}\n\nQuestion: ${question}`
    : question;
  const messages = [new SystemMessage(system), new HumanMessage(userContent)];
  let full = "";
  const stream = await model.stream(messages);
  for await (const chunk of stream) {
    // `chunk.content` is `string | MessageContentComplex[]`. For our
    // text-only chat model the streaming hook always emits strings; the
    // array branch only matters for multimodal models we don't ship.
    const piece = typeof chunk.content === "string" ? chunk.content : "";
    if (!piece) continue;
    full += piece;
    onToken?.(piece);
  }
  return full;
}

/** Unique, sorted page numbers from the retrieved chunks. */
function uniqueSortedPages(docs: Document<ChunkMetadata>[]): number[] {
  const set = new Set<number>();
  for (const d of docs) set.add(d.metadata.pageNumber);
  return [...set].sort((a, b) => a - b);
}

/**
 * Drop retrieved chunks whose individual dense-cosine score is below
 * {@link PER_CHUNK_FLOOR}. Operates on the order RRF produced so
 * surviving chunks keep their hybrid rank.
 *
 * Three degrade-gracefully cases:
 *   1. `relevance` is `null` (scoring failed) — skip filtering;
 *      return `hits` unchanged.
 *   2. A chunk's score is missing from the map — treat as 1 (keep)
 *      rather than 0 (drop). This shouldn't happen with a healthy
 *      embedder, but guards against partial-data races.
 *   3. The filter would empty the result — return the raw `hits`.
 *      An empty `docs` array short-circuits the `generate` node to
 *      a non-helpful "I could not find any relevant passages"
 *      reply, so we'd rather hand the LLM the weakest hits than
 *      claim emptiness when retrieval did surface something.
 */
function filterByChunkRelevance(
  hits: Document<ChunkMetadata>[],
  relevance: RelevanceContext | null,
): Document<ChunkMetadata>[] {
  if (!relevance) return hits;
  const filtered = hits.filter(
    (d) => (relevance.chunkScores.get(d.metadata.chunkId) ?? 1) >= PER_CHUNK_FLOOR,
  );
  return filtered.length > 0 ? filtered : hits;
}

/**
 * Append any anchor chunk that isn't already present in `hits`,
 * deduplicating by `chunkId`. Anchors land at the *end* of the list
 * so the fused top-K stays at the front for the LLM to read first,
 * but the document header is always somewhere in scope. The
 * `generate` node sorts by `pageNumber` before composing the prompt,
 * so visual ordering ends up document-order regardless of where the
 * anchor enters this list.
 */
function mergeAnchorChunks(
  hits: Document<ChunkMetadata>[],
  anchors: Document<ChunkMetadata>[],
): Document<ChunkMetadata>[] {
  if (anchors.length === 0) return hits;
  const seen = new Set(hits.map((h) => h.metadata.chunkId));
  const merged = [...hits];
  for (const a of anchors) {
    if (!seen.has(a.metadata.chunkId)) {
      merged.push(a);
      seen.add(a.metadata.chunkId);
    }
  }
  return merged;
}

/**
 * Push the retrieved chunks onto a `window.__cloakpdfRetrievals` array
 * when `localStorage["cloakpdf:debug"]` is set. Gated so the probe
 * can read structured retrieval results back from Puppeteer; off by
 * default and not referenced anywhere else in the app.
 */
interface RetrievalDebugRecord {
  question: string;
  hits: Array<{ chunkId: string; pageNumber: number; preview: string; length: number }>;
  /** Top dense-cosine score against the corpus. Used to tune {@link RELEVANCE_THRESHOLD}. */
  relevanceScore: number;
  /** Whether the retrieve node routed this query to `refuse`. */
  offTopic: boolean;
}
function recordRetrievalDebug(
  question: string,
  hits: Document<ChunkMetadata>[],
  relevanceScore: number,
  offTopic: boolean,
): void {
  if (typeof window === "undefined") return;
  try {
    if (!window.localStorage?.getItem("cloakpdf:debug")) return;
  } catch {
    return;
  }
  const w = window as unknown as { __cloakpdfRetrievals?: RetrievalDebugRecord[] };
  if (!Array.isArray(w.__cloakpdfRetrievals)) w.__cloakpdfRetrievals = [];
  w.__cloakpdfRetrievals.push({
    question,
    hits: hits.map((d) => ({
      chunkId: d.metadata.chunkId,
      pageNumber: d.metadata.pageNumber,
      preview: d.pageContent.slice(0, 240),
      length: d.pageContent.length,
    })),
    relevanceScore,
    offTopic,
  });
}
