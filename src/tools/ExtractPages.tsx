/**
 * Extract Pages tool.
 *
 * Displays page thumbnails in a grid. The user checks the pages they want to
 * keep and downloads a new PDF containing only those pages in the order selected.
 */

import { useState, useCallback } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import { extractPages } from "../utils/pdf-operations.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";
import { downloadPdf } from "../utils/file-helpers.ts";

export default function ExtractPages() {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setSelectedPages(new Set());
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

  const togglePage = useCallback((pageIndex: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageIndex)) next.delete(pageIndex);
      else next.add(pageIndex);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedPages(new Set(thumbnails.map((_, i) => i)));
  }, [thumbnails]);

  const clearAll = useCallback(() => {
    setSelectedPages(new Set());
  }, []);

  const handleExtract = useCallback(async () => {
    if (!file || selectedPages.size === 0) return;
    setProcessing(true);
    setError(null);
    try {
      const indices = [...selectedPages].sort((a, b) => a - b);
      const result = await extractPages(file, indices);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_extracted.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to extract pages. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file, selectedPages]);

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Select pages to keep and download as a new PDF"
        />
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted">
              <span className="font-medium">{file.name}</span> — {thumbnails.length} pages
              {selectedPages.size > 0 && (
                <span className="text-primary-600 dark:text-primary-400 ml-2">
                  ({selectedPages.size} selected)
                </span>
              )}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={selectAll}
                className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                Select all
              </button>
              <button
                onClick={clearAll}
                className="text-sm text-slate-500 hover:text-slate-700 dark:text-dark-text-muted"
              >
                Clear
              </button>
              <button
                onClick={() => {
                  setFile(null);
                  setThumbnails([]);
                  setSelectedPages(new Set());
                }}
                className="text-sm text-primary-600 hover:text-primary-700"
              >
                Change file
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {thumbnails.map((thumb, i) => (
                <PageThumbnail
                  key={i}
                  src={thumb}
                  pageNumber={i + 1}
                  selected={selectedPages.has(i)}
                  onClick={() => togglePage(i)}
                  overlay={
                    selectedPages.has(i) ? (
                      <div className="bg-primary-600/20 inset-0 absolute flex items-center justify-center">
                        <div className="w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center shadow">
                          <svg
                            className="w-3.5 h-3.5 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
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
              ))}
            </div>
          )}

          {selectedPages.size > 0 && (
            <button
              onClick={handleExtract}
              disabled={processing}
              className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {processing
                ? "Extracting..."
                : `Extract ${selectedPages.size} Page${selectedPages.size > 1 ? "s" : ""} & Download`}
            </button>
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
