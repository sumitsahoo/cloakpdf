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

import {
  AlignCenter,
  Archive,
  ArrowUpDown,
  BookMarked,
  ClipboardList,
  Contrast,
  Copy,
  Crop,
  EyeOff,
  FileImage,
  FileOutput,
  FileSearch,
  FilePlus,
  FileText,
  FileX,
  FolderOpen,
  GitMerge,
  Hash,
  Images,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Lock,
  Paperclip,
  Pencil,
  PenTool,
  Repeat2,
  RotateCw,
  Scale,
  ScanText,
  Scissors,
  Search,
  Shield,
  Stamp,
  Trash2,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "./components/Layout.tsx";
import { PrivacyPolicy } from "./components/PrivacyPolicy.tsx";
import { ReloadPrompt } from "./components/ReloadPrompt.tsx";
import { ToolCard } from "./components/ToolCard.tsx";
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
const GrayscalePdf = lazy(() => import("./tools/GrayscalePdf.tsx"));
const FileAttachment = lazy(() => import("./tools/FileAttachment.tsx"));
const SplitPdf = lazy(() => import("./tools/SplitPdf.tsx"));

// ── Tool metadata displayed on the home screen grid ──────────────
// Tools within each category are ordered by importance / frequency of use.

const tools: Tool[] = [
  // ── Organise & Edit ──────────────────────────────────────
  // Combine / Split / Extract are the most common operations
  {
    id: "merge",
    title: "Merge PDFs",
    description: "Combine multiple PDF files into one document",
    icon: GitMerge,
    category: "organise",
  },
  {
    id: "split-pdf",
    title: "Split PDF",
    description: "Divide a PDF into multiple separate files at chosen pages",
    icon: Scissors,
    category: "organise",
  },
  {
    id: "extract-pages",
    title: "Extract Pages",
    description: "Select specific pages and save them as a new PDF",
    icon: FileOutput,
    category: "organise",
  },
  // Page-level manipulation
  {
    id: "reorder",
    title: "Reorder Pages",
    description: "Drag and drop to rearrange page order",
    icon: ArrowUpDown,
    category: "organise",
  },
  {
    id: "delete",
    title: "Delete Pages",
    description: "Remove unwanted pages from a PDF",
    icon: Trash2,
    category: "organise",
  },
  {
    id: "rotate",
    title: "Rotate Pages",
    description: "Rotate individual pages in any direction",
    icon: RotateCw,
    category: "organise",
  },
  {
    id: "reverse-pages",
    title: "Reverse Pages",
    description: "Flip the page order of a PDF in one click",
    icon: Repeat2,
    category: "organise",
  },
  // Add / duplicate pages
  {
    id: "add-blank-page",
    title: "Add Blank Page",
    description: "Insert a blank page at any position in the document",
    icon: FilePlus,
    category: "organise",
  },
  {
    id: "duplicate-page",
    title: "Duplicate Page",
    description: "Copy a page and insert it at any position",
    icon: Copy,
    category: "organise",
  },
  {
    id: "remove-blank-pages",
    title: "Remove Blank Pages",
    description: "Auto-detect and remove empty pages from a PDF",
    icon: FileX,
    category: "organise",
  },
  // Navigation & attachments
  {
    id: "add-bookmarks",
    title: "Add Bookmarks",
    description: "Add a clickable outline for quick in-document navigation",
    icon: BookMarked,
    category: "organise",
  },
  {
    id: "file-attachment",
    title: "File Attachments",
    description: "View, add, extract, or remove files embedded in a PDF",
    icon: Paperclip,
    category: "organise",
  },

  // ── Transform & Convert ──────────────────────────────────
  // Compression is the most common transform
  {
    id: "compress",
    title: "Compress PDF",
    description: "Reduce PDF file size for easier sharing",
    icon: Archive,
    category: "transform",
  },
  // Format conversions grouped together
  {
    id: "pdf-to-image",
    title: "PDF to Image",
    description: "Export pages as PNG or JPEG images",
    icon: FileImage,
    category: "transform",
  },
  {
    id: "images-to-pdf",
    title: "Images to PDF",
    description: "Convert images into a PDF document",
    icon: Images,
    category: "transform",
  },
  {
    id: "ocr",
    title: "OCR PDF",
    description: "Extract text from scanned PDFs using OCR",
    icon: ScanText,
    category: "transform",
  },
  // Page-level transforms
  {
    id: "crop-pages",
    title: "Crop Pages",
    description: "Trim page margins by adjusting the visible area",
    icon: Crop,
    category: "transform",
  },
  {
    id: "flatten",
    title: "Flatten PDF",
    description: "Remove form fields and annotations, making the PDF non-editable",
    icon: Layers,
    category: "transform",
  },
  {
    id: "grayscale",
    title: "Grayscale PDF",
    description: "Convert all pages to grayscale, removing all colour information",
    icon: Contrast,
    category: "transform",
  },
  // Layout & printing
  {
    id: "nup-pages",
    title: "N-up Pages",
    description: "Arrange multiple pages onto a single sheet for compact printing",
    icon: LayoutGrid,
    category: "transform",
  },
  {
    id: "contact-sheet",
    title: "Contact Sheet",
    description: "Render all pages as a thumbnail grid for quick visual review",
    icon: LayoutDashboard,
    category: "transform",
  },
  {
    id: "repair-pdf",
    title: "Repair PDF",
    description: "Fix structural issues in corrupted or malformed PDFs",
    icon: Wrench,
    category: "transform",
  },

  // ── Annotate & Sign ──────────────────────────────────────
  {
    id: "signature",
    title: "Add Signature",
    description: "Draw or upload a custom signature image and place it on a page",
    icon: PenTool,
    category: "annotate",
  },
  {
    id: "fill-pdf-form",
    title: "Fill PDF Form",
    description: "Fill interactive form fields in existing PDFs",
    icon: ClipboardList,
    category: "annotate",
  },
  {
    id: "stamp-pdf",
    title: "Stamp & Watermark",
    description: "Apply pre-built stamps or custom text watermarks with configurable style",
    icon: Stamp,
    category: "annotate",
  },
  // Numbering & headers grouped together
  {
    id: "add-page-numbers",
    title: "Add Page Numbers",
    description: "Insert page numbers with custom position and format",
    icon: Hash,
    category: "annotate",
  },
  {
    id: "header-footer",
    title: "Header & Footer",
    description: "Add repeating text at the top and/or bottom of every page",
    icon: AlignCenter,
    category: "annotate",
  },
  {
    id: "bates-numbering",
    title: "Bates Numbering",
    description: "Stamp sequential identifiers for legal and compliance workflows",
    icon: Scale,
    category: "annotate",
  },

  // ── Security & Properties ────────────────────────────────
  {
    id: "pdf-password",
    title: "PDF Password",
    description: "Add or remove a password and control print, copy, and edit rights",
    icon: Lock,
    category: "security",
  },
  {
    id: "redact-pdf",
    title: "Redact PDF",
    description: "Permanently black out sensitive text and images",
    icon: EyeOff,
    category: "security",
  },
  {
    id: "metadata",
    title: "Edit Metadata",
    description: "View and edit PDF document properties",
    icon: FileText,
    category: "security",
  },
  {
    id: "pdf-inspector",
    title: "PDF Inspector",
    description: "View version, page dimensions, metadata, and encryption status",
    icon: FileSearch,
    category: "security",
  },
];

// ── Category definitions for the home screen ─────────────────────

const categories = [
  {
    key: "organise",
    label: "Organise & Edit",
    description: "Rearrange, combine, and manage your PDF pages",
    icon: FolderOpen,
    iconBg: "bg-blue-50 dark:bg-blue-900/30",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
  {
    key: "transform",
    label: "Transform & Convert",
    description: "Compress, convert, and extract content",
    icon: Zap,
    iconBg: "bg-violet-50 dark:bg-violet-900/30",
    iconColor: "text-violet-600 dark:text-violet-400",
  },
  {
    key: "annotate",
    label: "Annotate & Sign",
    description: "Add watermarks, signatures, and overlays",
    icon: Pencil,
    iconBg: "bg-emerald-50 dark:bg-emerald-900/30",
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
  {
    key: "security",
    label: "Security & Properties",
    description: "Protect your PDFs and manage metadata",
    icon: Shield,
    iconBg: "bg-amber-50 dark:bg-amber-900/30",
    iconColor: "text-amber-600 dark:text-amber-400",
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
  grayscale: GrayscalePdf,
  "file-attachment": FileAttachment,
  "split-pdf": SplitPdf,
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

/** Per-category icon background and foreground colours (mirrors ToolCard theme). */
const categoryAccent: Record<string, { iconBg: string; iconColor: string }> = {
  organise: {
    iconBg: "bg-blue-50 dark:bg-blue-900/30",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
  transform: {
    iconBg: "bg-violet-50 dark:bg-violet-900/30",
    iconColor: "text-violet-600 dark:text-violet-400",
  },
  annotate: {
    iconBg: "bg-emerald-50 dark:bg-emerald-900/30",
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
  security: {
    iconBg: "bg-amber-50 dark:bg-amber-900/30",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
};

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
  const accent = categoryAccent[tool.category ?? ""] ?? categoryAccent.organise;
  const Icon = tool.icon;
  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <div
          className={`w-12 h-12 ${accent.iconBg} rounded-xl flex items-center justify-center shrink-0`}
        >
          <Icon className={`w-6 h-6 ${accent.iconColor}`} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-dark-text">{tool.title}</h1>
          <p className="text-slate-500 dark:text-dark-text-muted mt-0.5">{tool.description}</p>
        </div>
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
      <div className="text-center mb-10">
        <h1
          className="text-3xl sm:text-4xl font-bold animate-gradient-text animate-fade-in-up mb-2 leading-tight"
          style={{ animationDelay: "0ms" }}
        >
          All-in-One PDF Tools That Respect Your Privacy
        </h1>
        <p
          className="text-base text-slate-500 dark:text-dark-text-muted max-w-2xl mx-auto animate-fade-in-up"
          style={{ animationDelay: "80ms" }}
        >
          Edit, merge, sign, secure, and convert PDFs entirely in your browser. Your files never
          leave your device.
        </p>
      </div>

      {/* ── Search Bar ──────────────────────────────────── */}
      <div
        className="max-w-xl mx-auto mb-10 animate-fade-in-up"
        style={{ animationDelay: "160ms" }}
      >
        <div className="relative group search-focus-pulse">
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
                type="button"
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
          <div className="w-16 h-16 bg-slate-100 dark:bg-dark-surface rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-slate-400 dark:text-dark-text-muted" />
          </div>
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
                  <div
                    className={`w-10 h-10 ${cat.iconBg} rounded-xl flex items-center justify-center shrink-0 animate-scale-in`}
                    style={{ animationDelay: `${catIdx * 80}ms` }}
                    aria-hidden="true"
                  >
                    <cat.icon className={`w-5 h-5 ${cat.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-slate-800 dark:text-dark-text">
                        {cat.label}
                      </h2>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cat.iconBg} ${cat.iconColor}`}
                      >
                        {catTools.length}
                      </span>
                    </div>
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
  const [showPrivacy, setShowPrivacy] = useState(false);

  /** Navigate back to the home screen (clears the active tool and privacy view). */
  const goHome = useCallback(() => {
    setActiveTool(null);
    setShowPrivacy(false);
  }, []);

  /** Stable callback shared by every `ToolCard` via `React.memo`. */
  const handleSelectTool = useCallback((id: ToolId) => {
    setShowPrivacy(false);
    setActiveTool(id);
  }, []);

  const handlePrivacy = useCallback(() => {
    setActiveTool(null);
    setShowPrivacy(true);
  }, []);

  /** Scroll to top whenever the view changes. */
  // eslint-disable-next-line react-hooks/exhaustive-deps -- activeTool and showPrivacy are intentional trigger deps
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTool, showPrivacy]);

  /** Metadata for the active tool (memoised to avoid redundant lookups). */
  const activeMeta = useMemo(
    () => (activeTool ? (tools.find((t) => t.id === activeTool) ?? null) : null),
    [activeTool],
  );

  const ToolComponent = activeTool ? toolComponents[activeTool] : null;

  /** Map category accent colours to the badge shape expected by Layout. */
  const badgeAccent = useMemo(() => {
    if (!activeMeta?.category) return undefined;
    const cat = categories.find((c) => c.key === activeMeta.category);
    if (!cat) return undefined;
    const colorMap: Record<
      string,
      { bg: string; border: string; text: string; logoFilter?: string }
    > = {
      organise: {
        bg: "bg-blue-50 dark:bg-blue-900/30",
        border: "border-blue-200 dark:border-blue-700/60",
        text: "text-blue-700 dark:text-blue-300",
      },
      transform: {
        bg: "bg-violet-50 dark:bg-violet-900/30",
        border: "border-violet-200 dark:border-violet-700/60",
        text: "text-violet-700 dark:text-violet-300",
        logoFilter: "hue-rotate(40deg)",
      },
      annotate: {
        bg: "bg-emerald-50 dark:bg-emerald-900/30",
        border: "border-emerald-200 dark:border-emerald-700/60",
        text: "text-emerald-700 dark:text-emerald-300",
        logoFilter: "hue-rotate(-70deg)",
      },
      security: {
        bg: "bg-amber-50 dark:bg-amber-900/30",
        border: "border-amber-200 dark:border-amber-700/60",
        text: "text-amber-700 dark:text-amber-300",
        logoFilter: "hue-rotate(-185deg) saturate(1.5)",
      },
    };
    return colorMap[cat.key];
  }, [activeMeta]);

  return (
    <>
      <Layout
        onHome={goHome}
        showBack={!!activeTool || showPrivacy}
        onPrivacy={handlePrivacy}
        badgeAccent={badgeAccent}
      >
        {activeTool && ToolComponent && activeMeta ? (
          <ToolView tool={activeMeta} Component={ToolComponent} />
        ) : showPrivacy ? (
          <PrivacyPolicy />
        ) : (
          <HomeScreen onSelectTool={handleSelectTool} />
        )}
      </Layout>
      <ReloadPrompt />
    </>
  );
}
