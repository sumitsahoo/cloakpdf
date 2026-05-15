# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

This project uses **Vite+** (`vp`) — a unified toolchain wrapping Vite, Rolldown, Vitest, tsdown, Oxlint, and Oxfmt. Install globally with `npm i -g vite-plus`. Run `vp help` / `vp <command> --help` for any command. Docs live at `node_modules/vite-plus/docs` or https://viteplus.dev/guide/.

| Command                                      | Purpose                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vp install`                                 | Install dependencies (run after pulling).                                                                                                                                                                                                                                                                     |
| `vp dev`                                     | Dev server on http://localhost:5173.                                                                                                                                                                                                                                                                          |
| `vp build`                                   | TypeScript check + production build to `dist/`.                                                                                                                                                                                                                                                               |
| `vp check`                                   | Format + lint + type-check. Must pass before commit.                                                                                                                                                                                                                                                          |
| `vp test`                                    | Unit tests via Vitest (`tests/unit/`).                                                                                                                                                                                                                                                                        |
| `vp test run tests/unit/rag-bm25.test.ts`    | Run a single file.                                                                                                                                                                                                                                                                                            |
| `pnpm test:e2e`                              | Real-browser smoke (puppeteer-core) that uploads `tests/fixtures/sample.pdf` and drives Ask PDF end-to-end. Requires `vp dev` running and a Chrome binary at `CHROME_PATH` (default macOS path). First cold run downloads ~275 MB of model weights into the puppeteer profile at `tests/.puppeteer-profile/`. |
| `pnpm exec tsx tests/e2e/retrieval-probe.ts` | Dumps per-retriever hits + relevance scores per question to `tests/retrieval-debug/<timestamp>.json` for tuning the RAG pipeline.                                                                                                                                                                             |

Pre-commit testing rule: run `vp check` + `vp test` + (for UI/RAG changes) `pnpm test:e2e` **before** `git commit`. There is a lint-staged hook that runs `vp check --fix` on staged files, but unit/e2e are not enforced by the hook.

## Architecture

CloakPDF is a **100% client-side** React 19 + TypeScript 6 single-page app served as static assets via Cloudflare Workers (`wrangler.jsonc`). Every PDF operation runs in the browser; no file ever crosses the network.

### View routing

There is no router library. [src/App.tsx](src/App.tsx) is a state machine over five views: home grid, tool view, privacy, workflows home, workflow builder, workflow runner. The active view is derived from `useState` + URL hash. Each tool renders as a top-level lazy chunk; the chunk loads under a `Suspense` boundary.

### Tool registry — the single source of truth

[src/config/tool-registry.ts](src/config/tool-registry.ts) is the only file that knows which tools exist. It exports `tools`, `categories`, `findTool`, and `findToolComponent`. App.tsx and the workflow runner both render tools by id through this registry — neither imports a tool component directly. When adding a tool, add the lazy import + metadata here and that's it.

Tool metadata flags worth knowing:

- `desktopOnly` — hides the card on mobile and shows a "desktop only" placeholder if a phone hits the URL directly. Used for on-device AI tools (RAM/WebGPU constraints).
- `beta` — renders a beta chip next to the title.
- `requirements` — free-form note (e.g. "Requires ≥ 4 GB free RAM") shown on the card and inside the tool.

### Two PDF libraries, two jobs

- **`@pdfme/pdf-lib`** — every structural manipulation (merge, split, rotate, redact, sign, metadata, watermark, form-fill). Lives in [src/utils/pdf-operations.ts](src/utils/pdf-operations.ts).
- **`pdfjs-dist`** (PDF.js) — rendering pages to canvas for previews and thumbnails. Plus the raster path of Compress PDF. Lives in [src/utils/pdf-renderer.ts](src/utils/pdf-renderer.ts).

These never get conflated. Adding a "modify the bytes" tool → use pdf-lib. Adding a "show me the page" UI → use PDF.js.

### Standalone vs. workflow execution (`useToolOutput`)

Tools have two execution modes:

1. **Standalone** — user opens the tool directly, processes a file, downloads the result.
2. **Workflow** — the tool is one step in a chain; its output becomes the next step's input without a download.

The seam is [src/hooks/useToolOutput.ts](src/hooks/useToolOutput.ts). A tool calls `output.deliver(bytes, "_suffix", sourceFile)` exactly where it used to call `downloadPdf(...)`; the hook routes to either a browser download or the workflow runner's `onComplete`. Standalone behavior is byte-for-byte unchanged. A tool can read `output.inWorkflow` / `output.isLastStep` / `output.deliveryWord` (`"Download"` vs `"Continue"`) to label buttons correctly.

A tool is workflow-eligible only when (a) it consumes one PDF and produces one PDF, AND (b) it's been migrated to `useToolOutput.deliver`. The allow-list is in [src/workflow/registry.ts](src/workflow/registry.ts) — see the file header for which tools are excluded and why.

### On-device AI (Ask PDF)

The only feature heavier than vanilla PDF tooling. Two on-device models load together via Transformers.js:

- **SmolLM2-1.7B-Instruct** (q4f16, ~1 GB on disk, ~2.5 GB peak RAM) — chat model.
- **EmbeddingGemma-300M** (q8, WASM, ~309 MB) — sentence embeddings for retrieval.

Model metadata lives in [src/utils/ai-models.ts](src/utils/ai-models.ts) — both entries carry long history-of-swaps comments explaining why current settings are what they are. **Read those before swapping a model.** The chat slot has burned Qwen / Llama 3.2 / Gemma / SmolLM2-360M / SmolLM3 — every swap regressed extraction quality. Memory: don't propose Qwen as a drop-in (gibberish in-browser); SmolLM3 is rejected.

The RAG pipeline ([src/rag/](src/rag/)) is a LangGraph state machine — see [src/rag/graph.ts](src/rag/graph.ts) for the full diagram. Per question:

1. **`classify`** — small-talk regex routes greetings to a `chitchat` reply without retrieval.
2. **`retrieve`** — hybrid BM25 + dense retrieval fused via Reciprocal Rank Fusion ([src/rag/retrievers/hybrid.ts](src/rag/retrievers/hybrid.ts)). The first chunk of the document is always merged in as an "anchor" so identity questions ("whose résumé is this?") can use the header. A dense-cosine relevance gate (`scoreRelevance`) flags off-topic queries; below threshold (0.5) the graph routes to `refuse` with a canned message.
3. **`generate`** — three deterministic fast-paths run first ([src/rag/fast-paths.ts](src/rag/fast-paths.ts)): verbatim contact extraction (phone/email regex), document-type identification ("This appears to be X's résumé."), and topic-absence refusal ("The document doesn't mention X."). On a miss, the chat model streams a grounded answer with header + excerpts as context.

The fast-paths exist because SmolLM2-1.7B mis-extracts digits, mislabels résumés as "technical specs", and hallucinates content for topics not in the corpus. Each function has a header comment listing the exact failure mode it guards against — read it before loosening or removing a fast-path.

Index caching: chunks + embeddings are persisted in IndexedDB keyed by SHA-256 of the PDF bytes ([src/rag/persistence.ts](src/rag/persistence.ts)) so re-opening the same file is instant. The packed Float32 vector store lives in [src/rag/vector-store.ts](src/rag/vector-store.ts).

Generation sampling defaults ([src/rag/chat-model.ts](src/rag/chat-model.ts)): `temperature: 0.2`, `top_p: 0.85`, `max_new_tokens: 256`, `repetition_penalty: 1.15`, `no_repeat_ngram_size: 6`. The tuning history comment in the constructor body explains every step — keep it updated when changing defaults.

### Design system

[DESIGN.md](DESIGN.md) is the design spec — a YAML front-matter token system plus prose explaining the visual language. Two invariants explicitly called out:

1. **One accent.** Per-tool / per-category colour stays out of interactive surfaces. The Ocean-Blue primary is the only accent on CTAs, focus rings, hover borders.
2. **Slate-200 borders, no resting shadow.** Cards earn elevation on hover, not at rest.

Read DESIGN.md before adding new UI surfaces — the design system is doing real work and ad-hoc colour/shadow choices break the calm tone.

### Deployment

Cloudflare Workers + Static Assets (`wrangler.jsonc`). Auto-deploys on push to `main` via Workers Builds. Preview deploys per PR. The static `dist/` directory is served from the Worker — no SSR.
