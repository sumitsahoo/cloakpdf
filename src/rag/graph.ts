/**
 * LangGraph state machine for the Ask PDF chat loop.
 *
 *   ┌─────────────┐    chitchat    ┌───────────┐
 *   │  classify   │───────────────▶│  chitchat │──▶ END
 *   └──────┬──────┘                └───────────┘
 *          │ question
 *          ▼
 *   ┌─────────────┐                ┌───────────┐
 *   │  retrieve   │───────────────▶│  generate │──▶ END
 *   └─────────────┘                └───────────┘
 *
 * Why a graph for a three-node pipeline:
 *
 *   - The conditional edge after `classify` is the kind of branching
 *     LangGraph models cleanly without ad-hoc state passed through
 *     function arguments.
 *   - Adding nodes later (query rewriting, hallucination check, multi-
 *     document routing) is a localised change — node + edge, no
 *     rewiring of the caller.
 *   - State has a single typed schema so the rest of the codebase has
 *     one place to look for "what data flows through a question".
 */
import { Document } from "@langchain/core/documents";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseRetriever } from "@langchain/core/retrievers";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { ChunkMetadata } from "./chunking.ts";
import type { TransformersJsChatModel } from "./chat-model.ts";

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
 */
const SYSTEM_PROMPT = `You are an assistant whose ONLY job is to answer questions about the specific PDF the user has uploaded. The user message will include relevant excerpts pulled from that document.

Strict grounding rules:
- Answer ONLY from the supplied excerpts. Do not use general knowledge, training data, or facts from outside the document — even if you know them.
- If the question can be answered from the excerpts, do so concisely (usually under 100 words) and cite page numbers like (page 4) when a specific fact comes from a specific page.
- If the excerpts don't cover the question, reply with exactly one sentence saying so — for example, "I couldn't find that in this document."
- If the question is unrelated to the document (general knowledge, opinions, math, coding help, the weather, who you are, etc.) politely decline in one sentence and invite the user to ask something about the uploaded PDF instead. Do NOT answer the off-topic question even partially.

Format and inference:
- When asked what the document is or what it's about, identify the document type from its structure. A name followed by a contact block, work experience, and skills sections is a résumé / CV. An executive summary, numbered sections, and a conclusion is a report. Line items with prices and a total is an invoice. State the type plainly ("This is a résumé for …", "This is a financial report on …") and then add one or two sentences of detail.
- Match the format to the question: prose for overview questions, a brief list when the user asks for items, tools, names, or dates.`;

const CHITCHAT_PROMPT =
  "You are a friendly assistant who helps a user explore a PDF document. Respond briefly to the user's greeting and invite them to ask something specific about the document.";

/** Recognises greetings / acknowledgements that don't need retrieval. */
const SMALL_TALK_RE =
  /^(hi+|hello|hey+|yo|sup|hola|howdy|good (morning|afternoon|evening)|thanks?|thank you|ok|okay|cool|nice|got it)[!.?]*$/i;

function isSmallTalk(q: string): boolean {
  const trimmed = q.trim().toLowerCase();
  if (trimmed.length <= 2) return true;
  return SMALL_TALK_RE.test(trimmed);
}

/**
 * Shared state schema for the RAG graph. `Annotation.Root` gives us a
 * typed channel-based state with default reducers (last-write-wins on
 * primitives, override on objects) — fine for a linear flow.
 */
export const RagStateAnnotation = Annotation.Root({
  question: Annotation<string>(),
  intent: Annotation<"chitchat" | "question" | undefined>(),
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

export interface BuildGraphOptions {
  /** Hybrid retriever (BM25 ⨂ dense, fused via RRF). */
  retriever: BaseRetriever;
  /** Wrapped chat model — drives both `generate` and `chitchat` nodes. */
  chatModel: TransformersJsChatModel;
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
  const { retriever, chatModel, onToken } = options;

  /** classify → mark the user's input as chitchat vs. real question. */
  async function classify(state: RagState): Promise<Partial<RagState>> {
    return { intent: isSmallTalk(state.question) ? "chitchat" : "question" };
  }

  /** retrieve → hybrid BM25 + dense, top-K via RRF. */
  async function retrieve(state: RagState): Promise<Partial<RagState>> {
    const hits = (await retriever.invoke(state.question)) as Document<ChunkMetadata>[];
    const citedPages = uniqueSortedPages(hits);
    recordRetrievalDebug(state.question, hits);
    return { docs: hits, citedPages };
  }

  /** generate → stream the grounded answer. */
  async function generate(state: RagState): Promise<Partial<RagState>> {
    if (state.docs.length === 0) {
      return { answer: "I could not find any relevant passages for that question." };
    }
    // Order context by page number so the prompt reads top-to-bottom.
    const ordered = [...state.docs].sort((a, b) => a.metadata.pageNumber - b.metadata.pageNumber);
    const contextBlock = ordered
      .map((d) => `[Page ${d.metadata.pageNumber}]\n${d.pageContent.trim()}`)
      .join("\n\n");
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
    .addNode("retrieve", retrieve)
    .addNode("generate", generate)
    .addNode("chitchat", chitchat)
    .addEdge(START, "classify")
    .addConditionalEdges("classify", (s: RagState) =>
      s.intent === "chitchat" ? "chitchat" : "retrieve",
    )
    .addEdge("retrieve", "generate")
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
 * Push the retrieved chunks onto a `window.__cloakpdfRetrievals` array
 * when `localStorage["cloakpdf:debug"]` is set. Gated so the probe
 * can read structured retrieval results back from Puppeteer; off by
 * default and not referenced anywhere else in the app.
 */
interface RetrievalDebugRecord {
  question: string;
  hits: Array<{ chunkId: string; pageNumber: number; preview: string; length: number }>;
}
function recordRetrievalDebug(question: string, hits: Document<ChunkMetadata>[]): void {
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
  });
}
