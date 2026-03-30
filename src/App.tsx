/**
 * Root application component.
 *
 * Manages the active tool state and renders either the home screen
 * (a grid of ToolCards) or the selected tool’s component. All tool
 * components are lazy-loaded via `React.lazy` and wrapped in
 * `Suspense` with a spinning loader fallback.
 */

import { useState, useCallback, lazy, Suspense } from "react";
import { Layout } from "./components/Layout.tsx";
import { ToolCard } from "./components/ToolCard.tsx";
import type { Tool, ToolId } from "./types.ts";

// ---- Lazy-loaded tool components (code-split per tool) ----

const MergePdf = lazy(() => import("./tools/MergePdf.tsx"));
const CompressPdf = lazy(() => import("./tools/CompressPdf.tsx"));
const RotatePages = lazy(() => import("./tools/RotatePages.tsx"));
const DeletePages = lazy(() => import("./tools/DeletePages.tsx"));
const ReorderPages = lazy(() => import("./tools/ReorderPages.tsx"));
const ImagesToPdf = lazy(() => import("./tools/ImagesToPdf.tsx"));
const AddWatermark = lazy(() => import("./tools/AddWatermark.tsx"));
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

// ---- Tool metadata displayed on the home screen grid ----
const tools: Tool[] = [
  {
    id: "merge",
    title: "Merge PDFs",
    description: "Combine multiple PDF files into one document",
    icon: "📑",
    category: "organise",
  },
  {
    id: "compress",
    title: "Compress PDF",
    description: "Reduce PDF file size for easier sharing",
    icon: "🗜️",
    category: "transform",
  },
  {
    id: "rotate",
    title: "Rotate Pages",
    description: "Rotate individual pages in any direction",
    icon: "🔄",
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
    id: "reorder",
    title: "Reorder Pages",
    description: "Drag and drop to rearrange page order",
    icon: "↕️",
    category: "organise",
  },
  {
    id: "images-to-pdf",
    title: "Images to PDF",
    description: "Convert images into a PDF document",
    icon: "🖼️",
    category: "transform",
  },
  {
    id: "watermark",
    title: "Add Watermark",
    description: "Add text watermark to all pages",
    icon: "💧",
    category: "annotate",
  },
  {
    id: "signature",
    title: "Add Signature",
    description: "Draw or upload a custom signature image and place it on a page",
    icon: "✍️",
    category: "annotate",
  },
  {
    id: "metadata",
    title: "Edit Metadata",
    description: "View and edit PDF document properties",
    icon: "📋",
    category: "security",
  },
  {
    id: "ocr",
    title: "OCR PDF",
    description: "Extract text from scanned PDFs using OCR",
    icon: "🔍",
    category: "transform",
  },
  {
    id: "pdf-password",
    title: "PDF Password",
    description: "Add or remove a password and control print, copy, and edit rights",
    icon: "🔒",
    category: "security",
  },
  {
    id: "flatten",
    title: "Flatten PDF",
    description: "Remove form fields and annotations, making the PDF non-editable",
    icon: "📐",
    category: "transform",
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
    id: "add-page-numbers",
    title: "Add Page Numbers",
    description: "Insert page numbers with custom position and format",
    icon: "🔢",
    category: "annotate",
  },
  {
    id: "header-footer",
    title: "Header & Footer",
    description: "Add repeating text at the top and/or bottom of every page",
    icon: "📝",
    category: "annotate",
  },
  {
    id: "crop-pages",
    title: "Crop Pages",
    description: "Trim page margins by adjusting the visible area",
    icon: "✂️",
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
    id: "fill-pdf-form",
    title: "Fill PDF Form",
    description: "Fill interactive form fields in existing PDFs",
    icon: "📝",
    category: "annotate",
  },
  {
    id: "extract-pages",
    title: "Extract Pages",
    description: "Select specific pages and save them as a new PDF",
    icon: "📤",
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
    id: "stamp-pdf",
    title: "Stamp PDF",
    description: "Apply a pre-built stamp such as DRAFT, APPROVED, or CONFIDENTIAL",
    icon: "🖊️",
    category: "annotate",
  },
  {
    id: "redact-pdf",
    title: "Redact PDF",
    description: "Permanently black out sensitive text and images",
    icon: "⬛",
    category: "annotate",
  },
  {
    id: "repair-pdf",
    title: "Repair PDF",
    description: "Fix structural issues in corrupted or malformed PDFs",
    icon: "🔧",
    category: "transform",
  },
  {
    id: "pdf-inspector",
    title: "PDF Inspector",
    description: "View version, page dimensions, metadata, and encryption status",
    icon: "🔎",
    category: "security",
  },

  {
    id: "nup-pages",
    title: "N-up Pages",
    description: "Arrange multiple pages onto a single sheet for compact printing",
    icon: "🔲",
    category: "transform",
  },
  {
    id: "remove-blank-pages",
    title: "Remove Blank Pages",
    description: "Auto-detect and remove empty pages from a PDF",
    icon: "🧹",
    category: "organise",
  },
];

// ---- Category definitions for the home screen ----
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

// ---- Map tool IDs to their lazily-loaded components ----
const toolComponents: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  merge: MergePdf,
  compress: CompressPdf,
  rotate: RotatePages,
  delete: DeletePages,
  reorder: ReorderPages,
  "images-to-pdf": ImagesToPdf,
  watermark: AddWatermark,
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
};

/** Full-screen centred spinner shown while a tool component is loading. */
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
    </div>
  );
}

export function App() {
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);

  const goHome = useCallback(() => setActiveTool(null), []);

  const activeMeta = activeTool ? tools.find((t) => t.id === activeTool) : null;
  const ToolComponent = activeTool ? toolComponents[activeTool] : null;

  return (
    <Layout onHome={goHome} showBack={!!activeTool}>
      {activeTool && ToolComponent ? (
        <div>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-dark-text">
              {activeMeta?.title}
            </h1>
            <p className="text-slate-500 dark:text-dark-text-muted mt-1">
              {activeMeta?.description}
            </p>
          </div>
          <Suspense fallback={<LoadingSpinner />}>
            <ToolComponent />
          </Suspense>
        </div>
      ) : (
        <div>
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-dark-text mb-1.5">
              All-in-One PDF Tools That Respect Your Privacy
            </h1>
            <p className="text-base text-slate-500 dark:text-dark-text-muted max-w-2xl mx-auto">
              Edit, merge, sign, secure, and convert PDFs entirely in your browser. Your files never
              leave your device.
            </p>
          </div>
          <div className="space-y-10">
            {categories.map((cat, catIdx) => {
              const catTools = tools.filter((t) => t.category === cat.key);
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
                      <ToolCard
                        key={tool.id}
                        tool={tool}
                        onClick={() => setActiveTool(tool.id as ToolId)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </Layout>
  );
}
