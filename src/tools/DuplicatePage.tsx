/**
 * Duplicate Page tool.
 *
 * Displays all PDF pages as thumbnails. The user selects one page to
 * duplicate, then picks where the copy should be inserted. The resulting
 * PDF is downloaded immediately.
 */

import { useState, useCallback } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import { duplicatePage } from "../utils/pdf-operations.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";

export default function DuplicatePage() {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  // targetPosition: 0-based index at which the copy is inserted.
  const [targetPosition, setTargetPosition] = useState(0);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setSelectedPage(null);
    setError(null);
    setLoading(true);
    try {
      const thumbs = await renderAllThumbnails(pdf);
      setThumbnails(thumbs);
      setTargetPosition(thumbs.length); // default: insert copy at end
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

  const handleDuplicate = useCallback(async () => {
    if (!file || selectedPage === null) return;
    setProcessing(true);
    setError(null);
    try {
      const result = await duplicatePage(file, selectedPage, targetPosition);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_duplicated.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to duplicate page. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file, selectedPage, targetPosition]);

  const insertLabel = targetPosition === 0 ? "At the beginning" : `After page ${targetPosition}`;

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Click a page to select it, then choose where to place the copy"
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
                setSelectedPage(null);
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
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text mb-2">
                  {selectedPage === null
                    ? "Click a page to select it for duplication"
                    : `Page ${selectedPage + 1} selected — choose where to insert the copy`}
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {thumbnails.map((thumb, i) => (
                    <PageThumbnail
                      key={i}
                      src={thumb}
                      pageNumber={i + 1}
                      selected={selectedPage === i}
                      onClick={() => setSelectedPage(i === selectedPage ? null : i)}
                      overlay={
                        selectedPage === i ? (
                          <div className="bg-primary-600/70 inset-0 absolute flex items-center justify-center">
                            <svg
                              className="w-7 h-7 text-white"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            </svg>
                          </div>
                        ) : null
                      }
                    />
                  ))}
                </div>
              </div>

              {selectedPage !== null && (
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label className="text-sm font-medium text-slate-700 dark:text-dark-text">
                        Insert copy
                      </label>
                      <span className="text-sm text-primary-600 font-medium">{insertLabel}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={thumbnails.length}
                      step={1}
                      value={targetPosition}
                      onChange={(e) => setTargetPosition(Number(e.target.value))}
                      className="w-full accent-primary-600"
                    />
                    <div className="flex justify-between text-xs text-slate-400 dark:text-dark-text-muted mt-0.5">
                      <span>Beginning</span>
                      <span>End</span>
                    </div>
                  </div>

                  <button
                    onClick={handleDuplicate}
                    disabled={processing}
                    className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {processing ? "Duplicating…" : `Duplicate Page ${selectedPage + 1} & Download`}
                  </button>
                </div>
              )}
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
