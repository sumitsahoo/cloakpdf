export interface PageRange {
  start: number;
  end: number;
}

export interface WatermarkOptions {
  text: string;
  fontSize: number;
  color: { r: number; g: number; b: number };
  opacity: number;
  rotation: number;
}

export interface Position {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Tool {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export type ToolId =
  | "merge"
  | "split"
  | "compress"
  | "rotate"
  | "delete"
  | "reorder"
  | "images-to-pdf"
  | "watermark"
  | "signature";
