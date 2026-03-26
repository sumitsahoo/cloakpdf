/**
 * Shared TypeScript type definitions used across the application.
 */

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
  icon: string;
  category?: string;
}

/** Union of all valid tool identifiers. */
export type ToolId =
  | "merge"
  | "split"
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
  | "flatten";
