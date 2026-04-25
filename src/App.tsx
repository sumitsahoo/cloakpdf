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
  ArrowLeftRight,
  ArrowUpDown,
  BookMarked,
  ClipboardList,
  Contrast,
  Copy,
  Crop,
  EyeOff,
  FileImage,
  FileKey2,
  FileOutput,
  FilePlus,
  FileSearch,
  FileText,
  FileX,
  GitFork,
  GitMerge,
  Hash,
  ImageDown,
  Images,
  Laptop,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Lock,
  MonitorSmartphone,
  Paperclip,
  PenTool,
  Repeat2,
  RotateCw,
  Rocket,
  Scale,
  ScanText,
  Scissors,
  Search,
  ShieldCheck,
  Sparkles,
  Stamp,
  Trash2,
  UserRoundCheck,
  WifiOff,
  Wrench,
  X,
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
const ExtractImages = lazy(() => import("./tools/ExtractImages.tsx"));
const ComparePdf = lazy(() => import("./tools/ComparePdf.tsx"));
const DigitalSignature = lazy(() => import("./tools/DigitalSignature.tsx"));

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
  {
    id: "extract-images",
    title: "Extract Images",
    description: "Pull all embedded images from a PDF and download as PNG or ZIP",
    icon: ImageDown,
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
    description: "View, edit, or redact PDF document properties for privacy",
    icon: FileText,
    category: "security",
  },
  {
    id: "compare-pdf",
    title: "Compare PDFs",
    description: "Visual side-by-side diff of two PDFs with pixel-level change detection",
    icon: ArrowLeftRight,
    category: "security",
  },
  {
    id: "digital-signature",
    title: "Digital Signature",
    description: "Sign PDFs with a cryptographic certificate for authenticity verification",
    icon: FileKey2,
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
  },
  {
    key: "transform",
    label: "Transform & Convert",
    description: "Compress, convert, and extract content",
  },
  {
    key: "annotate",
    label: "Annotate & Sign",
    description: "Add watermarks, signatures, and overlays",
  },
  {
    key: "security",
    label: "Security & Properties",
    description: "Protect your PDFs and manage metadata",
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
  "extract-images": ExtractImages,
  "compare-pdf": ComparePdf,
  "digital-signature": DigitalSignature,
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
  const Icon = tool.icon;
  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 bg-slate-100 dark:bg-dark-surface-alt rounded-xl flex items-center justify-center shrink-0">
          <Icon className="w-6 h-6 text-slate-700 dark:text-dark-text" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.015em] text-slate-800 dark:text-dark-text">
            {tool.title}
          </h1>
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
      <section className="pt-6 sm:pt-10 md:pt-14 pb-8 sm:pb-10">
        <h1
          className="text-center text-[34px] sm:text-[46px] md:text-[60px] lg:text-[64px] font-semibold text-slate-900 dark:text-dark-text tracking-[-0.03em] leading-[1.05] m-0 max-w-225 mx-auto animate-fade-in-up"
          style={{ animationDelay: "0ms" }}
        >
          PDF tools that{" "}
          <em className="font-serif italic font-normal text-primary-600 dark:text-primary-400">
            stay on your device
          </em>
          .
        </h1>

        <p
          className="text-center text-slate-500 dark:text-dark-text-muted text-[15px] sm:text-[17px] md:text-[18px] leading-[1.55] max-w-160 mx-auto mt-5 sm:mt-6 animate-fade-in-up"
          style={{ animationDelay: "80ms" }}
        >
          Edit, merge, sign, secure, and convert PDFs entirely in your browser. No uploads, no
          accounts, no tracking.
        </p>
      </section>

      {/* ── Search Bar ──────────────────────────────────── */}
      <div
        className="max-w-xl mx-auto mb-12 sm:mb-14 animate-fade-in-up"
        style={{ animationDelay: "160ms" }}
      >
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400 dark:text-dark-text-muted group-focus-within:text-primary-500 transition-colors duration-200" />

          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tools…"
            className="w-full pl-11 pr-24 py-3 rounded-xl bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border text-slate-800 dark:text-dark-text placeholder-slate-400 dark:placeholder-dark-text-muted shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-400/40 focus:border-primary-300 dark:focus:border-primary-600 transition-[border-color,box-shadow] duration-200 text-[15px]"
            aria-label="Search PDF tools"
          />

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
        <div className="space-y-12 sm:space-y-14">
          {categories.map((cat, catIdx) => {
            const catTools = filteredTools.filter((t) => t.category === cat.key);
            if (catTools.length === 0) return null;
            return (
              <section
                key={cat.key}
                className="animate-fade-in-up"
                style={{ animationDelay: `${catIdx * 80}ms` }}
              >
                <div className="mb-5 sm:mb-6">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-600 dark:text-primary-400 mb-2">
                    {cat.label}
                    <span className="ml-2 text-slate-400 dark:text-dark-text-muted font-medium tracking-normal normal-case">
                      · {catTools.length}
                    </span>
                  </div>
                  <h2 className="text-[22px] sm:text-[26px] font-semibold tracking-[-0.02em] leading-[1.2] text-slate-900 dark:text-dark-text m-0">
                    {cat.description}.
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {catTools.map((tool) => (
                    <ToolCard key={tool.id} tool={tool} onSelect={onSelectTool} />
                  ))}
                </div>
              </section>
            );
          })}

          {/* ── Why CloakPDF — multi-colored feature grid ── */}
          {!searchQuery && (
            <section
              className="pt-6 sm:pt-10 animate-fade-in-up"
              style={{ animationDelay: `${categories.length * 80}ms` }}
            >
              <div className="text-center mb-8 sm:mb-12">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-600 dark:text-primary-400 mb-2.5">
                  Why CloakPDF
                </div>
                <h2 className="text-[24px] sm:text-[30px] md:text-[36px] font-semibold tracking-[-0.02em] leading-[1.15] text-slate-900 dark:text-dark-text m-0">
                  Everything you need, nothing you don&rsquo;t.
                </h2>
                <p className="text-slate-500 dark:text-dark-text-muted text-[14px] sm:text-[15.5px] leading-[1.55] max-w-140 mx-auto mt-3">
                  A modern PDF toolkit that respects your privacy — built for people who care about
                  their data and their craft.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-7 sm:gap-y-8">
                <FeatureItem
                  icon={<UserRoundCheck className="w-5 h-5" />}
                  iconBg="bg-[color-mix(in_oklab,#059669_14%,transparent)]"
                  iconFg="text-[#059669] dark:text-[#34d399]"
                  title="No sign-up"
                  description="No accounts, no email, no passwords. Start using the moment the page loads."
                />
                <FeatureItem
                  icon={<EyeOff className="w-5 h-5" />}
                  iconBg="bg-[color-mix(in_oklab,#7c3aed_14%,transparent)]"
                  iconFg="text-[#7c3aed] dark:text-[#a78bfa]"
                  title="No tracking"
                  description="Zero analytics, zero telemetry, zero third-party scripts. You stay invisible."
                />
                <FeatureItem
                  icon={<ShieldCheck className="w-5 h-5" />}
                  iconBg="bg-[color-mix(in_oklab,#16a34a_14%,transparent)]"
                  iconFg="text-[#16a34a] dark:text-[#4ade80]"
                  title="Local-first"
                  description="Every byte stays in your browser. Nothing is ever uploaded to any server."
                />
                <FeatureItem
                  icon={<WifiOff className="w-5 h-5" />}
                  iconBg="bg-[color-mix(in_oklab,#ea580c_14%,transparent)]"
                  iconFg="text-[#ea580c] dark:text-[#fb923c]"
                  title="Works offline"
                  description="Once cached, keep editing and exporting without a connection — flights, trains, anywhere."
                />
                <FeatureItem
                  icon={<Rocket className="w-5 h-5" />}
                  iconBg="bg-[color-mix(in_oklab,#8b5cf6_14%,transparent)]"
                  iconFg="text-[#8b5cf6] dark:text-[#c4b5fd]"
                  title="Installable as a PWA"
                  description="Add CloakPDF to your home screen for a full-screen, app-like experience that launches in one tap."
                />
                <FeatureItem
                  icon={<MonitorSmartphone className="w-5 h-5" />}
                  iconBg="bg-[color-mix(in_oklab,#eab308_14%,transparent)]"
                  iconFg="text-[#ca8a04] dark:text-[#facc15]"
                  title="Mobile, tablet & desktop"
                  description="Every tool adapts fluidly across screen sizes — edit on the go, finalise at your desk."
                />
                <FeatureItem
                  icon={<Sparkles className="w-5 h-5" />}
                  iconBg="bg-[color-mix(in_oklab,#db2777_14%,transparent)]"
                  iconFg="text-[#db2777] dark:text-[#f472b6]"
                  title="35+ PDF tools"
                  description="Merge, split, sign, redact, OCR, compress, convert — one workspace for every PDF chore."
                />
                <FeatureItem
                  icon={<Laptop className="w-5 h-5" />}
                  iconBg="bg-[color-mix(in_oklab,#0891b2_14%,transparent)]"
                  iconFg="text-[#0891b2] dark:text-[#67e8f9]"
                  title="Light & dark mode"
                  description="Thoughtful theming that follows your system preference automatically."
                />
                <FeatureItem
                  icon={<GitFork className="w-5 h-5" />}
                  iconBg="bg-[color-mix(in_oklab,#475569_14%,transparent)]"
                  iconFg="text-[#475569] dark:text-[#cbd5e1]"
                  title="Free & open source"
                  description="MIT-licensed and on GitHub. Fork it, self-host it, or audit every byte — nothing is hidden."
                />
              </div>
            </section>
          )}

          {/* ── How it works ──────────────────────────────── */}
          {!searchQuery && (
            <section
              className="pt-2 sm:pt-4 animate-fade-in-up"
              style={{ animationDelay: `${(categories.length + 1) * 80}ms` }}
            >
              <div className="border border-slate-200 dark:border-dark-border bg-white/70 dark:bg-dark-surface/70 backdrop-blur-sm rounded-2xl shadow-sm px-5 py-8 sm:px-10 sm:py-12">
                <div className="text-center mb-8 sm:mb-10">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-600 dark:text-primary-400 mb-2.5">
                    How it works
                  </div>
                  <h2 className="text-[22px] sm:text-[28px] md:text-[32px] font-semibold tracking-[-0.02em] leading-[1.2] text-slate-900 dark:text-dark-text m-0">
                    From upload to download, in three steps.
                  </h2>
                </div>

                <ol className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 list-none p-0 m-0">
                  <Step
                    n={1}
                    title="Pick a tool"
                    description="Browse 35+ PDF utilities organised by what you want to do — all in one place."
                  />
                  <Step
                    n={2}
                    title="Drop your PDF"
                    description="Files are processed entirely in your browser. Nothing ever leaves your device."
                  />
                  <Step
                    n={3}
                    title="Download the result"
                    description="Polished output with no watermarks, no sign-ups, no waiting in a queue."
                  />
                </ol>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// ── HomeScreen sub-components ────────────────────────────────────

interface FeatureItemProps {
  icon: React.ReactNode;
  iconBg: string;
  iconFg: string;
  title: string;
  description: string;
}

function FeatureItem({ icon, iconBg, iconFg, title, description }: FeatureItemProps) {
  return (
    <div className="flex items-start gap-3.5">
      <span
        className={`shrink-0 w-10 h-10 rounded-lg grid place-items-center ${iconBg} ${iconFg}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[14.5px] font-semibold tracking-[-0.005em] text-slate-800 dark:text-dark-text mb-1">
          {title}
        </div>
        <div className="text-[13.5px] leading-[1.55] text-slate-500 dark:text-dark-text-muted">
          {description}
        </div>
      </div>
    </div>
  );
}

interface StepProps {
  n: number;
  title: string;
  description: string;
}

function Step({ n, title, description }: StepProps) {
  return (
    <li className="flex items-start gap-4">
      <span
        className="shrink-0 w-9 h-9 rounded-full grid place-items-center font-serif italic text-[17px] font-semibold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/40 border border-primary-100 dark:border-primary-800/60"
        aria-hidden="true"
      >
        {n}
      </span>
      <div>
        <div className="text-[15px] font-semibold tracking-[-0.005em] text-slate-800 dark:text-dark-text mb-1">
          {title}
        </div>
        <div className="text-[13.5px] leading-[1.55] text-slate-500 dark:text-dark-text-muted">
          {description}
        </div>
      </div>
    </li>
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

  return (
    <>
      <Layout onHome={goHome} showBack={!!activeTool || showPrivacy} onPrivacy={handlePrivacy}>
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
