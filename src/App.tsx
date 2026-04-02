/**
 * Root application module.
 *
 * Exports the `App` component which manages which tool (if any) is
 * active and delegates rendering to either `HomeScreen` (categorised
 * tool grid with live search) or `ToolView` (the selected tool).
 *
 * All tool components are lazy-loaded via `React.lazy` so that only
 * the code for the active tool is fetched from the server.
 *
 * Key architectural decisions for performance:
 *
 *  - **Component extraction** – `HomeScreen` and `ToolView` are
 *    defined at module level (not nested inside `App`), so React
 *    never recreates them and their identity stays stable across
 *    renders.
 *
 *  - **Isolated search state** – The search query lives exclusively
 *    inside `HomeScreen`, meaning typing never re-renders the `App`
 *    root or the `Layout` shell.  When the user navigates to a tool,
 *    `HomeScreen` unmounts and its state is discarded; returning to
 *    the home screen starts with a fresh (empty) search.
 *
 *  - **Stable callbacks** – `handleSelectTool` is wrapped in
 *    `useCallback` so that every `ToolCard` (which is `React.memo`'d)
 *    receives the same function reference and can bail out of
 *    re-renders.
 *
 *  - **Memoised metadata lookup** – `activeMeta` uses `useMemo` to
 *    avoid a redundant `Array.find` on every unrelated render.
 */

import { useState, useCallback, useMemo, useRef, useEffect, lazy, Suspense } from "react";
import { Layout } from "./components/Layout.tsx";
import { ToolCard } from "./components/ToolCard.tsx";
import { Search, X } from "lucide-react";
import type { Tool, ToolId } from "./types.ts";

// ── Lazy-loaded tool components (code-split per tool) ────────────

const MergePdf = lazy(() => import("./tools/MergePdf.tsx"));
const CompressPdf = lazy(() => import("./tools/CompressPdf.tsx"));
const RotatePages = lazy(() => import("./tools/RotatePages.tsx"));
const DeletePages = lazy(() => import("./tools/DeletePages.tsx"));
const ReorderPages = lazy(() => import("./tools/ReorderPages.tsx"));
const ImagesToPdf = lazy(() => import("./tools/ImagesToPdf.tsx"));
const AddSignature = lazy(() => import("./tools/AddSignature.tsx"));
const EditMetadata = lazy(() => import("./tools/EditMetadata.tsx"));
const OcrPdf = lazy(() => import("./tools/OcrPdf.tsx"));
const PdfPassword = lazy(() => import("./tools/PdfPassword.tsx"));
const FlattenPdf = lazy(() => import("./tools/FlattenPdf.tsx"));
const AddBlankPage = lazy(() => import("./tools/AddBlankPage.tsx"));
const DuplicatePage = lazy(() => import("./tools/DuplicatePage.tsx"));
const AddPageNumbers = lazy(() => import("./tools/AddPageNumbers.tsx"));
const HeaderFooter = lazy(() => import("./tools/HeaderFooter.tsx"));
const CropPages = lazy(() => import("./tools/CropPages.tsx"));
const PdfToImage = lazy(() => import("./tools/PdfToImage.tsx"));
const FillPdfForm = lazy(() => import("./tools/FillPdfForm.tsx"));
const ExtractPages = lazy(() => import("./tools/ExtractPages.tsx"));
const ReversePages = lazy(() => import("./tools/ReversePages.tsx"));
const RedactPdf = lazy(() => import("./tools/RedactPdf.tsx"));
const StampPdf = lazy(() => import("./tools/StampPdf.tsx"));
const AddBookmarks = lazy(() => import("./tools/AddBookmarks.tsx"));
const PdfInspector = lazy(() => import("./tools/PdfInspector.tsx"));
const RepairPdf = lazy(() => import("./tools/RepairPdf.tsx"));
const NupPages = lazy(() => import("./tools/NupPages.tsx"));
const RemoveBlankPages = lazy(() => import("./tools/RemoveBlankPages.tsx"));
const BatesNumbering = lazy(() => import("./tools/BatesNumbering.tsx"));
const ContactSheet = lazy(() => import("./tools/ContactSheet.tsx"));

// ── Tool metadata displayed on the home screen grid ──────────────
// Tools within each category are ordered by importance / frequency of use.

const tools: Tool[] = [
  // ── Organise & Edit ──────────────────────────────────────
  {
    id: "merge",
    title: "Merge PDFs",
    description: "Combine multiple PDF files into one document",
    icon: "📑",
    category: "organise",
  },
  {
    id: "extract-pages",
    title: "Extract Pages",
    description: "Select specific pages and save them as a new PDF",
    icon: "📤",
    category: "organise",
  },
  {
    id: "reorder",
    title: "Reorder Pages",
    description: "Drag and drop to rearrange page order",
    icon: "↕️",
    category: "organise",
  },
  {
    id: "delete",
    title: "Delete Pages",
    description: "Remove unwanted pages from a PDF",
    icon: "🗑️",
    category: "organise",
  },
  {
    id: "rotate",
    title: "Rotate Pages",
    description: "Rotate individual pages in any direction",
    icon: "🔄",
    category: "organise",
  },
  {
    id: "add-blank-page",
    title: "Add Blank Page",
    description: "Insert a blank page at any position in the document",
    icon: "📄",
    category: "organise",
  },
  {
    id: "duplicate-page",
    title: "Duplicate Page",
    description: "Copy a page and insert it at any position",
    icon: "📋",
    category: "organise",
  },
  {
    id: "reverse-pages",
    title: "Reverse Pages",
    description: "Flip the page order of a PDF in one click",
    icon: "🔃",
    category: "organise",
  },
  {
    id: "add-bookmarks",
    title: "Add Bookmarks",
    description: "Add a clickable outline for quick in-document navigation",
    icon: "🔖",
    category: "organise",
  },
  {
    id: "remove-blank-pages",
    title: "Remove Blank Pages",
    description: "Auto-detect and remove empty pages from a PDF",
    icon: "🧹",
    category: "organise",
  },

  // ── Transform & Convert ──────────────────────────────────
  {
    id: "compress",
    title: "Compress PDF",
    description: "Reduce PDF file size for easier sharing",
    icon: "🗜️",
    category: "transform",
  },
  {
    id: "pdf-to-image",
    title: "PDF to Image",
    description: "Export pages as PNG or JPEG images",
    icon: "🖼️",
    category: "transform",
  },
  {
    id: "images-to-pdf",
    title: "Images to PDF",
    description: "Convert images into a PDF document",
    icon: "🖼️",
    category: "transform",
  },
  {
    id: "ocr",
    title: "OCR PDF",
    description: "Extract text from scanned PDFs using OCR",
    icon: "🔍",
    category: "transform",
  },
  {
    id: "crop-pages",
    title: "Crop Pages",
    description: "Trim page margins by adjusting the visible area",
    icon: "✂️",
    category: "transform",
  },
  {
    id: "flatten",
    title: "Flatten PDF",
    description: "Remove form fields and annotations, making the PDF non-editable",
    icon: "📐",
    category: "transform",
  },
  {
    id: "nup-pages",
    title: "N-up Pages",
    description: "Arrange multiple pages onto a single sheet for compact printing",
    icon: "🔲",
    category: "transform",
  },
  {
    id: "contact-sheet",
    title: "Contact Sheet",
    description: "Render all pages as a thumbnail grid for quick visual review",
    icon: "📇",
    category: "transform",
  },
  {
    id: "repair-pdf",
    title: "Repair PDF",
    description: "Fix structural issues in corrupted or malformed PDFs",
    icon: "🔧",
    category: "transform",
  },

  // ── Annotate & Sign ──────────────────────────────────────
  {
    id: "signature",
    title: "Add Signature",
    description: "Draw or upload a custom signature image and place it on a page",
    icon: "✍️",
    category: "annotate",
  },
  {
    id: "fill-pdf-form",
    title: "Fill PDF Form",
    description: "Fill interactive form fields in existing PDFs",
    icon: "📝",
    category: "annotate",
  },
  {
    id: "stamp-pdf",
    title: "Stamp & Watermark",
    description: "Apply pre-built stamps or custom text watermarks with configurable style",
    icon: "🖊️",
    category: "annotate",
  },
  {
    id: "add-page-numbers",
    title: "Add Page Numbers",
    description: "Insert page numbers with custom position and format",
    icon: "🔢",
    category: "annotate",
  },
  {
    id: "bates-numbering",
    title: "Bates Numbering",
    description: "Stamp sequential identifiers for legal and compliance workflows",
    icon: "⚖️",
    category: "annotate",
  },
  {
    id: "header-footer",
    title: "Header & Footer",
    description: "Add repeating text at the top and/or bottom of every page",
    icon: "📝",
    category: "annotate",
  },

  // ── Security & Properties ────────────────────────────────
  {
    id: "pdf-password",
    title: "PDF Password",
    description: "Add or remove a password and control print, copy, and edit rights",
    icon: "🔒",
    category: "security",
  },
  {
    id: "redact-pdf",
    title: "Redact PDF",
    description: "Permanently black out sensitive text and images",
    icon: "⬛",
    category: "security",
  },
  {
    id: "metadata",
    title: "Edit Metadata",
    description: "View and edit PDF document properties",
    icon: "📋",
    category: "security",
  },
  {
    id: "pdf-inspector",
    title: "PDF Inspector",
    description: "View version, page dimensions, metadata, and encryption status",
    icon: "🔎",
    category: "security",
  },
];

// ── Category definitions for the home screen ─────────────────────

const categories = [
  {
    key: "organise",
    label: "Organise & Edit",
    description: "Rearrange, combine, and manage your PDF pages",
    icon: "📄",
  },
  {
    key: "transform",
    label: "Transform & Convert",
    description: "Compress, convert, and extract content",
    icon: "🔄",
  },
  {
    key: "annotate",
    label: "Annotate & Sign",
    description: "Add watermarks, signatures, and overlays",
    icon: "✏️",
  },
  {
    key: "security",
    label: "Security & Properties",
    description: "Protect your PDFs and manage metadata",
    icon: "🔐",
  },
];

// ── Map tool IDs → lazy-loaded components ────────────────────────

const toolComponents: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  merge: MergePdf,
  compress: CompressPdf,
  rotate: RotatePages,
  delete: DeletePages,
  reorder: ReorderPages,
  "images-to-pdf": ImagesToPdf,
  signature: AddSignature,
  metadata: EditMetadata,
  ocr: OcrPdf,
  "pdf-password": PdfPassword,
  flatten: FlattenPdf,
  "add-blank-page": AddBlankPage,
  "duplicate-page": DuplicatePage,
  "add-page-numbers": AddPageNumbers,
  "header-footer": HeaderFooter,
  "crop-pages": CropPages,
  "pdf-to-image": PdfToImage,
  "fill-pdf-form": FillPdfForm,
  "extract-pages": ExtractPages,
  "reverse-pages": ReversePages,
  "redact-pdf": RedactPdf,
  "stamp-pdf": StampPdf,
  "add-bookmarks": AddBookmarks,
  "pdf-inspector": PdfInspector,
  "repair-pdf": RepairPdf,
  "nup-pages": NupPages,
  "remove-blank-pages": RemoveBlankPages,
  "bates-numbering": BatesNumbering,
  "contact-sheet": ContactSheet,
};

// ── Platform detection (module-level, computed once) ──────────────

/** `true` when the client runs on an Apple platform (used for ⌘ vs Ctrl hints). */
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

// ═══════════════════════════════════════════════════════════════════
//  Sub-components (defined at module level per rerender-no-inline-
//  components best practice)
// ═══════════════════════════════════════════════════════════════════

/** Full-screen centred spinner shown while a tool chunk is loading. */
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
    </div>
  );
}

// ── ToolView ─────────────────────────────────────────────────────

interface ToolViewProps {
  /** Metadata for the currently active tool. */
  tool: Tool;
  /** The lazy-loaded component to render. */
  Component: React.LazyExoticComponent<React.ComponentType>;
}

/**
 * Renders the active tool's header (title + description) and its
 * lazily-loaded component wrapped in a `Suspense` boundary.
 */
function ToolView({ tool, Component }: ToolViewProps) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-dark-text">{tool.title}</h1>
        <p className="text-slate-500 dark:text-dark-text-muted mt-1">{tool.description}</p>
      </div>
      <Suspense fallback={<LoadingSpinner />}>
        <Component />
      </Suspense>
    </div>
  );
}

// ── HomeScreen ───────────────────────────────────────────────────

interface HomeScreenProps {
  /** Stable callback invoked with a tool ID when the user picks a tool. */
  onSelectTool: (id: ToolId) => void;
}

/**
 * Landing page showing the hero headline, a live-search bar with
 * ⌘K / Ctrl+K shortcut, and a categorised grid of tool cards.
 *
 * Search state is local to this component so that typing never
 * re-renders the parent `App` or the `Layout` shell. When the user
 * navigates to a tool this component unmounts, naturally discarding
 * the query; returning to the home screen starts with a fresh search.
 */
function HomeScreen({ onSelectTool }: HomeScreenProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K → focus search; Escape → clear search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "Escape" && searchQuery) {
        setSearchQuery("");
        searchInputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [searchQuery]);

  /** Tools whose title or description matches the query (case-insensitive). */
  const filteredTools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter(
      (t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  return (
    <div>
      {/* ── Hero ────────────────────────────────────────── */}
      <div className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-dark-text mb-1.5">
          All-in-One PDF Tools That Respect Your Privacy
        </h1>
        <p className="text-base text-slate-500 dark:text-dark-text-muted max-w-2xl mx-auto">
          Edit, merge, sign, secure, and convert PDFs entirely in your browser. Your files never
          leave your device.
        </p>
      </div>

      {/* ── Search Bar ──────────────────────────────────── */}
      <div className="max-w-xl mx-auto mb-10">
        <div className="relative group">
          {/* Search icon */}
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-dark-text-muted group-focus-within:text-primary-500 transition-colors duration-200" />

          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tools…"
            className="w-full pl-12 pr-24 py-3.5 rounded-2xl bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border text-slate-800 dark:text-dark-text placeholder-slate-400 dark:placeholder-dark-text-muted shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-300 dark:focus:border-primary-600 transition-all duration-200 text-base"
            aria-label="Search PDF tools"
          />

          {/* Right side: clear button or keyboard shortcut hint */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {searchQuery ? (
              <button
                onClick={() => {
                  setSearchQuery("");
                  searchInputRef.current?.focus();
                }}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-surface-alt text-slate-400 dark:text-dark-text-muted hover:text-slate-600 dark:hover:text-dark-text transition-colors"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-1 rounded-lg bg-slate-100 dark:bg-dark-surface-alt border border-slate-200 dark:border-dark-border text-xs text-slate-400 dark:text-dark-text-muted font-mono select-none">
                {isMac ? "⌘" : "Ctrl"}K
              </kbd>
            )}
          </div>
        </div>

        {/* Result count while filtering */}
        {searchQuery && (
          <p className="text-center text-sm text-slate-400 dark:text-dark-text-muted mt-2 animate-fade-in-up">
            {filteredTools.length} {filteredTools.length === 1 ? "tool" : "tools"} found
          </p>
        )}
      </div>

      {/* ── Tool Grid / Empty State ─────────────────────── */}
      {filteredTools.length === 0 ? (
        <div className="text-center py-16 animate-fade-in-up">
          <div className="text-5xl mb-4">🔍</div>
          <h3 className="text-lg font-semibold text-slate-600 dark:text-dark-text mb-2">
            No tools found
          </h3>
          <p className="text-sm text-slate-400 dark:text-dark-text-muted max-w-md mx-auto">
            Try a different search term like &ldquo;merge&rdquo;, &ldquo;sign&rdquo;, or
            &ldquo;compress&rdquo;
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {categories.map((cat, catIdx) => {
            const catTools = filteredTools.filter((t) => t.category === cat.key);
            if (catTools.length === 0) return null;
            return (
              <section
                key={cat.key}
                className="animate-fade-in-up"
                style={{ animationDelay: `${catIdx * 80}ms` }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl" aria-hidden="true">
                    {cat.icon}
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-dark-text">
                      {cat.label}
                    </h2>
                    <p className="text-sm text-slate-400 dark:text-dark-text-muted">
                      {cat.description}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {catTools.map((tool) => (
                    <ToolCard key={tool.id} tool={tool} onSelect={onSelectTool} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Root component
// ═══════════════════════════════════════════════════════════════════

/**
 * Root application component.
 *
 * Manages which tool (if any) is active and delegates rendering to
 * either `HomeScreen` or `ToolView`. Keeps its own state minimal so
 * that child-local state (e.g. search) doesn't bubble up unnecessarily.
 */
export function App() {
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);

  /** Navigate back to the home screen (clears the active tool). */
  const goHome = useCallback(() => setActiveTool(null), []);

  /** Stable callback shared by every `ToolCard` via `React.memo`. */
  const handleSelectTool = useCallback((id: ToolId) => setActiveTool(id), []);

  /** Metadata for the active tool (memoised to avoid redundant lookups). */
  const activeMeta = useMemo(
    () => (activeTool ? (tools.find((t) => t.id === activeTool) ?? null) : null),
    [activeTool],
  );

  const ToolComponent = activeTool ? toolComponents[activeTool] : null;

  return (
    <Layout onHome={goHome} showBack={!!activeTool}>
      {activeTool && ToolComponent && activeMeta ? (
        <ToolView tool={activeMeta} Component={ToolComponent} />
      ) : (
        <HomeScreen onSelectTool={handleSelectTool} />
      )}
    </Layout>
  );
}
