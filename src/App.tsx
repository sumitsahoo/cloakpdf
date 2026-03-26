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
const SplitPdf = lazy(() => import("./tools/SplitPdf.tsx"));
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
    id: "split",
    title: "Split PDF",
    description: "Extract specific pages from a PDF file",
    icon: "✂️",
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
    description: "Add or remove a password from a PDF",
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
  split: SplitPdf,
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
