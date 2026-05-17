/**
 * Deterministic fast-paths that bypass the chat model for question
 * shapes where regex over the retrieved chunks is more reliable than
 * asking SmolLM2-1.7B to do it. Each function returns
 * `{ value, citedPages } | null`; `null` means "fall through to the
 * LLM" — either the question didn't match the intent pattern, or the
 * structural check on the chunks failed.
 *
 * **Why these exist.** Probes against the canonical résumé fixture
 * (see `tests/retrieval-debug/`) showed two repeatable failure modes
 * even when retrieval surfaced the right chunks:
 *
 *   - "What kind of document is this?" → "a technical specification or
 *     a detailed description of a system, process, or product". The
 *     anchor chunk has `WORK EXPERIENCE / EDUCATION / SKILLS /
 *     CERTIFICATIONS` — a textbook résumé — but the model defaults to
 *     a generic tech-doc framing.
 *   - "Give me Sumit's phone number." → the model's name instead of
 *     digits, or trailing digits dropped from an email.
 *
 * Both shapes are simple regex problems over the document header. The
 * fast-paths are intentionally narrow — they only fire on tight intent
 * patterns AND a positive structural check on the anchor chunks. When
 * either fails we return `null` and let the LLM try.
 *
 * Pure functions over `(question, docs) → string | null`. No async, no
 * model, no graph state — they unit-test cleanly in isolation.
 */
import type { Document } from "@langchain/core/documents";
import type { ChunkMetadata } from "./chunking.ts";

export interface FastPathHit {
  /** The literal answer string to emit and stop. */
  value: string;
  /** Pages to surface in the "Context from pages …" footer. */
  citedPages: number[];
}

// ── Verbatim contact-info extraction (phone / email) ─────────────────

/**
 * Phone-number regex: matches an international `+CC-NNNN…NNN` form,
 * an `(NNN) NNN-NNNN` form, or any plain run of 7+ digits (which
 * covers local-format phone numbers without separators). Tight enough
 * that it doesn't fire on years ("1988") or 4-digit IDs but loose
 * enough to catch the variety of formats résumés / contact blocks use.
 */
const PHONE_RE =
  /\+\d{1,3}[\s\-.]?\d[\d\s\-.()]{5,}\d|\(?\d{3}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{4}|\b\d{7,}\b/;

/**
 * Email regex. Standard local-part / domain shape.
 */
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/**
 * Deterministic fast-path for verbatim contact-info extraction.
 *
 * SmolLM2-1.7B reliably *finds* the right chunk — the contact block
 * sits in the `[Document header]` at the top of the prompt — but
 * fails to copy digit strings character-perfectly. Observed failures:
 *   - Phone questions returning the person's name instead of digits.
 *   - Emails dropping trailing digits ("sumitsahoo1988@…" → "sumitsahoo@…").
 *   - Random sampling occasionally producing a hedged refusal even
 *     when the value sits in plain view.
 *
 * A regex against the header is character-exact, deterministic, and
 * skips a multi-second WASM inference for the most common contact
 * queries.
 */
export function tryVerbatimExtraction(
  question: string,
  anchorChunks: Document<ChunkMetadata>[],
): FastPathHit | null {
  if (anchorChunks.length === 0) return null;
  const q = question.toLowerCase();

  // Phone: explicit phone-y vocabulary, or a bare "number" (in PDF
  // Q&A "give me X's number" overwhelmingly means phone).
  if (/\b(phone|mobile|tel|cell|telephone|whatsapp|number)\b/.test(q)) {
    for (const chunk of anchorChunks) {
      const match = chunk.pageContent.match(PHONE_RE);
      if (match) {
        return {
          value: match[0].replace(/\s+/g, " ").trim(),
          citedPages: [chunk.metadata.pageNumber],
        };
      }
    }
  }

  // Email: "email" / "mail" / a literal "@" in the query.
  if (/\b(email|e-mail|mail)\b|@/.test(q)) {
    for (const chunk of anchorChunks) {
      const match = chunk.pageContent.match(EMAIL_RE);
      if (match) {
        return { value: match[0].trim(), citedPages: [chunk.metadata.pageNumber] };
      }
    }
  }

  return null;
}

// ── Document-type / identity inference ───────────────────────────────

/**
 * Canonical résumé / CV section headings. A document is treated as a
 * résumé when the anchor chunk shows at least two of these. The
 * two-hit threshold guards against false positives — a tech report
 * that mentions "EXPERIENCE" in passing won't trigger, but a real
 * résumé has CONTACT + WORK EXPERIENCE + EDUCATION + SKILLS … any
 * two of which are enough.
 */
const RESUME_SECTION_RE =
  /\b(WORK EXPERIENCE|EXPERIENCE|EDUCATION|SKILLS|CERTIFICATIONS?|LANGUAGES|INTERESTS|CONTACT|PROFILE|SUMMARY|TECHNICAL SKILLS|TOOLS|PROJECTS)\b/g;
const RESUME_DETECT_THRESHOLD = 2;

/**
 * Matches the family of "what is this document" intent phrasings.
 *
 * We deliberately do NOT match "whose résumé is this?" — that already
 * works well today (the model uses the anchor chunk and answers with
 * the person's name), and intercepting it would lose the natural
 * phrasing.
 */
const DOCUMENT_TYPE_QUESTION_RE =
  /\b(what (kind|type) of document|what is this( document| pdf)?|what (does this|do these) (document|excerpts?) (cover|describe|contain)|what is this about|what's this( document)? about)\b/i;

/** "Firstname Lastname" or "Firstname Middle Lastname" — 2–4 words, each starts uppercase. */
const NAME_LINE_RE = /^[A-Z][a-z]+(?:\s[A-Z][a-z]+){1,3}$/;

/**
 * ALL-CAPS role / department line: "ENTERPRISE ARCHITECT", "SENIOR
 * DEVELOPER", "AI & CLOUD". At least 5 chars so single short caps
 * tokens ("AI") don't qualify, and the character class deliberately
 * excludes digits so it doesn't match accidental headings like
 * "Q1 2026".
 */
const ROLE_TITLE_RE = /^[A-Z][A-Z\s&/-]{4,}$/;

/**
 * Pull a plausible person-name out of the top of the anchor chunk.
 *
 * Résumé layouts conventionally place a "Firstname Lastname" line at
 * the very top, before any section header. We scan the first handful
 * of lines for a two-or-three-word capitalised name that ISN'T an
 * all-caps section header (those are titles like "ENTERPRISE
 * ARCHITECT" or "WORK EXPERIENCE"). Returns `null` if no plausible
 * name was found — the fast-path then falls back to a generic phrasing
 * ("This appears to be a résumé") instead of inventing a name.
 */
function extractAnchorName(anchor: Document<ChunkMetadata>): string | null {
  const lines = anchor.pageContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines.slice(0, 8)) {
    if (NAME_LINE_RE.test(line)) return line;
  }
  return null;
}

/**
 * Personal-résumé header detector — fires when the chunk has the
 * unmistakable layout of a CV title block even if the canonical
 * section labels didn't survive PDF text extraction. Two structural
 * cues must hold:
 *
 *   1. A "Firstname Lastname" line followed within the next few lines
 *      by an ALL-CAPS role title (e.g. "ENTERPRISE ARCHITECT" under
 *      "Sumit Sahoo").
 *   2. A contact block — both an email AND a phone number anywhere
 *      in the chunk.
 *
 * The combination is specific to résumés / CVs / personal portfolios:
 * tech reports cite authors but rarely with a role-title line under
 * the name; invoices have email + phone but no name + ALL-CAPS-role
 * layout; whitepapers don't carry phone numbers next to author
 * blocks.
 *
 * Why this exists in addition to the canonical-section check: real
 * résumés routinely come out of PDF extraction with section labels
 * glued to adjacent words ("COREEXPERIENCE", "TOOLSILOVE") that don't
 * word-boundary-match `\bEXPERIENCE\b`. The canonical-section path
 * then drops below the two-hit threshold and the fast-path silently
 * falls back to the LLM, which mislabels the doc as "a guide" or "a
 * professional bio". The structural-cue path catches these without
 * loosening the canonical regex (which would broaden false positives
 * on tech specs that happen to mention "EXPERIENCE" in passing).
 */
function hasResumeHeaderStructure(text: string): boolean {
  if (!EMAIL_RE.test(text) || !PHONE_RE.test(text)) return false;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = 0; i < Math.min(6, lines.length); i++) {
    if (!NAME_LINE_RE.test(lines[i])) continue;
    // Look for an ALL-CAPS role title in the next few lines. We allow
    // a small gap so an empty paragraph between the name and the role
    // (common when the source PDF uses a styled subheading) doesn't
    // defeat the match.
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      if (ROLE_TITLE_RE.test(lines[j])) return true;
    }
  }
  return false;
}

/**
 * Deterministic fast-path for "what is this document?" / "what kind of
 * document is this?" questions.
 *
 * SmolLM2-1.7B's failure mode here is mislabelling a clear résumé as
 * "a technical specification" — it ignores the structural cues
 * (WORK EXPERIENCE / EDUCATION / SKILLS section headings + contact
 * block + name at top) and defaults to a generic doc-type phrasing.
 * A pattern-match on the anchor chunk is far more reliable and lets
 * us answer in one sentence instead of three paragraphs.
 *
 * Returns `null` when:
 *   - the intent pattern doesn't match (question is about something
 *     other than doc-type identification), OR
 *   - fewer than {@link RESUME_DETECT_THRESHOLD} canonical résumé
 *     section headers appear across the anchor chunks (doc isn't a
 *     résumé — let the LLM handle it).
 */
export function tryDocumentTypeAnswer(
  question: string,
  anchorChunks: Document<ChunkMetadata>[],
): FastPathHit | null {
  if (anchorChunks.length === 0) return null;
  if (!DOCUMENT_TYPE_QUESTION_RE.test(question)) return null;

  const headerText = anchorChunks.map((c) => c.pageContent).join("\n");

  // Path A — ≥ 2 canonical section headers in the anchor. Tight but
  // brittle: PDF extraction can glue section labels to neighbouring
  // words ("COREEXPERIENCE") so the word-boundary regex misses them.
  const matches = headerText.match(RESUME_SECTION_RE) ?? [];
  // Dedupe by surface form so "EXPERIENCE" appearing twice doesn't
  // satisfy a two-section requirement on its own.
  const uniqueSections = new Set(matches.map((m) => m.toUpperCase()));
  const canonicalHit = uniqueSections.size >= RESUME_DETECT_THRESHOLD;

  // Path B — structural CV-header layout: a "Firstname Lastname" line
  // followed by an ALL-CAPS role title, plus a contact block (email +
  // phone). Catches résumés whose section labels didn't survive
  // extraction; see `hasResumeHeaderStructure` for the full
  // rationale.
  const structuralHit = hasResumeHeaderStructure(headerText);

  if (!canonicalHit && !structuralHit) return null;

  const name = extractAnchorName(anchorChunks[0]);
  const value = name ? `This appears to be ${name}'s résumé.` : "This appears to be a résumé.";
  return { value, citedPages: [anchorChunks[0].metadata.pageNumber] };
}

// ── Topic-absence refusal ────────────────────────────────────────────

/**
 * Matches "what does the document say about X?" / "does the document
 * mention X?" / "tell me about X" style questions, capturing X as the
 * final group. Deliberately narrow — we only intercept question shapes
 * where the user is explicitly probing for a specific topic; open
 * "explain X" questions on a document about X stay with the LLM.
 */
const TOPIC_QUESTION_RES = [
  /^\s*what (?:does|do) (?:the|this|these) (?:document|pdf|text|excerpts?|file|chunks?) (?:say|mention|tell us?|cover|describe|discuss) (?:about|on)\s+(.+?)\??\s*$/i,
  /^\s*does (?:the|this|these) (?:document|pdf|text|file) (?:mention|discuss|cover|describe|reference|include|talk about)\s+(.+?)\??\s*$/i,
  /^\s*is there (?:anything|info|information|any mention) (?:about|on|of)\s+(.+?)(?:\s+in (?:this|the) (?:document|pdf|text|file))?\??\s*$/i,
  /^\s*how (?:does|do) (?:the|this|these) (?:document|pdf|text|excerpts?) (?:describe|cover|address|treat)\s+(.+?)\??\s*$/i,
  // "Tell me about X" / "Tell us about X" — broad phrasing that
  // SmolLM2 reliably hallucinates on when X is absent. False
  // positives are bounded by the chunk-presence check: if any
  // meaningful token of X appears in any retrieved chunk we fall
  // through to the LLM.
  /^\s*tell (?:me|us) about\s+(.+?)\.?\s*$/i,
];

/**
 * Question tokens that aren't useful for substring-matching against
 * the retrieved chunks. Filtering these out before the chunk-presence
 * check stops "the" / "this" from making every question look on-topic.
 */
const TOPIC_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "for",
  "to",
  "in",
  "on",
  "at",
  "with",
  "this",
  "that",
  "these",
  "those",
  "any",
  "some",
  "and",
  "or",
  "by",
  "about",
  "into",
  "from",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "have",
  "has",
  "had",
]);

function extractTopic(question: string): string | null {
  for (const re of TOPIC_QUESTION_RES) {
    const m = question.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function topicTokens(topic: string): string[] {
  const raw = topic.toLowerCase().match(/\b[a-z0-9][a-z0-9'-]*\b/g) ?? [];
  return raw.filter((t) => !TOPIC_STOPWORDS.has(t) && t.length > 1);
}

function escapeRegex(s: string): string {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

/**
 * Deterministic refusal for "what does the document say about X?"-style
 * questions when **none** of the meaningful tokens of X appear as whole
 * words in any retrieved chunk.
 *
 * **Why this exists.** SmolLM2-1.7B reliably *hallucinates* general-
 * knowledge answers on negative-topic questions even with a strict
 * system-prompt instruction to refuse. Observed in the probe suite
 * against a résumé that doesn't mention "blockchain": "What does the
 * document say about blockchain?" → a paragraph of crypto/ledger
 * boilerplate with a fabricated page citation. The relevance gate
 * doesn't catch these because the embedder gives weakly-on-topic
 * scores against any cloud/AI-flavoured corpus.
 *
 * Caveat: this guard only catches the *truly absent* case. A
 * partial-grounding question (e.g. "what does the doc say about
 * Docker?" when the résumé lists Docker in a tools enumeration but
 * doesn't describe it) still goes to the LLM, which may extrapolate
 * from the bare mention. That's a harder problem — tightening the
 * system prompt is the lever there.
 *
 * A substring-presence check is cheap and definitive: if none of the
 * topic's meaningful tokens appear anywhere in the retrieved chunks,
 * the model has no grounding and we refuse without invoking it.
 *
 * Returns `null` when:
 *   - the question doesn't match one of the {@link TOPIC_QUESTION_RES}
 *     intent patterns (general-shape questions stay with the LLM),
 *   - the topic has no meaningful tokens after stopword filtering, or
 *   - at least one topic token appears as a whole word in any
 *     retrieved chunk (let the LLM answer from grounded context).
 */
export function tryTopicAbsenceRefusal(
  question: string,
  retrievedDocs: Document<ChunkMetadata>[],
): FastPathHit | null {
  if (retrievedDocs.length === 0) return null;
  const topic = extractTopic(question);
  if (!topic) return null;
  const tokens = topicTokens(topic);
  if (tokens.length === 0) return null;

  const haystack = retrievedDocs.map((d) => d.pageContent.toLowerCase()).join("\n");
  const grounded = tokens.some((t) => new RegExp(`\\b${escapeRegex(t)}\\b`).test(haystack));
  if (grounded) return null;

  return {
    value: `The document doesn't mention ${topic}.`,
    citedPages: [],
  };
}
