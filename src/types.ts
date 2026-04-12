/**
 * Shared TypeScript type definitions used across the application.
 */

import type { ComponentType } from "react";

/** A 1-based inclusive page range used by the Split PDF tool. */
export interface PageRange {
  start: number;
  end: number;
}

/** Configuration options for the Add Watermark tool. */
export interface WatermarkOptions {
  /** The watermark text to display. */
  text: string;
  /** Font size in PDF points. */
  fontSize: number;
  /** RGB colour with values in the 0–255 range. */
  color: { r: number; g: number; b: number };
  /** Opacity from 0 (fully transparent) to 1 (fully opaque). */
  opacity: number;
  /** Rotation angle in degrees (negative = counter-clockwise). */
  rotation: number;
}

/** Standard PDF document metadata fields. */
export interface PdfMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  creationDate: string;
  modificationDate: string;
}

/** Absolute position and dimensions (in PDF points) for signature placement. */
export interface Position {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Metadata describing a single PDF tool shown on the home screen. */
export interface Tool {
  id: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  category?: string;
}

/** Position of page numbers on the page. */
export type PageNumberPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

/** Display format for page numbers. */
export type PageNumberFormat = "1" | "Page 1" | "1 / N" | "Page 1 of N";

/** Configuration options for the Add Page Numbers tool. */
export interface PageNumberOptions {
  position: PageNumberPosition;
  format: PageNumberFormat;
  fontSize: number;
  color: { r: number; g: number; b: number };
  margin: number;
  startNumber: number;
  firstPage: number;
}

/** Configuration options for the Header & Footer tool. */
export interface HeaderFooterOptions {
  headerLeft: string;
  headerCenter: string;
  headerRight: string;
  footerLeft: string;
  footerCenter: string;
  footerRight: string;
  fontSize: number;
  color: { r: number; g: number; b: number };
  margin: number;
  skipFirstPage: boolean;
}

/** Crop margins in PDF points. */
export interface CropMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Position of Bates numbers on the page. */
export type BatesPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

/** Configuration options for the Bates Numbering tool. */
export interface BatesNumberOptions {
  prefix: string;
  suffix: string;
  startNumber: number;
  digits: number;
  position: BatesPosition;
  fontSize: number;
  color: { r: number; g: number; b: number };
  margin: number;
}

/** Union of all valid tool identifiers. */
export type ToolId =
  | "merge"
  | "compress"
  | "rotate"
  | "delete"
  | "reorder"
  | "images-to-pdf"
  | "watermark"
  | "signature"
  | "metadata"
  | "ocr"
  | "pdf-password"
  | "flatten"
  | "add-blank-page"
  | "duplicate-page"
  | "add-page-numbers"
  | "header-footer"
  | "crop-pages"
  | "pdf-to-image"
  | "fill-pdf-form"
  | "extract-pages"
  | "reverse-pages"
  | "redact-pdf"
  | "stamp-pdf"
  | "add-bookmarks"
  | "pdf-inspector"
  | "repair-pdf"
  | "nup-pages"
  | "remove-blank-pages"
  | "bates-numbering"
  | "contact-sheet"
  | "grayscale"
  | "file-attachment"
  | "split-pdf"
  | "extract-images"
  | "compare-pdf";
