/**
 * Unit tests for the deterministic fast-paths that bypass the chat
 * model. Pure functions over `(question, anchorChunks) → hit | null`,
 * so they test without any model / browser / async machinery.
 *
 * Why these matter: the fast-paths are the only thing standing between
 * the user and SmolLM2-1.7B's failure modes on specific question
 * shapes (verbatim contact extraction; document-type identification).
 * Regressions here mean we silently fall back to the LLM and ship the
 * exact failure modes the fast-paths were added to prevent.
 */
import { Document } from "@langchain/core/documents";
import { describe, expect, it } from "vitest";
import type { ChunkMetadata } from "../../src/rag/chunking.ts";
import {
  tryDocumentTypeAnswer,
  tryTopicAbsenceRefusal,
  tryVerbatimExtraction,
} from "../../src/rag/fast-paths.ts";

function chunk(content: string, page = 1, chunkId = `p${page}-0`): Document<ChunkMetadata> {
  return new Document<ChunkMetadata>({
    pageContent: content,
    metadata: { chunkId, pageNumber: page, ordinal: 0, ocrUsed: false },
  });
}

const RESUME_ANCHOR = chunk(
  [
    "Sumit Sahoo",
    "ENTERPRISE ARCHITECT",
    "AI & CLOUD",
    "CONTACT",
    "sumitsahoo1988@gmail.com",
    "+91-7899800899",
    "Pune, Maharashtra, India",
    "",
    "WORK EXPERIENCE",
    "Vodafone — Solution Architect (Mar 2020 – Present)",
    "",
    "EDUCATION",
    "BTech in Computer Science",
    "",
    "SKILLS",
    "Cloud, AI, Architecture",
  ].join("\n"),
);

describe("tryVerbatimExtraction", () => {
  describe("phone", () => {
    it("returns the phone number for an explicit phone question", () => {
      const hit = tryVerbatimExtraction("Give me Sumit's phone number.", [RESUME_ANCHOR]);
      expect(hit).not.toBeNull();
      expect(hit?.value).toBe("+91-7899800899");
      expect(hit?.citedPages).toEqual([1]);
    });

    it("matches 'mobile' / 'cell' / 'telephone' / 'whatsapp' as phone intent", () => {
      for (const word of ["mobile", "cell", "telephone", "whatsapp"]) {
        const hit = tryVerbatimExtraction(`what is the ${word}?`, [RESUME_ANCHOR]);
        expect(hit?.value, `intent="${word}"`).toBe("+91-7899800899");
      }
    });

    it("treats 'number' as phone intent (common phrasing)", () => {
      const hit = tryVerbatimExtraction("Give me Sumit's number.", [RESUME_ANCHOR]);
      expect(hit?.value).toBe("+91-7899800899");
    });
  });

  describe("email", () => {
    it("returns the email address for an explicit email question", () => {
      const hit = tryVerbatimExtraction("What is the email address?", [RESUME_ANCHOR]);
      expect(hit?.value).toBe("sumitsahoo1988@gmail.com");
      expect(hit?.citedPages).toEqual([1]);
    });

    it("returns the email when the question contains an '@' character", () => {
      const hit = tryVerbatimExtraction("Is there an @ address listed?", [RESUME_ANCHOR]);
      expect(hit?.value).toBe("sumitsahoo1988@gmail.com");
    });

    it("preserves trailing digits in the local part (regression: '1988' was dropped)", () => {
      const hit = tryVerbatimExtraction("email?", [RESUME_ANCHOR]);
      expect(hit?.value).toContain("1988@");
    });
  });

  describe("fall-through cases", () => {
    it("returns null for overview / narrative questions", () => {
      const overviews = [
        "What is this document about?",
        "Summarise the work experience.",
        "List the skills.",
      ];
      for (const q of overviews) {
        expect(tryVerbatimExtraction(q, [RESUME_ANCHOR]), `q="${q}"`).toBeNull();
      }
    });

    it("returns null when no anchor chunks are supplied", () => {
      expect(tryVerbatimExtraction("phone?", [])).toBeNull();
    });

    it("returns null when the anchor chunk has no matching value", () => {
      const plainChunk = chunk("Just some prose. No contact info here.");
      expect(tryVerbatimExtraction("phone?", [plainChunk])).toBeNull();
      expect(tryVerbatimExtraction("email?", [plainChunk])).toBeNull();
    });
  });
});

describe("tryDocumentTypeAnswer", () => {
  it("identifies a résumé from canonical section headers + extracts the name", () => {
    const hit = tryDocumentTypeAnswer("What kind of document is this?", [RESUME_ANCHOR]);
    expect(hit).not.toBeNull();
    expect(hit?.value).toBe("This appears to be Sumit Sahoo's résumé.");
    expect(hit?.citedPages).toEqual([1]);
  });

  it("matches the common doc-type intent phrasings", () => {
    const phrasings = [
      "What kind of document is this?",
      "What type of document is this?",
      "What is this document?",
      "What is this PDF?",
      "What is this about?",
      "What's this document about?",
    ];
    for (const q of phrasings) {
      const hit = tryDocumentTypeAnswer(q, [RESUME_ANCHOR]);
      expect(hit?.value, `phrasing="${q}"`).toContain("résumé");
    }
  });

  it("falls back to generic phrasing when no name is found at the top", () => {
    // Same résumé sections but no recognisable "Firstname Lastname" line at the top.
    const anchorNoName = chunk(
      ["CONTACT", "WORK EXPERIENCE", "EDUCATION", "SKILLS", "Some prose follows."].join("\n"),
    );
    const hit = tryDocumentTypeAnswer("What is this document?", [anchorNoName]);
    expect(hit?.value).toBe("This appears to be a résumé.");
  });

  it("does not match all-caps lines as a name (those are section titles)", () => {
    // Anchor with "ENTERPRISE ARCHITECT" as the first line would be a
    // job title, not a name — we must not return "This appears to be
    // Enterprise Architect's résumé."
    const anchorTitleOnly = chunk(
      ["ENTERPRISE ARCHITECT", "CONTACT", "WORK EXPERIENCE", "EDUCATION", "SKILLS"].join("\n"),
    );
    const hit = tryDocumentTypeAnswer("What kind of document?", [anchorTitleOnly]);
    expect(hit?.value).toBe("This appears to be a résumé.");
  });

  describe("fall-through cases", () => {
    it("returns null for non-doc-type questions on a résumé", () => {
      const questions = [
        "What is the phone number?",
        "List the work experience.",
        "What tools are mentioned?",
        "Whose résumé is this?", // intentionally NOT intercepted — the LLM handles this well
      ];
      for (const q of questions) {
        expect(tryDocumentTypeAnswer(q, [RESUME_ANCHOR]), `q="${q}"`).toBeNull();
      }
    });

    it("returns null when the anchor chunk lacks ≥ 2 résumé section headers", () => {
      // A whitepaper-style doc with at most one matching header.
      const whitepaperAnchor = chunk(
        [
          "Industry Report 2026",
          "Executive Summary",
          "This report covers the EXPERIENCE of users across the platform.",
          "Section 1: Methodology",
        ].join("\n"),
      );
      expect(tryDocumentTypeAnswer("What is this document?", [whitepaperAnchor])).toBeNull();
    });

    it("fires on a portfolio header with a glued section label and only CONTACT recognisable", () => {
      // Reproduces the real-world failure on Sumit's PDF: extraction
      // glued "CORE EXPERTISE" → "COREEXPE…" so only CONTACT survives
      // as a word-boundary match. Canonical-section path falls below
      // the 2-hit threshold; structural path (Name + ALL-CAPS role +
      // email + phone) carries it.
      const portfolioAnchor = chunk(
        [
          "Sumit Sahoo",
          "ENTERPRISE ARCHITECT",
          "",
          "AI & CLOUD",
          "CONTACT",
          "sumitsahoo1988@gmail.com",
          "+91-7899800899",
          "Pune, Maharashtra, India",
          "sumitsahoo.dev",
          "linkedin.com/in/sumit-sahoo",
          "COREEXPERTISE",
          "AI Platforms, Cloud Architecture, Mobile",
        ].join("\n"),
      );
      const hit = tryDocumentTypeAnswer("What kind of document is this?", [portfolioAnchor]);
      expect(hit?.value).toBe("This appears to be Sumit Sahoo's résumé.");
    });

    it("does not fire on a corporate page that only has contact info (no Name + role title)", () => {
      // A company landing page has email + phone but no
      // "Firstname Lastname → ALL-CAPS ROLE" layout. The structural
      // path must NOT fire here.
      const companyContact = chunk(
        [
          "About Acme Corporation",
          "Founded 2010, headquartered in Austin, TX.",
          "Contact us:",
          "hello@acme.example",
          "+1-555-123-4567",
          "We provide enterprise software solutions.",
        ].join("\n"),
      );
      expect(tryDocumentTypeAnswer("What kind of document is this?", [companyContact])).toBeNull();
    });

    it("does not fire on a Name + role with no contact block (insufficient signal)", () => {
      // Could be an author bio or speaker intro — we don't claim it's
      // a résumé without the contact-block corroboration.
      const speakerBio = chunk(
        [
          "Jane Doe",
          "PRINCIPAL ENGINEER",
          "",
          "Jane spoke at the 2026 conference about distributed systems.",
          "Her keynote covered consensus algorithms and operational pitfalls.",
        ].join("\n"),
      );
      expect(tryDocumentTypeAnswer("What kind of document is this?", [speakerBio])).toBeNull();
    });

    it("dedupes section headers — repeating EXPERIENCE twice is not 2 sections", () => {
      const oneSectionRepeated = chunk(
        [
          "Some Title",
          "EXPERIENCE",
          "First paragraph about experience.",
          "EXPERIENCE",
          "Second paragraph.",
        ].join("\n"),
      );
      expect(tryDocumentTypeAnswer("What is this document?", [oneSectionRepeated])).toBeNull();
    });

    it("returns null when no anchor chunks are supplied", () => {
      expect(tryDocumentTypeAnswer("What is this document?", [])).toBeNull();
    });
  });
});

describe("tryTopicAbsenceRefusal", () => {
  // A retrieved set that has no mention of "Docker", "Kubernetes",
  // or "blockchain" anywhere. Mirrors the canonical résumé failure
  // mode where the relevance gate lets the question through (the
  // chunks talk about cloud + AI tools, weakly on-topic for Docker)
  // and SmolLM2 then hallucinates Docker marketing copy.
  const RESUME_CHUNKS = [
    chunk(
      "Sumit Sahoo\nENTERPRISE ARCHITECT\nCONTACT\nsumitsahoo1988@gmail.com\n+91-7899800899",
      1,
      "p1-0",
    ),
    chunk("WORK EXPERIENCE\nVodafone — Solution Architect — AWS, GCP, AI integrations.", 1, "p1-1"),
    chunk("TOOLS I LOVE\nVS Code, Zed, Claude Code, GitHub Copilot, Figma", 3, "p3-16"),
    chunk(
      "LANGUAGES\nEnglish Professional Hindi Professional Odia Native\nINTERESTS Open Source Photography",
      4,
      "p4-23",
    ),
  ];

  describe("topic absent from chunks → refuses", () => {
    it("refuses when the topic isn't anywhere in the retrieved chunks", () => {
      const hit = tryTopicAbsenceRefusal(
        "What does the document say about Docker containers?",
        RESUME_CHUNKS,
      );
      expect(hit?.value).toBe("The document doesn't mention Docker containers.");
      expect(hit?.citedPages).toEqual([]);
    });

    it("matches the 'does the document mention X' phrasing", () => {
      const hit = tryTopicAbsenceRefusal("Does the document mention Kubernetes?", RESUME_CHUNKS);
      expect(hit?.value).toBe("The document doesn't mention Kubernetes.");
    });

    it("matches the 'is there anything about X in the document' phrasing", () => {
      const hit = tryTopicAbsenceRefusal(
        "Is there anything about blockchain in this document?",
        RESUME_CHUNKS,
      );
      expect(hit?.value).toBe("The document doesn't mention blockchain.");
    });

    it("matches the 'how does the document describe X' phrasing", () => {
      const hit = tryTopicAbsenceRefusal(
        "How does the document describe quantum computing?",
        RESUME_CHUNKS,
      );
      expect(hit?.value).toBe("The document doesn't mention quantum computing.");
    });

    it("matches the bare 'tell me about X' phrasing", () => {
      const hit = tryTopicAbsenceRefusal("Tell me about blockchain.", RESUME_CHUNKS);
      expect(hit?.value).toBe("The document doesn't mention blockchain.");
    });

    it("matches 'tell us about X' too", () => {
      const hit = tryTopicAbsenceRefusal("Tell us about Kubernetes", RESUME_CHUNKS);
      expect(hit?.value).toBe("The document doesn't mention Kubernetes.");
    });

    it("multi-word topic refuses when none of the meaningful tokens appear", () => {
      // Neither "Apache" nor "Kafka" appears in the résumé chunks.
      const hit = tryTopicAbsenceRefusal(
        "What does the document say about Apache Kafka?",
        RESUME_CHUNKS,
      );
      expect(hit?.value).toBe("The document doesn't mention Apache Kafka.");
    });
  });

  describe("topic present → falls through to LLM", () => {
    it("falls through when a meaningful token from the topic is present", () => {
      // "AWS" is in the work-experience chunk — one match is enough to
      // let the LLM answer from grounded context.
      const hit = tryTopicAbsenceRefusal("What does the document say about AWS?", RESUME_CHUNKS);
      expect(hit).toBeNull();
    });

    it("a partial-match (one of two topic words present) lets the LLM answer", () => {
      // "GitHub" is in the tools chunk; "Actions" isn't. One present
      // token = grounding exists, fall through to LLM.
      const hit = tryTopicAbsenceRefusal(
        "What does the document say about GitHub Actions?",
        RESUME_CHUNKS,
      );
      expect(hit).toBeNull();
    });

    it("case-insensitive substring check (Docker vs docker)", () => {
      const withLowercaseDocker = [
        ...RESUME_CHUNKS,
        chunk("Project uses docker for local dev.", 2, "p2-99"),
      ];
      const hit = tryTopicAbsenceRefusal(
        "What does the document say about Docker?",
        withLowercaseDocker,
      );
      expect(hit).toBeNull();
    });

    it("whole-word match — 'car' in question does NOT match 'carmakers' in chunks", () => {
      const withCarmaker = [
        chunk("Worked with leading carmakers in the auto industry.", 1, "p1-0"),
      ];
      const hit = tryTopicAbsenceRefusal("What does the document say about cars?", withCarmaker);
      // "cars" tokenises to "cars" — not a whole-word match against
      // "carmakers". We refuse. (False positives like this are fine —
      // the alternative is the LLM hallucinating a car answer.)
      expect(hit?.value).toBe("The document doesn't mention cars.");
    });
  });

  describe("fall-through cases", () => {
    it("returns null for question shapes that aren't topic-probes", () => {
      const nonTopicQuestions = [
        "What is the phone number?",
        "Whose résumé is this?",
        "Summarise the work experience.",
        "What kind of document is this?",
        "List the certifications.",
      ];
      for (const q of nonTopicQuestions) {
        expect(tryTopicAbsenceRefusal(q, RESUME_CHUNKS), `q="${q}"`).toBeNull();
      }
    });

    it("returns null when no retrieved chunks are supplied", () => {
      expect(tryTopicAbsenceRefusal("What does the document say about Docker?", [])).toBeNull();
    });

    it("returns null when the topic is only stopwords", () => {
      // Pathological edge case — "what does the document say about the?".
      // Token list filters to empty → no grounding check possible → null.
      expect(
        tryTopicAbsenceRefusal("What does the document say about the?", RESUME_CHUNKS),
      ).toBeNull();
    });
  });
});
