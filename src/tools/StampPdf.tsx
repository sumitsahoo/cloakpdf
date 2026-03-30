/**
 * Stamp PDF tool.
 *
 * Applies a pre-defined text stamp (DRAFT, APPROVED, CONFIDENTIAL, etc.) to
 * all or selected pages. Uses the same underlying watermark operation as the
 * Add Watermark tool but with curated presets for the most common stamp types.
 * Users can still adjust font size and opacity.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import type { WatermarkOptions } from "../types.ts";
import { downloadPdf } from "../utils/file-helpers.ts";
import { addSealStamp, addWatermark } from "../utils/pdf-operations.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";

type StampStyle = "text" | "seal";

interface StampPreset {
  id: string;
  label: string;
  color: { r: number; g: number; b: number };
  bg: string;
}

const STAMPS: StampPreset[] = [
  {
    id: "draft",
    label: "DRAFT",
    color: { r: 100, g: 100, b: 100 },
    bg: "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200",
  },
  {
    id: "approved",
    label: "APPROVED",
    color: { r: 22, g: 163, b: 74 },
    bg: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
  },
  {
    id: "confidential",
    label: "CONFIDENTIAL",
    color: { r: 220, g: 38, b: 38 },
    bg: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
  },
  {
    id: "rejected",
    label: "REJECTED",
    color: { r: 185, g: 28, b: 28 },
    bg: "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300",
  },
  {
    id: "copy",
    label: "COPY",
    color: { r: 37, g: 99, b: 235 },
    bg: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  },
  {
    id: "void",
    label: "VOID",
    color: { r: 234, g: 88, b: 12 },
    bg: "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300",
  },
  {
    id: "for-review",
    label: "FOR REVIEW",
    color: { r: 161, g: 98, b: 7 },
    bg: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300",
  },
  {
    id: "top-secret",
    label: "TOP SECRET",
    color: { r: 127, g: 29, b: 29 },
    bg: "bg-red-100 dark:bg-red-900/40 text-red-900 dark:text-red-200",
  },
];

function rgbaColor(c: { r: number; g: number; b: number }, a: number) {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
}

let sealFilterCounter = 0;

function SealPreview({
  label,
  color,
  fontSize,
  opacity,
}: {
  label: string;
  color: { r: number; g: number; b: number };
  fontSize: number;
  opacity: number;
}) {
  const [filterId] = useState(() => `stamp-grunge-${++sealFilterCounter}`);
  const textW = label.length * fontSize * 0.63;
  const pad = fontSize * 0.8;
  const innerR = textW / 2 + pad;
  const outerR = innerR + fontSize * 0.6;
  const stroke = fontSize * 0.15;
  const c = rgbaColor(color, opacity);
  const size = outerR * 2 + stroke;
  const cx = size / 2;
  const cy = size / 2;
  const midR = (innerR + outerR) / 2;
  const dot = fontSize * 0.12;
  const lineY = fontSize * 0.85;
  const lineW = innerR * 0.75;
  const rotation = -12;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id={filterId}>
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="4" seed="2" />
          <feDisplacementMap in="SourceGraphic" scale="2" />
        </filter>
      </defs>
      <g filter={`url(#${filterId})`} transform={`rotate(${rotation} ${cx} ${cy})`}>
        {/* Outer circle */}
        <circle cx={cx} cy={cy} r={outerR} fill="none" stroke={c} strokeWidth={stroke} />
        {/* Inner circle */}
        <circle cx={cx} cy={cy} r={innerR} fill="none" stroke={c} strokeWidth={stroke * 0.6} />
        {/* Line above text */}
        <line
          x1={cx - lineW}
          y1={cy - lineY}
          x2={cx + lineW}
          y2={cy - lineY}
          stroke={c}
          strokeWidth={stroke * 0.5}
        />
        {/* Line below text */}
        <line
          x1={cx - lineW}
          y1={cy + lineY}
          x2={cx + lineW}
          y2={cy + lineY}
          stroke={c}
          strokeWidth={stroke * 0.5}
        />
        {/* Left dot */}
        <circle cx={cx - midR} cy={cy} r={dot} fill={c} />
        {/* Right dot */}
        <circle cx={cx + midR} cy={cy} r={dot} fill={c} />
        {/* Star at top */}
        <polygon points={starPoints(cx, cy - midR, dot * 1.3, 5)} fill={c} />
        {/* Star at bottom */}
        <polygon points={starPoints(cx, cy + midR, dot * 1.3, 5)} fill={c} />
        {/* Label */}
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill={c}
          fontSize={fontSize}
          fontWeight="bold"
          letterSpacing="0.05em"
          fontFamily="Helvetica, Arial, sans-serif"
        >
          {label}
        </text>
      </g>
    </svg>
  );
}

function starPoints(cx: number, cy: number, r: number, points: number) {
  const inner = r * 0.4;
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI / points) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? r : inner;
    pts.push(`${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`);
  }
  return pts.join(" ");
}

export default function StampPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStamp, setSelectedStamp] = useState<StampPreset>(STAMPS[0]);
  const [fontSize, setFontSize] = useState(64);
  const [opacity, setOpacity] = useState(0.35);
  const [stampStyle, setStampStyle] = useState<StampStyle>("text");
  const [applyToAllPages, setApplyToAllPages] = useState(true);
  const [selectedPage, setSelectedPage] = useState(0);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());

  const [pageDims, setPageDims] = useState<{ width: number; height: number }[]>([]);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(0.4);

  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setSelectedPage(0);
    setSelectedPages(new Set());
    setLoading(true);
    setError(null);
    try {
      const thumbs = await renderAllThumbnails(pdf);
      setThumbnails(thumbs);
      const { PDFDocument } = await import("pdf-lib");
      const data = await pdf.arrayBuffer();
      const pdfDoc = await PDFDocument.load(data);
      setPageDims(pdfDoc.getPages().map((p) => p.getSize()));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to load PDF. The file may be corrupted or password-protected.",
      );
      setFile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!previewRef.current || !pageDims[selectedPage]) return;
    const el = previewRef.current;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width) setPreviewScale(rect.width / pageDims[selectedPage].width);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageDims, selectedPage]);

  const togglePage = useCallback((index: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
    setSelectedPage(index);
  }, []);

  const handleApply = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    try {
      const pageIndices = applyToAllPages ? undefined : [...selectedPages].sort((a, b) => a - b);
      let result: Uint8Array;
      if (stampStyle === "seal") {
        result = await addSealStamp(
          file,
          selectedStamp.label,
          fontSize,
          selectedStamp.color,
          opacity,
          pageIndices,
        );
      } else {
        const options: WatermarkOptions = {
          text: selectedStamp.label,
          fontSize,
          color: selectedStamp.color,
          opacity,
          rotation: -45,
        };
        result = await addWatermark(file, options, pageIndices);
      }
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_stamped.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply stamp. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file, selectedStamp, fontSize, opacity, stampStyle, applyToAllPages, selectedPages]);

  const canApply = applyToAllPages || selectedPages.size > 0;

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Apply a pre-built stamp like DRAFT, APPROVED, or CONFIDENTIAL"
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted">
              <span className="font-medium">{file.name}</span> — {thumbnails.length} pages
            </p>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setThumbnails([]);
                setPageDims([]);
                setSelectedPages(new Set());
              }}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              Change file
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-6 items-start">
            {/* Left column: controls + page selection */}
            <div className="space-y-5">
              {/* Stamp style toggle */}
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text mb-2">
                  Stamp Style
                </p>
                <div className="flex gap-2">
                  {(["text", "seal"] as const).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setStampStyle(style)}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                        stampStyle === style
                          ? "border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 ring-2 ring-primary-200 dark:ring-primary-800"
                          : "border-slate-200 dark:border-dark-border text-slate-600 dark:text-dark-text-muted hover:border-slate-300"
                      }`}
                    >
                      {style === "text" ? "⌶ Text" : "◎ Seal"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text mb-2">
                  Stamp Type
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {STAMPS.map((stamp) => (
                    <button
                      key={stamp.id}
                      type="button"
                      onClick={() => setSelectedStamp(stamp)}
                      className={`px-3 py-2 rounded-lg text-xs font-bold border-2 transition-all ${stamp.bg} ${
                        selectedStamp.id === stamp.id
                          ? "border-primary-500 ring-2 ring-primary-200 dark:ring-primary-800"
                          : "border-transparent"
                      }`}
                    >
                      {stamp.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="stamp-font-size"
                  className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5"
                >
                  Size: {fontSize}pt
                </label>
                <input
                  id="stamp-font-size"
                  type="range"
                  min={24}
                  max={120}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-full accent-primary-600"
                />
              </div>

              <div>
                <label
                  htmlFor="stamp-opacity"
                  className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5"
                >
                  Opacity: {Math.round(opacity * 100)}%
                </label>
                <input
                  id="stamp-opacity"
                  type="range"
                  min={10}
                  max={100}
                  value={Math.round(opacity * 100)}
                  onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                  className="w-full accent-primary-600"
                />
              </div>

              {thumbnails.length > 1 && (
                <div className="space-y-3">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={applyToAllPages}
                      onChange={(e) => {
                        setApplyToAllPages(e.target.checked);
                        if (e.target.checked) setSelectedPages(new Set());
                      }}
                      className="accent-primary-600 w-4 h-4 rounded"
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-dark-text">
                      Apply to all pages
                    </span>
                  </label>

                  {!applyToAllPages && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                          Select pages
                          {selectedPages.size > 0 && (
                            <span className="text-primary-600 dark:text-primary-400 ml-1.5">
                              ({selectedPages.size} selected)
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPages(new Set(thumbnails.map((_, i) => i)));
                              setSelectedPage(0);
                            }}
                            className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400"
                          >
                            All
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedPages(new Set())}
                            className="text-xs text-slate-500 hover:text-slate-700 dark:text-dark-text-muted"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      {loading ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {thumbnails.map((thumb, i) => {
                            const pageNumber = i + 1;
                            return (
                              <PageThumbnail
                                key={pageNumber}
                                src={thumb}
                                pageNumber={pageNumber}
                                selected={selectedPages.has(i)}
                                onClick={() => togglePage(i)}
                                overlay={
                                  selectedPages.has(i) ? (
                                    <div className="bg-primary-600/20 inset-0 absolute flex items-center justify-center">
                                      <div className="w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center shadow">
                                        <svg
                                          className="w-3 h-3 text-white"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                          aria-label="Selected"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={3}
                                            d="M5 13l4 4L19 7"
                                          />
                                        </svg>
                                      </div>
                                    </div>
                                  ) : null
                                }
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right column: preview */}
            <div className="sticky top-4">
              <p className="text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                Preview — Page {selectedPage + 1}
              </p>
              {loading ? (
                <div className="aspect-3/4 bg-slate-100 dark:bg-dark-surface-alt rounded-lg flex items-center justify-center">
                  <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                </div>
              ) : thumbnails[selectedPage] ? (
                <div
                  ref={previewRef}
                  className="relative bg-white dark:bg-dark-surface rounded-lg border border-slate-200 dark:border-dark-border overflow-hidden"
                  style={
                    pageDims[selectedPage]
                      ? {
                          aspectRatio: `${pageDims[selectedPage].width} / ${pageDims[selectedPage].height}`,
                        }
                      : { aspectRatio: "3 / 4" }
                  }
                >
                  <img
                    src={thumbnails[selectedPage]}
                    alt={`Page ${selectedPage + 1}`}
                    className="w-full h-full object-contain"
                  />
                  <div
                    key={stampStyle}
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  >
                    {stampStyle === "text" ? (
                      <span
                        style={{
                          transform: "rotate(-45deg)",
                          fontSize: `${fontSize * previewScale}px`,
                          color: rgbaColor(selectedStamp.color, opacity),
                          fontWeight: "bold",
                          whiteSpace: "nowrap",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {selectedStamp.label}
                      </span>
                    ) : (
                      <SealPreview
                        label={selectedStamp.label}
                        color={selectedStamp.color}
                        fontSize={fontSize * previewScale}
                        opacity={opacity}
                      />
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={handleApply}
            disabled={processing || !canApply}
            className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? "Stamping..." : `Apply "${selectedStamp.label}" Stamp & Download`}
          </button>
        </>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}
    </div>
  );
}
