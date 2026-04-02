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

import { useState, useCallback, useRef, useEffect } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { SignaturePad } from "../components/SignaturePad.tsx";
import { ColorPicker, hexToRgb } from "../components/ColorPicker.tsx";
import { addSignature } from "../utils/pdf-operations.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";
import { downloadPdf } from "../utils/file-helpers.ts";
import { PenLine, Upload, Move, Maximize2 } from "lucide-react";

type SignatureMode = "draw" | "upload";

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5 MB

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
  const [file, setFile] = useState<File | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [selectedPage, setSelectedPage] = useState(0);
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState({ xPercent: 50, yPercent: 15 });
  const [sigSize, setSigSize] = useState({ width: 200, height: 80 });
  const [pageDims, setPageDims] = useState<{ width: number; height: number }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [applyToAllPages, setApplyToAllPages] = useState(false);

  // Centralised colour (drives both SignaturePad ink & image tint)
  const [color, setColor] = useState("#1e293b");

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
        startXPct: position.xPercent,
        startYPct: position.yPercent,
      };
      setIsDragging(true);
    },
    [position],
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
      setPosition({ xPercent: Math.round(newX), yPercent: Math.round(newY) });
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
  }, []);

  /* ---- file handlers ---- */
  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setSelectedPage(0);
    setLoading(true);
    setError(null);
    try {
      const thumbs = await renderAllThumbnails(pdf);
      setThumbnails(thumbs);

      const arrayBuffer = await pdf.arrayBuffer();
      const { PDFDocument } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const dims = pdfDoc.getPages().map((p) => p.getSize());
      setPageDims(dims);
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

  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const imgFile = e.target.files?.[0];
      if (!imgFile) return;
      if (imgFile.size > MAX_UPLOAD_SIZE) {
        setError("Image must be under 5 MB.");
        return;
      }
      setError(null);
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
    [tintEnabled],
  );

  /** Convert the percentage-based preview position to PDF points and embed the signature. */
  const handleApply = useCallback(async () => {
    if (!file || !signatureDataUrl) return;
    setProcessing(true);
    setError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const { PDFDocument } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const page = pdfDoc.getPage(selectedPage);
      const { width: pageWidth, height: pageHeight } = page.getSize();

      // Convert centre-based percentage position to bottom-left origin PDF coords
      const x = (position.xPercent / 100) * pageWidth - sigSize.width / 2;
      const y = (position.yPercent / 100) * pageHeight - sigSize.height / 2;

      const pageIndices = applyToAllPages
        ? Array.from({ length: pdfDoc.getPageCount() }, (_, i) => i)
        : [selectedPage];

      const result = await addSignature(file, signatureDataUrl, pageIndices, {
        x: Math.max(0, x),
        y: Math.max(0, y),
        width: sigSize.width,
        height: sigSize.height,
      });

      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_signed.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add signature. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file, signatureDataUrl, selectedPage, position, sigSize, applyToAllPages]);

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Draw or upload your signature, then place it on a page"
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted">
              <span className="font-medium">{file.name}</span> — {thumbnails.length} pages
            </p>
            <button
              onClick={() => {
                setFile(null);
                setThumbnails([]);
                setSignatureDataUrl("");
                setUploadedImageUrl("");
              }}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              Change file
            </button>
          </div>

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
                      <div className="w-24 h-12 rounded-md border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface flex items-center justify-center overflow-hidden">
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
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600 dark:text-dark-text-muted">
                        Width
                      </span>
                      <span className="inline-flex items-center rounded-full bg-primary-100 dark:bg-primary-900/40 px-2 py-0.5 text-xs font-semibold text-primary-700 dark:text-primary-300 tabular-nums">
                        {sigSize.width}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={400}
                      value={sigSize.width}
                      onChange={(e) => setSigSize((s) => ({ ...s, width: Number(e.target.value) }))}
                      className="w-full accent-primary-600 cursor-pointer"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600 dark:text-dark-text-muted">
                        Height
                      </span>
                      <span className="inline-flex items-center rounded-full bg-primary-100 dark:bg-primary-900/40 px-2 py-0.5 text-xs font-semibold text-primary-700 dark:text-primary-300 tabular-nums">
                        {sigSize.height}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={20}
                      max={200}
                      value={sigSize.height}
                      onChange={(e) =>
                        setSigSize((s) => ({ ...s, height: Number(e.target.value) }))
                      }
                      className="w-full accent-primary-600 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {signatureDataUrl && (
                <div className="flex items-start gap-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 px-3 py-2.5">
                  <Move className="w-4 h-4 mt-0.5 text-primary-500 shrink-0" />
                  <p className="text-xs text-primary-700 dark:text-primary-300 leading-relaxed">
                    Drag the signature on the preview to reposition it
                  </p>
                </div>
              )}

              {thumbnails.length > 1 && (
                <div className="space-y-3">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={applyToAllPages}
                      onChange={(e) => setApplyToAllPages(e.target.checked)}
                      className="accent-primary-600 w-4 h-4 rounded"
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-dark-text">
                      Apply to all pages at same position
                    </span>
                  </label>

                  {!applyToAllPages && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                        Select Page ({selectedPage + 1} of {thumbnails.length})
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={thumbnails.length - 1}
                        value={selectedPage}
                        onChange={(e) => setSelectedPage(Number(e.target.value))}
                        className="w-full accent-primary-600"
                      />
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
                <div className="aspect-3/4 bg-slate-100 dark:bg-dark-surface-alt rounded-lg flex items-center justify-center">
                  <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                </div>
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
                        left: `${position.xPercent}%`,
                        bottom: `${position.yPercent}%`,
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

          <button
            onClick={handleApply}
            disabled={processing || !signatureDataUrl}
            className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? "Applying..." : "Apply Signature & Download"}
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
