/**
 * Add Signature tool.
 *
 * Combines the SignaturePad canvas component with page selection, position
 * controls, and size sliders. The user draws a signature, chooses a page,
 * adjusts placement via percentage-based sliders, and the signature is
 * embedded into the PDF at the calculated coordinates.
 *
 * Position is specified as percentages of the page dimensions to decouple
 * the preview from the actual PDF point-based coordinate system. The
 * conversion to absolute PDF points happens at apply-time by loading the
 * document and reading the target page’s dimensions.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { SignaturePad } from "../components/SignaturePad.tsx";
import { addSignature } from "../utils/pdf-operations.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";
import { downloadPdf } from "../utils/file-helpers.ts";

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

  const previewRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, startX: 0, startY: 0, startXPct: 0, startYPct: 0 });

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
      // Inverted because CSS bottom is used
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

      // Read actual page dimensions for accurate preview sizing
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

  const handleApply = useCallback(async () => {
    if (!file || !signatureDataUrl) return;
    setProcessing(true);
    setError(null);
    try {
      // Get actual page dimensions to calculate position
      const arrayBuffer = await file.arrayBuffer();
      const { PDFDocument } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const page = pdfDoc.getPage(selectedPage);
      const { width: pageWidth, height: pageHeight } = page.getSize();

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
              }}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              Change file
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-2">
                  Draw Your Signature
                </label>
                <SignaturePad onSignature={setSignatureDataUrl} />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                  Signature Size
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 dark:text-dark-text-muted">
                      Width: {sigSize.width}px
                    </label>
                    <input
                      type="range"
                      min={50}
                      max={400}
                      value={sigSize.width}
                      onChange={(e) => setSigSize((s) => ({ ...s, width: Number(e.target.value) }))}
                      className="w-full accent-primary-600"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 dark:text-dark-text-muted">
                      Height: {sigSize.height}px
                    </label>
                    <input
                      type="range"
                      min={20}
                      max={200}
                      value={sigSize.height}
                      onChange={(e) =>
                        setSigSize((s) => ({ ...s, height: Number(e.target.value) }))
                      }
                      className="w-full accent-primary-600"
                    />
                  </div>
                </div>
              </div>

              {signatureDataUrl && (
                <div className="flex items-start gap-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 px-3 py-2.5">
                  <svg
                    className="w-4 h-4 mt-0.5 text-primary-500 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7 11.5V14m0 0v2.5m0-2.5h2.5M7 14H4.5m11-4L12 6.5m0 0L8.5 10M12 6.5V17"
                    />
                  </svg>
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
