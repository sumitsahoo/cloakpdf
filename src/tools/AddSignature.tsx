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

import { useState, useCallback } from "react";
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

      const result = await addSignature(file, signatureDataUrl, selectedPage, {
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
  }, [file, signatureDataUrl, selectedPage, position, sigSize]);

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

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                  Position on Page
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 dark:text-dark-text-muted">
                      Horizontal: {position.xPercent}%
                    </label>
                    <input
                      type="range"
                      min={5}
                      max={95}
                      value={position.xPercent}
                      onChange={(e) =>
                        setPosition((p) => ({ ...p, xPercent: Number(e.target.value) }))
                      }
                      className="w-full accent-primary-600"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 dark:text-dark-text-muted">
                      Vertical: {position.yPercent}%
                    </label>
                    <input
                      type="range"
                      min={5}
                      max={95}
                      value={position.yPercent}
                      onChange={(e) =>
                        setPosition((p) => ({ ...p, yPercent: Number(e.target.value) }))
                      }
                      className="w-full accent-primary-600"
                    />
                  </div>
                </div>
              </div>

              {thumbnails.length > 1 && (
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

            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
                Preview — Page {selectedPage + 1}
              </p>
              {loading ? (
                <div className="aspect-3/4 bg-slate-100 dark:bg-dark-surface-alt rounded-lg flex items-center justify-center">
                  <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                </div>
              ) : thumbnails[selectedPage] ? (
                <div className="relative aspect-3/4 bg-white dark:bg-dark-surface rounded-lg border border-slate-200 dark:border-dark-border overflow-hidden">
                  <img
                    src={thumbnails[selectedPage]}
                    alt={`Page ${selectedPage + 1}`}
                    className="w-full h-full object-contain"
                  />
                  {signatureDataUrl && (
                    <div
                      className="absolute pointer-events-none border-2 border-dashed border-primary-400 rounded"
                      style={{
                        left: `${position.xPercent}%`,
                        bottom: `${position.yPercent}%`,
                        transform: "translate(-50%, 50%)",
                        width: `${Math.min(sigSize.width * 0.3, 150)}px`,
                        height: `${Math.min(sigSize.height * 0.3, 60)}px`,
                      }}
                    >
                      <img
                        src={signatureDataUrl}
                        alt="Signature"
                        className="w-full h-full object-contain"
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
