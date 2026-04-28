/**
 * Single source of truth for tool metadata and lazy-loaded components.
 *
 * Previously these two arrays/maps lived inside App.tsx. They were
 * extracted so that workflow code can render any tool by id without
 * pulling App.tsx into its dependency graph.
 *
 * Tool order within each category encodes importance / frequency of use
 * — the home grid displays them in this order.
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
  GitMerge,
  Hash,
  ImageDown,
  Images,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Lock,
  Paperclip,
  PenTool,
  Repeat2,
  RotateCw,
  Scale,
  ScanText,
  Scissors,
  Stamp,
  Trash2,
  Wrench,
} from "lucide-react";
import { lazy } from "react";
import type { Tool, ToolId } from "../types.ts";

// ── Lazy-loaded tool components (code-split per tool) ────────────

const MergePdf = lazy(() => import("../tools/MergePdf.tsx"));
const CompressPdf = lazy(() => import("../tools/CompressPdf.tsx"));
const RotatePages = lazy(() => import("../tools/RotatePages.tsx"));
const DeletePages = lazy(() => import("../tools/DeletePages.tsx"));
const ReorderPages = lazy(() => import("../tools/ReorderPages.tsx"));
const ImagesToPdf = lazy(() => import("../tools/ImagesToPdf.tsx"));
const AddSignature = lazy(() => import("../tools/AddSignature.tsx"));
const EditMetadata = lazy(() => import("../tools/EditMetadata.tsx"));
const OcrPdf = lazy(() => import("../tools/OcrPdf.tsx"));
const PdfPassword = lazy(() => import("../tools/PdfPassword.tsx"));
const FlattenPdf = lazy(() => import("../tools/FlattenPdf.tsx"));
const AddBlankPage = lazy(() => import("../tools/AddBlankPage.tsx"));
const DuplicatePage = lazy(() => import("../tools/DuplicatePage.tsx"));
const AddPageNumbers = lazy(() => import("../tools/AddPageNumbers.tsx"));
const HeaderFooter = lazy(() => import("../tools/HeaderFooter.tsx"));
const CropPages = lazy(() => import("../tools/CropPages.tsx"));
const PdfToImage = lazy(() => import("../tools/PdfToImage.tsx"));
const FillPdfForm = lazy(() => import("../tools/FillPdfForm.tsx"));
const ExtractPages = lazy(() => import("../tools/ExtractPages.tsx"));
const ReversePages = lazy(() => import("../tools/ReversePages.tsx"));
const RedactPdf = lazy(() => import("../tools/RedactPdf.tsx"));
const StampPdf = lazy(() => import("../tools/StampPdf.tsx"));
const AddBookmarks = lazy(() => import("../tools/AddBookmarks.tsx"));
const PdfInspector = lazy(() => import("../tools/PdfInspector.tsx"));
const RepairPdf = lazy(() => import("../tools/RepairPdf.tsx"));
const NupPages = lazy(() => import("../tools/NupPages.tsx"));
const RemoveBlankPages = lazy(() => import("../tools/RemoveBlankPages.tsx"));
const BatesNumbering = lazy(() => import("../tools/BatesNumbering.tsx"));
const ContactSheet = lazy(() => import("../tools/ContactSheet.tsx"));
const GrayscalePdf = lazy(() => import("../tools/GrayscalePdf.tsx"));
const FileAttachment = lazy(() => import("../tools/FileAttachment.tsx"));
const SplitPdf = lazy(() => import("../tools/SplitPdf.tsx"));
const ExtractImages = lazy(() => import("../tools/ExtractImages.tsx"));
const ComparePdf = lazy(() => import("../tools/ComparePdf.tsx"));
const DigitalSignature = lazy(() => import("../tools/DigitalSignature.tsx"));

// ── Tool metadata ────────────────────────────────────────────────

export const tools: Tool[] = [
  // ── Organise & Edit ──────────────────────────────────────
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
  {
    id: "compress",
    title: "Compress PDF",
    description: "Reduce PDF file size for easier sharing",
    icon: Archive,
    category: "transform",
  },
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

// ── Map tool IDs → lazy-loaded components ────────────────────────

export const toolComponents: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
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

// ── Category definitions for the home screen ─────────────────────

export const categories = [
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

/** Look up a tool's metadata by id, or `null` if unknown. */
export function findTool(id: string): Tool | null {
  return tools.find((t) => t.id === id) ?? null;
}

/** Look up a tool's lazy component by id, or `null` if unknown. */
export function findToolComponent(
  id: ToolId,
): React.LazyExoticComponent<React.ComponentType> | null {
  return toolComponents[id] ?? null;
}
