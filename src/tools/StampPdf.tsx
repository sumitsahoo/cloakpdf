/**
 * Stamp & Watermark PDF tool.
 *
 * Applies a pre-defined text stamp (DRAFT, APPROVED, CONFIDENTIAL, etc.) or a
 * custom text watermark to all or selected pages. Stamp mode offers curated
 * presets in text or seal style; watermark mode provides free-text entry with
 * configurable colour, rotation, and opacity.
 */

import { Check, CircleDot, Droplets, RectangleHorizontal, Stamp } from "lucide-react";
import { useCallback, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { CheckboxField } from "../components/CheckboxField.tsx";
import { ColorPicker, hexToRgb, rgbToHex } from "../components/ColorPicker.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { LabeledSlider } from "../components/LabeledSlider.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { usePdfFile } from "../hooks/usePdfFile.ts";
import { usePreviewScale } from "../hooks/usePreviewScale.ts";
import type { WatermarkOptions } from "../types.ts";
import { downloadPdf, pdfFilename } from "../utils/file-helpers.ts";
import { addRectangleStamp, addSealStamp, addWatermark } from "../utils/pdf-operations.ts";
import { PREVIEW_SCALE, renderAllThumbnails, revokeThumbnails } from "../utils/pdf-renderer.ts";

/** Data loaded once per file: thumbnails + per-page dimensions in PDF points. */
interface LoadedPdf {
  thumbnails: string[];
  pageDims: { width: number; height: number }[];
}

/** Load thumbnails and page dimensions together in a single pass. */
async function loadPdfWithDims(file: File): Promise<LoadedPdf> {
  const [thumbnails, { PDFDocument }] = await Promise.all([
    renderAllThumbnails(file, PREVIEW_SCALE),
    import("@pdfme/pdf-lib"),
  ]);
  const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
  const pageDims = pdfDoc.getPages().map((p) => p.getSize());
  return { thumbnails, pageDims };
}

type StampStyle = "text" | "seal" | "rectangle" | "watermark";

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
  const [selectedStamp, setSelectedStamp] = useState<StampPreset>(STAMPS[0]);
  const [fontSize, setFontSize] = useState(64);
  const [opacity, setOpacity] = useState(0.35);
  const [stampStyle, setStampStyle] = useState<StampStyle>("text");
  const [customText, setCustomText] = useState("CONFIDENTIAL");
  const [customColor, setCustomColor] = useState({ r: 30, g: 41, b: 59 });
  const [rotation, setRotation] = useState(-45);
  const [applyToAllPages, setApplyToAllPages] = useState(true);
  const [selectedPage, setSelectedPage] = useState(0);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());

  const pdf = usePdfFile<LoadedPdf>({
    load: loadPdfWithDims,
    onReset: (data) => {
      revokeThumbnails(data?.thumbnails ?? []);
      setSelectedPage(0);
      setSelectedPages(new Set());
    },
  });
  const task = useAsyncProcess();

  const thumbnails = pdf.data?.thumbnails ?? [];
  const pageDims = pdf.data?.pageDims ?? [];
  const loading = pdf.loading;
  const processing = task.processing;
  const error = pdf.loadError ?? task.error;

  const [previewScale, previewRef] = usePreviewScale(pageDims[selectedPage]);

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
    if (!pdf.file) return;
    const file = pdf.file;
    await task.run(async () => {
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
      } else if (stampStyle === "rectangle") {
        result = await addRectangleStamp(
          file,
          selectedStamp.label,
          fontSize,
          selectedStamp.color,
          opacity,
          pageIndices,
        );
      } else if (stampStyle === "watermark") {
        const options: WatermarkOptions = {
          text: customText,
          fontSize,
          color: customColor,
          opacity,
          rotation,
        };
        result = await addWatermark(file, options, pageIndices);
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
      const suffix = stampStyle === "watermark" ? "_watermarked" : "_stamped";
      downloadPdf(result, pdfFilename(file, suffix));
    }, "Failed to apply stamp. Please try again.");
  }, [
    pdf.file,
    selectedStamp,
    fontSize,
    opacity,
    stampStyle,
    applyToAllPages,
    selectedPages,
    customText,
    customColor,
    rotation,
    task,
  ]);

  const canApply =
    (applyToAllPages || selectedPages.size > 0) &&
    (stampStyle !== "watermark" || customText.trim().length > 0);

  return (
    <div className="space-y-6">
      {!pdf.file ? (
        <FileDropZone
          glowColor={categoryGlow.annotate}
          iconColor={categoryAccent.annotate}
          accept=".pdf,application/pdf"
          onFiles={pdf.onFiles}
          label="Drop a PDF file here"
          hint="Apply a stamp (DRAFT, APPROVED, etc.) or a custom text watermark"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={pdf.file.name}
            details={`${thumbnails.length} pages`}
            onChangeFile={pdf.reset}
          />

          <div className="grid md:grid-cols-2 gap-6 items-start">
            {/* Left column: controls + page selection */}
            <div className="space-y-5">
              {/* Stamp style toggle */}
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-dark-text-muted mb-2">
                  Mode
                </p>
                <div className="inline-flex w-full items-center gap-0.5 rounded-xl bg-slate-100 dark:bg-dark-bg p-1 border border-slate-200 dark:border-dark-border">
                  {(["text", "seal", "rectangle", "watermark"] as const).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setStampStyle(style)}
                      className={`flex-1 rounded-lg py-1.5 px-3 text-sm transition-all duration-150 ${
                        stampStyle === style
                          ? "font-semibold text-white bg-primary-600 shadow-sm"
                          : "font-medium text-slate-500 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text hover:bg-white/60 dark:hover:bg-dark-surface-alt"
                      }`}
                    >
                      <span className="flex items-center justify-center gap-1.5">
                        {style === "text" ? (
                          <>
                            <Stamp className="w-3.5 h-3.5" /> Stamp
                          </>
                        ) : style === "seal" ? (
                          <>
                            <CircleDot className="w-3.5 h-3.5" /> Seal
                          </>
                        ) : style === "rectangle" ? (
                          <>
                            <RectangleHorizontal className="w-3.5 h-3.5" /> Badge
                          </>
                        ) : (
                          <>
                            <Droplets className="w-3.5 h-3.5" /> Watermark
                          </>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {stampStyle === "watermark" ? (
                <>
                  <div>
                    <label
                      htmlFor="watermark-text"
                      className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5"
                    >
                      Watermark Text
                    </label>
                    <input
                      id="watermark-text"
                      type="text"
                      value={customText}
                      onChange={(e) => setCustomText(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-dark-border dark:bg-dark-surface dark:text-dark-text rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="Enter watermark text"
                    />
                  </div>

                  <LabeledSlider
                    id="watermark-font-size"
                    label="Font Size"
                    value={fontSize}
                    min={12}
                    max={120}
                    unit="px"
                    onChange={(v) => setFontSize(v)}
                  />

                  <LabeledSlider
                    id="watermark-opacity"
                    label="Opacity"
                    value={Math.round(opacity * 100)}
                    min={5}
                    max={100}
                    unit="%"
                    onChange={(v) => setOpacity(v / 100)}
                    displayValue={`${Math.round(opacity * 100)}%`}
                  />

                  <LabeledSlider
                    id="watermark-rotation"
                    label="Rotation"
                    value={rotation}
                    min={-90}
                    max={90}
                    unit="°"
                    onChange={(v) => setRotation(v)}
                  />

                  <ColorPicker
                    value={rgbToHex(customColor.r, customColor.g, customColor.b)}
                    onChange={(hex) => setCustomColor(hexToRgb(hex))}
                  />
                </>
              ) : (
                <>
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

                  <LabeledSlider
                    id="stamp-font-size"
                    label="Size"
                    value={fontSize}
                    min={24}
                    max={120}
                    unit="pt"
                    onChange={(v) => setFontSize(v)}
                  />

                  <LabeledSlider
                    id="stamp-opacity"
                    label="Opacity"
                    value={Math.round(opacity * 100)}
                    min={10}
                    max={100}
                    unit="%"
                    onChange={(v) => setOpacity(v / 100)}
                    displayValue={`${Math.round(opacity * 100)}%`}
                  />
                </>
              )}

              {thumbnails.length > 1 && (
                <div className="space-y-3">
                  <CheckboxField
                    label="Apply to all pages"
                    checked={applyToAllPages}
                    onChange={(v) => {
                      setApplyToAllPages(v);
                      if (v) setSelectedPages(new Set());
                    }}
                  />

                  {!applyToAllPages && (
                    <div className="space-y-2">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
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
                          <LoadingSpinner size="sm" />
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
                                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
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
                  <LoadingSpinner />
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
                    style={
                      stampStyle === "watermark"
                        ? { transform: `rotate(${rotation}deg)` }
                        : undefined
                    }
                  >
                    {stampStyle === "watermark" ? (
                      <span
                        style={{
                          fontSize: `${fontSize * previewScale}px`,
                          color: rgbaColor(customColor, opacity),
                          fontWeight: "bold",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {customText}
                      </span>
                    ) : stampStyle === "text" ? (
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
                    ) : stampStyle === "rectangle" ? (
                      <div
                        style={{
                          transform: "rotate(-12deg)",
                          border: `${Math.max(2, fontSize * previewScale * 0.12)}px solid ${rgbaColor(selectedStamp.color, opacity)}`,
                          borderRadius: `${fontSize * previewScale * 0.4}px`,
                          backgroundColor: rgbaColor(selectedStamp.color, opacity * 0.08),
                          padding: `${fontSize * previewScale * 0.4}px ${fontSize * previewScale * 1.0}px`,
                        }}
                      >
                        <span
                          style={{
                            fontSize: `${fontSize * previewScale}px`,
                            color: rgbaColor(selectedStamp.color, opacity),
                            fontWeight: "bold",
                            whiteSpace: "nowrap",
                            letterSpacing: "0.05em",
                          }}
                        >
                          {selectedStamp.label}
                        </span>
                      </div>
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

          <ActionButton
            onClick={handleApply}
            processing={processing}
            disabled={processing || !canApply}
            label={
              stampStyle === "watermark"
                ? "Apply Watermark & Download"
                : `Apply "${selectedStamp.label}" Stamp & Download`
            }
            processingLabel="Applying..."
          />
        </>
      )}

      {error && <AlertBox message={error} />}
    </div>
  );
}
