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

// ---- Tool metadata displayed on the home screen grid ----
const tools: Tool[] = [
  {
    id: "merge",
    title: "Merge PDFs",
    description: "Combine multiple PDF files into one document",
    icon: "📑",
  },
  {
    id: "split",
    title: "Split PDF",
    description: "Extract specific pages from a PDF file",
    icon: "✂️",
  },
  {
    id: "compress",
    title: "Compress PDF",
    description: "Reduce PDF file size for easier sharing",
    icon: "🗜️",
  },
  {
    id: "rotate",
    title: "Rotate Pages",
    description: "Rotate individual pages in any direction",
    icon: "🔄",
  },
  {
    id: "delete",
    title: "Delete Pages",
    description: "Remove unwanted pages from a PDF",
    icon: "🗑️",
  },
  {
    id: "reorder",
    title: "Reorder Pages",
    description: "Drag and drop to rearrange page order",
    icon: "↕️",
  },
  {
    id: "images-to-pdf",
    title: "Images to PDF",
    description: "Convert images into a PDF document",
    icon: "🖼️",
  },
  {
    id: "watermark",
    title: "Add Watermark",
    description: "Add text watermark to all pages",
    icon: "💧",
  },
  {
    id: "signature",
    title: "Add Signature",
    description: "Draw and place a signature on a page",
    icon: "✍️",
  },
  {
    id: "metadata",
    title: "Edit Metadata",
    description: "View and edit PDF document properties",
    icon: "📋",
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
          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 dark:text-dark-text mb-3">
              PDF Tools That Respect Your Privacy
            </h1>
            <p className="text-lg text-slate-500 dark:text-dark-text-muted max-w-2xl mx-auto">
              Edit, merge, split, and compress PDFs entirely in your browser. Your files never leave
              your device.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tools.map((tool) => (
              <ToolCard
                key={tool.id}
                tool={tool}
                onClick={() => setActiveTool(tool.id as ToolId)}
              />
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}
