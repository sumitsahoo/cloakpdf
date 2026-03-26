/**
 * Add Blank Page tool.
 *
 * Loads a PDF and displays its pages as thumbnails. The user picks an
 * insertion position (before any existing page, or at the end) and a
 * new blank page matching the adjacent page's dimensions is inserted.
 */

import { useState, useCallback } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import { addBlankPage } from "../utils/pdf-operations.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";

export default function AddBlankPage() {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  // insertPosition is the 0-based index at which the blank page will be inserted.
  // 0 = before page 1, thumbnails.length = after the last page.
  const [insertPosition, setInsertPosition] = useState(0);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setError(null);
    setLoading(true);
    try {
      const thumbs = await renderAllThumbnails(pdf);
      setThumbnails(thumbs);
      setInsertPosition(thumbs.length); // default: append at end
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

  const handleInsert = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    try {
      const result = await addBlankPage(file, insertPosition);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_blank_added.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to insert blank page. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file, insertPosition]);

  const positionLabel =
    insertPosition === 0
      ? "Before page 1 (at the beginning)"
      : insertPosition === thumbnails.length
        ? `After page ${thumbnails.length} (at the end)`
        : `Before page ${insertPosition + 1}`;

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="A blank page will be inserted at your chosen position"
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted">
              <span className="font-medium">{file.name}</span> — {formatFileSize(file.size)}
            </p>
            <button
              onClick={() => {
                setFile(null);
                setThumbnails([]);
              }}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              Change file
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-2">
                  Insertion position
                </label>
                <input
                  type="range"
                  min={0}
                  max={thumbnails.length}
                  step={1}
                  value={insertPosition}
                  onChange={(e) => setInsertPosition(Number(e.target.value))}
                  className="w-full accent-primary-600"
                />
                <p className="text-sm text-primary-600 font-medium mt-1">{positionLabel}</p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                  Page order preview
                </p>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {/* Render pages with an insertion indicator */}
                  {[...Array(thumbnails.length + 1)].map((_, i) => {
                    if (i === insertPosition) {
                      return (
                        <div
                          key={`blank-${i}`}
                          className="flex-shrink-0 flex flex-col items-center gap-1"
                        >
                          <div className="w-16 aspect-[3/4] rounded-lg border-2 border-dashed border-primary-400 bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
                            <span className="text-primary-500 text-xl font-light">+</span>
                          </div>
                          <span className="text-xs text-primary-500 font-medium">New</span>
                        </div>
                      );
                    }
                    const thumbIdx = i > insertPosition ? i - 1 : i;
                    return (
                      <div
                        key={`page-${thumbIdx}`}
                        className="flex-shrink-0 flex flex-col items-center gap-1"
                      >
                        <img
                          src={thumbnails[thumbIdx]}
                          className="w-16 aspect-[3/4] object-cover rounded-lg border border-slate-200 dark:border-dark-border"
                          alt={`Page ${thumbIdx + 1}`}
                        />
                        <span className="text-xs text-slate-400 dark:text-dark-text-muted">
                          {thumbIdx + 1}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Page grid for context */}
              <div>
                <p className="text-sm text-slate-500 dark:text-dark-text-muted mb-2">
                  Current pages ({thumbnails.length})
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                  {thumbnails.map((thumb, i) => (
                    <PageThumbnail key={i} src={thumb} pageNumber={i + 1} />
                  ))}
                </div>
              </div>

              <button
                onClick={handleInsert}
                disabled={processing}
                className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {processing ? "Inserting…" : "Insert Blank Page & Download"}
              </button>
            </>
          )}
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
