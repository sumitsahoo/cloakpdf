/**
 * Add Signature tool.
 *
 * Supports two modes:
 * 1. **Draw** — Freehand drawing via the SignaturePad canvas component.
 * 2. **Upload** — Upload a custom image (PNG/JPEG) with optional colour tint.
 *
 * Both modes share a single colour picker, position drag-and-drop, size
 * sliders, and page selection controls. The signature is embedded into the
 * PDF at the user-specified coordinates.
 */

import { Check, CheckSquare, Maximize2, Move, PenLine, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { ColorPicker, hexToRgb } from "../components/ColorPicker.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { LabeledSlider } from "../components/LabeledSlider.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import { SignaturePad } from "../components/SignaturePad.tsx";
import { categoryAccent, categoryGlow, colorPresets } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { usePdfFile } from "../hooks/usePdfFile.ts";
import { downloadPdf, pdfFilename } from "../utils/file-helpers.ts";
import { addSignature } from "../utils/pdf-operations.ts";
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

type SignatureMode = "draw" | "upload";

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5 MB
const DEFAULT_POSITION = { xPercent: 50, yPercent: 15 };

/**
 * Apply a colour tint to an image data-URL.
 *
 * - Transparent PNGs: replaces the RGB of every non-transparent pixel.
 * - Opaque images (JPEG): derives alpha from luminance so that dark areas
 *   become the tint colour and white becomes transparent.
 */
function tintImage(dataUrl: string, hex: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data } = imageData;
      const { r, g, b } = hexToRgb(hex);

      // Detect whether the image has meaningful transparency
      let hasAlpha = false;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 250) {
          hasAlpha = true;
          break;
        }
      }

      for (let i = 0; i < data.length; i += 4) {
        if (hasAlpha) {
          if (data[i + 3] > 0) {
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
          }
        } else {
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = Math.round(255 - lum);
        }
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.src = dataUrl;
  });
}

export default function AddSignature() {
  const [selectedPage, setSelectedPage] = useState(0);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [position, setPosition] = useState(DEFAULT_POSITION);
  const [pagePositions, setPagePositions] = useState<
    Record<number, { xPercent: number; yPercent: number }>
  >({});
  const [sigSize, setSigSize] = useState({ width: 200, height: 80 });

  const pdf = usePdfFile<LoadedPdf>({
    load: loadPdfWithDims,
    onReset: (data) => {
      revokeThumbnails(data?.thumbnails ?? []);
      setSelectedPage(0);
      setSelectedPages(new Set());
      setSignatureDataUrl("");
      setPagePositions({});
    },
  });
  const task = useAsyncProcess();

  const thumbnails = pdf.data?.thumbnails ?? [];
  const pageDims = pdf.data?.pageDims ?? [];
  const loading = pdf.loading;
  const processing = task.processing;
  const error = pdf.loadError ?? task.error;
  const [isDragging, setIsDragging] = useState(false);
  const [applyToAllPages, setApplyToAllPages] = useState(false);

  // Centralised colour (drives both SignaturePad ink & image tint)
  const [color, setColor] = useState<string>(colorPresets[0].hex);

  // Upload-related state
  const [mode, setMode] = useState<SignatureMode>("draw");
  const [uploadedImageUrl, setUploadedImageUrl] = useState("");
  const [tintEnabled, setTintEnabled] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const previewRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, startX: 0, startY: 0, startXPct: 0, startYPct: 0 });

  /* ---- tint uploaded image whenever colour or toggle changes ---- */
  useEffect(() => {
    if (mode !== "upload" || !uploadedImageUrl) return;
    if (!tintEnabled) {
      setSignatureDataUrl(uploadedImageUrl);
      return;
    }
    let cancelled = false;
    void tintImage(uploadedImageUrl, color).then((url) => {
      if (!cancelled) setSignatureDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, uploadedImageUrl, tintEnabled, color]);

  // Derive current position: per-page when not applying to all, shared otherwise
  const currentPosition = applyToAllPages
    ? position
    : (pagePositions[selectedPage] ?? DEFAULT_POSITION);

  const setCurrentPosition = useCallback(
    (pos: { xPercent: number; yPercent: number }) => {
      if (applyToAllPages) {
        setPosition(pos);
      } else {
        setPagePositions((prev) => ({ ...prev, [selectedPage]: pos }));
      }
    },
    [applyToAllPages, selectedPage],
  );

  /* ---- drag-and-drop positioning ---- */
  const handleDragStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      dragRef.current = {
        active: true,
        startX: clientX,
        startY: clientY,
        startXPct: currentPosition.xPercent,
        startYPct: currentPosition.yPercent,
      };
      setIsDragging(true);
    },
    [currentPosition],
  );

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!dragRef.current.active || !previewRef.current) return;
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      const rect = previewRef.current.getBoundingClientRect();
      const dx = ((clientX - dragRef.current.startX) / rect.width) * 100;
      // dy is inverted: CSS bottom increases upward, but mouse Y increases downward
      const dy = ((dragRef.current.startY - clientY) / rect.height) * 100;
      const newX = Math.max(2, Math.min(98, dragRef.current.startXPct + dx));
      const newY = Math.max(2, Math.min(98, dragRef.current.startYPct + dy));
      setCurrentPosition({ xPercent: Math.round(newX), yPercent: Math.round(newY) });
    };

    const handleUp = () => {
      dragRef.current.active = false;
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleMove);
    window.addEventListener("touchend", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
    };
  }, [setCurrentPosition]);

  /* ---- page toggle for multi-select ---- */
  const togglePage = useCallback((index: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
    setSelectedPage(index);
  }, []);

  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const imgFile = e.target.files?.[0];
      if (!imgFile) return;
      if (imgFile.size > MAX_UPLOAD_SIZE) {
        task.setError("Image must be under 5 MB.");
        return;
      }
      task.setError(null);
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setUploadedImageUrl(dataUrl);
        if (!tintEnabled) {
          setSignatureDataUrl(dataUrl);
        }
      };
      reader.readAsDataURL(imgFile);
    },
    [tintEnabled, task],
  );

  /** Convert the percentage-based preview position to PDF points and embed the signature. */
  const handleApply = useCallback(async () => {
    if (!pdf.file || !signatureDataUrl) return;
    const file = pdf.file;
    await task.run(async () => {
      const arrayBuffer = await file.arrayBuffer();
      const { PDFDocument } = await import("@pdfme/pdf-lib");
      const pdfDoc = await PDFDocument.load(arrayBuffer);

      const pageIndices = applyToAllPages
        ? Array.from({ length: pdfDoc.getPageCount() }, (_, i) => i)
        : [...selectedPages].sort((a, b) => a - b);

      if (applyToAllPages) {
        // Single shared position
        const page = pdfDoc.getPage(0);
        const { width: pageWidth, height: pageHeight } = page.getSize();
        const x = (position.xPercent / 100) * pageWidth - sigSize.width / 2;
        const y = (position.yPercent / 100) * pageHeight - sigSize.height / 2;

        const result = await addSignature(file, signatureDataUrl, pageIndices, {
          x: Math.max(0, x),
          y: Math.max(0, y),
          width: sigSize.width,
          height: sigSize.height,
        });
        downloadPdf(result, pdfFilename(file, "_signed"));
      } else {
        // Per-page positions
        const positionMap = new Map<
          number,
          { x: number; y: number; width: number; height: number }
        >();
        for (const idx of pageIndices) {
          const page = pdfDoc.getPage(idx);
          const { width: pageWidth, height: pageHeight } = page.getSize();
          const pos = pagePositions[idx] ?? DEFAULT_POSITION;
          const x = (pos.xPercent / 100) * pageWidth - sigSize.width / 2;
          const y = (pos.yPercent / 100) * pageHeight - sigSize.height / 2;
          positionMap.set(idx, {
            x: Math.max(0, x),
            y: Math.max(0, y),
            width: sigSize.width,
            height: sigSize.height,
          });
        }

        const result = await addSignature(file, signatureDataUrl, pageIndices, positionMap);
        downloadPdf(result, pdfFilename(file, "_signed"));
      }
    }, "Failed to add signature. Please try again.");
  }, [
    pdf.file,
    signatureDataUrl,
    position,
    sigSize,
    applyToAllPages,
    selectedPages,
    pagePositions,
    task,
  ]);

  return (
    <div className="space-y-6">
      {!pdf.file ? (
        <FileDropZone
          glowColor={categoryGlow.annotate}
          iconColor={categoryAccent.annotate}
          accept=".pdf,application/pdf"
          onFiles={pdf.onFiles}
          label="Drop a PDF file here"
          hint="Draw or upload your signature, then place it on a page"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={pdf.file.name}
            details={`${thumbnails.length} pages`}
            onChangeFile={() => {
              setUploadedImageUrl("");
              pdf.reset();
            }}
          />

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-dark-text-muted">
                Create your signature below — you can{" "}
                <span className="font-semibold text-slate-800 dark:text-dark-text">draw</span> it
                freehand or{" "}
                <span className="font-semibold text-slate-800 dark:text-dark-text">upload</span> a
                custom image (PNG/JPEG).
              </p>
              {/* ---- Mode toggle ---- */}
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-dark-border p-0.5 bg-slate-100 dark:bg-dark-surface-alt">
                <button
                  onClick={() => {
                    setMode("draw");
                    setSignatureDataUrl("");
                  }}
                  className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    mode === "draw"
                      ? "bg-white dark:bg-dark-surface text-slate-900 dark:text-dark-text shadow-sm"
                      : "text-slate-500 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text"
                  }`}
                >
                  <PenLine className="w-3.5 h-3.5" />
                  Draw
                </button>
                <button
                  onClick={() => {
                    setMode("upload");
                    setSignatureDataUrl(uploadedImageUrl);
                  }}
                  className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    mode === "upload"
                      ? "bg-white dark:bg-dark-surface text-slate-900 dark:text-dark-text shadow-sm"
                      : "text-slate-500 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text"
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload
                </button>
              </div>

              {/* ---- Draw mode ---- */}
              {mode === "draw" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-2">
                    Draw Your Signature
                  </label>
                  <SignaturePad onSignature={setSignatureDataUrl} color={color} />
                </div>
              )}

              {/* ---- Upload mode ---- */}
              {mode === "upload" && (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1">
                    Upload Signature Image
                  </label>

                  {/* Hidden file input */}
                  <input
                    ref={uploadInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                    onChange={handleImageUpload}
                    className="hidden"
                  />

                  {!uploadedImageUrl ? (
                    <button
                      onClick={() => uploadInputRef.current?.click()}
                      className="w-full flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-slate-300 dark:border-dark-border rounded-xl text-slate-500 dark:text-dark-text-muted hover:border-primary-400 hover:text-primary-600 transition-colors"
                    >
                      <Upload className="w-8 h-8" strokeWidth={1.5} />
                      <span className="text-sm font-medium">Click to upload PNG or JPEG</span>
                      <span className="text-xs text-slate-400 dark:text-dark-text-muted">
                        Max 5 MB — transparent PNG recommended
                      </span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-12 rounded-md border border-slate-200 dark:border-dark-border bg-white flex items-center justify-center overflow-hidden">
                        <img
                          src={signatureDataUrl || uploadedImageUrl}
                          alt="Uploaded signature"
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                      <button
                        onClick={() => {
                          setUploadedImageUrl("");
                          setSignatureDataUrl("");
                          if (uploadInputRef.current) uploadInputRef.current.value = "";
                        }}
                        className="text-xs text-slate-500 hover:text-red-500 transition-colors"
                      >
                        Remove
                      </button>
                      <button
                        onClick={() => uploadInputRef.current?.click()}
                        className="text-xs text-primary-600 hover:text-primary-700 transition-colors"
                      >
                        Change
                      </button>
                    </div>
                  )}

                  {uploadedImageUrl && (
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={tintEnabled}
                        onChange={(e) => setTintEnabled(e.target.checked)}
                        className="accent-primary-600 w-4 h-4 rounded"
                      />
                      <span className="text-sm text-slate-700 dark:text-dark-text">
                        Tint with selected colour
                      </span>
                    </label>
                  )}
                </div>
              )}

              {/* ---- Shared colour picker ---- */}
              {(mode === "draw" || (mode === "upload" && tintEnabled)) && (
                <ColorPicker value={color} onChange={setColor} />
              )}

              {/* ---- Signature Size ---- */}
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border shadow-sm p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-dark-text-muted flex items-center gap-1.5">
                  <Maximize2 className="w-3.5 h-3.5" />
                  Signature Size
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <LabeledSlider
                    label="Width"
                    value={sigSize.width}
                    min={50}
                    max={400}
                    unit="px"
                    onChange={(v) => setSigSize((s) => ({ ...s, width: v }))}
                  />
                  <LabeledSlider
                    label="Height"
                    value={sigSize.height}
                    min={20}
                    max={200}
                    unit="px"
                    onChange={(v) => setSigSize((s) => ({ ...s, height: v }))}
                  />
                </div>
              </div>

              {signatureDataUrl && (
                <div className="flex items-start gap-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 px-3 py-2.5">
                  <Move className="w-4 h-4 mt-0.5 text-primary-500 shrink-0" />
                  <p className="text-xs text-primary-700 dark:text-primary-300 leading-relaxed">
                    Drag the signature on the preview to reposition it.
                    {thumbnails.length > 1 &&
                      !applyToAllPages &&
                      " Each page remembers its own position — select a page and drag to adjust."}
                  </p>
                </div>
              )}

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
                      Apply to all pages at same position
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
                            className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 transition-colors"
                          >
                            <CheckSquare className="w-4 h-4" />
                            Select all
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedPages(new Set())}
                            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-dark-text-muted dark:hover:text-dark-text transition-colors"
                          >
                            <X className="w-4 h-4" />
                            Clear
                          </button>
                        </div>
                      </div>
                      {loading ? (
                        <LoadingSpinner
                          color="border-emerald-200 border-t-emerald-600"
                          size="sm"
                          className="flex items-center justify-center py-8"
                        />
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {thumbnails.map((thumb, i) => (
                            <PageThumbnail
                              key={i + 1}
                              src={thumb}
                              pageNumber={i + 1}
                              selected={selectedPages.has(i)}
                              onClick={() => togglePage(i)}
                              overlay={
                                selectedPages.has(i) ? (
                                  <div className="bg-emerald-600/20 inset-0 absolute flex items-center justify-center">
                                    <div className="w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center shadow">
                                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                                    </div>
                                  </div>
                                ) : null
                              }
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                Preview — {applyToAllPages ? "All Pages" : `Page ${selectedPage + 1}`}
              </p>
              {loading ? (
                <LoadingSpinner
                  color="border-emerald-200 border-t-emerald-600"
                  className="aspect-3/4 bg-slate-100 dark:bg-dark-surface-alt rounded-lg flex items-center justify-center"
                />
              ) : thumbnails[selectedPage] ? (
                <div
                  ref={previewRef}
                  className="relative aspect-3/4 bg-white dark:bg-dark-surface rounded-lg border border-slate-200 dark:border-dark-border overflow-hidden"
                >
                  <img
                    src={thumbnails[selectedPage]}
                    alt={`Page ${selectedPage + 1}`}
                    className="w-full h-full object-contain"
                  />
                  {signatureDataUrl && (
                    <div
                      className="absolute border-2 border-dashed border-primary-400 rounded select-none touch-none"
                      style={{
                        left: `${currentPosition.xPercent}%`,
                        bottom: `${currentPosition.yPercent}%`,
                        transform: "translate(-50%, 50%)",
                        cursor: isDragging ? "grabbing" : "grab",
                        width: pageDims[selectedPage]
                          ? `${(sigSize.width / pageDims[selectedPage].width) * 100}%`
                          : `${sigSize.width * 0.3}px`,
                        height: pageDims[selectedPage]
                          ? `${(sigSize.height / pageDims[selectedPage].height) * 100}%`
                          : `${sigSize.height * 0.3}px`,
                      }}
                      onMouseDown={handleDragStart}
                      onTouchStart={handleDragStart}
                    >
                      <img
                        src={signatureDataUrl}
                        alt="Signature"
                        className="w-full h-full object-contain pointer-events-none"
                      />
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <ActionButton
            onClick={handleApply}
            processing={processing}
            disabled={
              processing ||
              !signatureDataUrl ||
              (!applyToAllPages && thumbnails.length > 1 && selectedPages.size === 0)
            }
            label="Apply Signature & Download"
            processingLabel="Applying..."
            color="bg-emerald-600 hover:bg-emerald-700"
          />
        </>
      )}

      {error && <AlertBox message={error} />}
    </div>
  );
}
