/**
 * Bates Numbering tool.
 *
 * Stamps sequential identifiers (prefix + zero-padded number + suffix) on
 * every page of a PDF. Widely used in legal, compliance, and archival
 * workflows to uniquely label each page in a document set.
 */

import { ChevronLeft, ChevronRight, Move, Undo2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { ColorPicker, hexToRgb, rgbToHex } from "../components/ColorPicker.tsx";
import { addBatesNumbers } from "../utils/pdf-operations.ts";
import { downloadPdf } from "../utils/file-helpers.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";
import type { BatesNumberOptions, BatesPosition } from "../types.ts";

const POSITIONS: { value: BatesPosition; label: string; title: string }[] = [
  { value: "top-left", label: "↖", title: "Top left" },
  { value: "top-center", label: "↑", title: "Top center" },
  { value: "top-right", label: "↗", title: "Top right" },
  { value: "bottom-left", label: "↙", title: "Bottom left" },
  { value: "bottom-center", label: "↓", title: "Bottom center" },
  { value: "bottom-right", label: "↘", title: "Bottom right" },
];

const DEFAULT_OPTIONS: BatesNumberOptions = {
  prefix: "BATES-",
  suffix: "",
  startNumber: 1,
  digits: 6,
  position: "bottom-right",
  fontSize: 10,
  color: { r: 30, g: 41, b: 59 },
  margin: 20,
};

/** CSS positioning for the Bates label overlay on a live thumbnail. */
function overlayStyle(
  pos: BatesPosition,
  marginPt: number,
  pageDim: { width: number; height: number } | undefined,
): React.CSSProperties {
  const mV = pageDim ? `${(marginPt / pageDim.height) * 100}%` : "3%";
  const mH = pageDim ? `${(marginPt / pageDim.width) * 100}%` : "3%";

  const base: React.CSSProperties = { position: "absolute", whiteSpace: "nowrap" };

  if (pos.startsWith("top")) base.top = mV;
  else base.bottom = mV;

  if (pos.endsWith("left")) {
    base.left = mH;
    base.textAlign = "left";
  } else if (pos.endsWith("right")) {
    base.right = mH;
    base.textAlign = "right";
  } else {
    base.left = "50%";
    base.transform = "translateX(-50%)";
    base.textAlign = "center";
  }

  return base;
}

export default function BatesNumbering() {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [pageDims, setPageDims] = useState<{ width: number; height: number }[]>([]);
  const [selectedPage, setSelectedPage] = useState(0);
  const [options, setOptions] = useState<BatesNumberOptions>(DEFAULT_OPTIONS);
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Scale factor: preview px / page pt — used to size the font overlay correctly
  const [previewScale, setPreviewScale] = useState(0.5);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  /* Keep preview font scale in sync with the container's rendered width */
  useEffect(() => {
    const el = previewContainerRef.current;
    const dim = pageDims[selectedPage];
    if (!el || !dim) return;
    const update = () => {
      setPreviewScale(el.getBoundingClientRect().width / dim.width);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [selectedPage, pageDims]);

  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setSelectedPage(0);
    setError(null);
    setLoading(true);
    try {
      const [thumbs, { PDFDocument }] = await Promise.all([
        renderAllThumbnails(pdf),
        import("pdf-lib"),
      ]);
      setThumbnails(thumbs);
      const pdfDoc = await PDFDocument.load(await pdf.arrayBuffer());
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

  const handleReset = useCallback(() => {
    setOptions(DEFAULT_OPTIONS);
  }, []);

  const isDirty = JSON.stringify(options) !== JSON.stringify(DEFAULT_OPTIONS);

  const setOpt = useCallback(
    <K extends keyof BatesNumberOptions>(key: K, value: BatesNumberOptions[K]) => {
      setOptions((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleApply = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    try {
      const result = await addBatesNumbers(file, options);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_bates.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add Bates numbering. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file, options]);

  const pageCount = thumbnails.length;

  // Bates label for the currently previewed page
  const previewLabel = `${options.prefix}${String(options.startNumber + selectedPage).padStart(options.digits, "0")}${options.suffix}`;

  const { r, g, b } = options.color;
  const labelColor = `rgb(${r},${g},${b})`;
  const displayFontSize = Math.max(6, Math.round(options.fontSize * previewScale));

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          glowColor={categoryGlow.annotate}
          iconColor={categoryAccent.annotate}
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Sequential Bates numbers will be stamped on every page"
        />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted break-all sm:break-normal">
              <span className="font-medium">{file.name}</span>
              {loading ? " — loading…" : ` — ${pageCount} pages`}
            </p>
            <button
              onClick={() => {
                setFile(null);
                setThumbnails([]);
                setPageDims([]);
              }}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              Change file
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* ── Left column: controls ── */}
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                  Configure Bates number format and position
                </p>
                {isDirty && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-dark-text-muted dark:hover:text-dark-text transition-colors"
                  >
                    <Undo2 className="w-4 h-4" />
                    Reset
                  </button>
                )}
              </div>

              {/* Prefix & Suffix */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                    Prefix
                  </label>
                  <input
                    type="text"
                    value={options.prefix}
                    onChange={(e) => setOpt("prefix", e.target.value)}
                    placeholder="e.g. CASE-"
                    className="w-full border border-slate-300 dark:border-dark-border rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-dark-surface text-slate-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                    Suffix
                  </label>
                  <input
                    type="text"
                    value={options.suffix}
                    onChange={(e) => setOpt("suffix", e.target.value)}
                    placeholder="Optional"
                    className="w-full border border-slate-300 dark:border-dark-border rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-dark-surface text-slate-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              {/* Start number & Digits */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                    Start number
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={options.startNumber}
                    onChange={(e) => setOpt("startNumber", Math.max(0, Number(e.target.value)))}
                    className="w-full border border-slate-300 dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-white dark:bg-dark-surface text-slate-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                    Digits (zero-padding)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={options.digits}
                    onChange={(e) =>
                      setOpt("digits", Math.min(12, Math.max(1, Number(e.target.value))))
                    }
                    className="w-full border border-slate-300 dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-white dark:bg-dark-surface text-slate-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-xs text-slate-400 dark:text-dark-text-muted mt-1">
                    e.g. 6 → 000001
                  </p>
                </div>
              </div>

              {/* Position grid */}
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-dark-text-muted mb-2">
                  <Move className="w-3.5 h-3.5" />
                  Position
                </p>
                <div className="grid grid-cols-3 gap-2 max-w-45">
                  {POSITIONS.map(({ value, label, title }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setOpt("position", value)}
                      title={title}
                      className={`h-10 rounded-lg text-base font-bold border-2 transition-all duration-150 ${
                        options.position === value
                          ? "border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300"
                          : "border-slate-200 dark:border-dark-border text-slate-400 dark:text-dark-text-muted hover:border-slate-300 dark:hover:border-slate-500 bg-white dark:bg-dark-surface"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Font size */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="bn-font-size"
                      className="text-sm font-medium text-slate-700 dark:text-dark-text"
                    >
                      Font size
                    </label>
                    <span className="inline-flex items-center rounded-full bg-primary-100 dark:bg-primary-900/40 px-2 py-0.5 text-xs font-semibold text-primary-700 dark:text-primary-300 tabular-nums">
                      {options.fontSize}pt
                    </span>
                  </div>
                  <input
                    id="bn-font-size"
                    type="range"
                    min={6}
                    max={18}
                    step={1}
                    value={options.fontSize}
                    onChange={(e) => setOpt("fontSize", Number(e.target.value))}
                    className="w-full accent-primary-600 cursor-pointer"
                  />
                </div>

                {/* Margin */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="bn-margin"
                      className="text-sm font-medium text-slate-700 dark:text-dark-text"
                    >
                      Margin
                    </label>
                    <span className="inline-flex items-center rounded-full bg-primary-100 dark:bg-primary-900/40 px-2 py-0.5 text-xs font-semibold text-primary-700 dark:text-primary-300 tabular-nums">
                      {options.margin}pt
                    </span>
                  </div>
                  <input
                    id="bn-margin"
                    type="range"
                    min={5}
                    max={72}
                    step={1}
                    value={options.margin}
                    onChange={(e) => setOpt("margin", Number(e.target.value))}
                    className="w-full accent-primary-600 cursor-pointer"
                  />
                </div>
              </div>

              {/* Color */}
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text mb-2">
                  Colour
                </p>
                <ColorPicker
                  value={rgbToHex(options.color.r, options.color.g, options.color.b)}
                  onChange={(hex) => {
                    const { r, g, b } = hexToRgb(hex);
                    setOpt("color", { r, g, b });
                  }}
                />
              </div>
            </div>

            {/* ── Right column: live page preview ── */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                  Preview — Page {selectedPage + 1}
                </p>
                {pageCount > 1 && (
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      disabled={selectedPage === 0}
                      onClick={() => setSelectedPage((p) => p - 1)}
                      className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-dark-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-slate-400 dark:text-dark-text-muted tabular-nums px-1">
                      {selectedPage + 1} / {pageCount}
                    </span>
                    <button
                      type="button"
                      disabled={selectedPage === pageCount - 1}
                      onClick={() => setSelectedPage((p) => p + 1)}
                      className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-dark-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {loading ? (
                <div className="aspect-3/4 bg-slate-100 dark:bg-dark-surface-alt rounded-lg flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
                </div>
              ) : thumbnails[selectedPage] ? (
                <div
                  ref={previewContainerRef}
                  className="relative aspect-3/4 bg-white dark:bg-dark-surface rounded-lg border border-slate-200 dark:border-dark-border overflow-hidden"
                >
                  <img
                    src={thumbnails[selectedPage]}
                    alt={`Page ${selectedPage + 1}`}
                    className="w-full h-full object-contain"
                  />
                  <span
                    className="font-mono font-medium leading-none pointer-events-none"
                    style={{
                      ...overlayStyle(options.position, options.margin, pageDims[selectedPage]),
                      color: labelColor,
                      fontSize: displayFontSize,
                    }}
                  >
                    {previewLabel}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <button
            onClick={handleApply}
            disabled={processing || loading}
            className="w-full bg-emerald-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? "Adding Bates numbers…" : "Add Bates Numbers & Download"}
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
