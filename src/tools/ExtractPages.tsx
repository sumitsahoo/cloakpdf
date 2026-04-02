/**
 * Extract Pages tool.
 *
 * Displays page thumbnails in a grid. The user can click individual pages to
 * select them, use Select All / Clear shortcuts, or type a range string
 * (e.g. "1-3, 5, 7-9") to specify pages by number. The selected pages are
 * written to a new PDF and downloaded.
 */

import { useState, useCallback } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import { extractPages } from "../utils/pdf-operations.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";
import { downloadPdf } from "../utils/file-helpers.ts";
import { Check } from "lucide-react";

/** Parse a range string like "1-3, 5, 7-9" into sorted, unique 0-based page indices. */
function parseRangeInput(input: string, pageCount: number): number[] {
  const seen = new Set<number>();
  for (const part of input.split(",").map((s) => s.trim())) {
    const sides = part.split("-").map((s) => Number.parseInt(s.trim(), 10));
    if (sides.length === 2 && !Number.isNaN(sides[0]) && !Number.isNaN(sides[1])) {
      for (let i = sides[0]; i <= sides[1]; i++) {
        if (i >= 1 && i <= pageCount) seen.add(i - 1);
      }
    } else if (sides.length === 1 && !Number.isNaN(sides[0])) {
      const p = sides[0];
      if (p >= 1 && p <= pageCount) seen.add(p - 1);
    }
  }
  return [...seen].sort((a, b) => a - b);
}

export default function ExtractPages() {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [rangeInput, setRangeInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setSelectedPages(new Set());
    setRangeInput("");
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
    if (!file) return;

    // Range input takes priority over thumbnail clicks when filled
    const indices = rangeInput.trim()
      ? parseRangeInput(rangeInput, thumbnails.length)
      : [...selectedPages].sort((a, b) => a - b);

    if (indices.length === 0) return;

    setProcessing(true);
    setError(null);
    try {
      const result = await extractPages(file, indices);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_extracted.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to extract pages. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file, selectedPages, rangeInput, thumbnails.length]);

  const hasSelection = rangeInput.trim().length > 0 || selectedPages.size > 0;

  // Effective selection count shown in the button label
  const effectiveCount = rangeInput.trim()
    ? parseRangeInput(rangeInput, thumbnails.length).length
    : selectedPages.size;

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
              {selectedPages.size > 0 && !rangeInput.trim() && (
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
                  setRangeInput("");
                }}
                className="text-sm text-primary-600 hover:text-primary-700"
              >
                Change file
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="range-input"
              className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5"
            >
              Page range (optional)
            </label>
            <input
              id="range-input"
              type="text"
              value={rangeInput}
              onChange={(e) => setRangeInput(e.target.value)}
              placeholder="e.g., 1-3, 5, 7-9"
              className="w-full px-3 py-2 border border-slate-300 dark:border-dark-border dark:bg-dark-surface dark:text-dark-text rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="text-xs text-slate-400 dark:text-dark-text-muted mt-1">
              Or click pages below to select them
            </p>
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
                          <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                        </div>
                      </div>
                    ) : null
                  }
                />
              ))}
            </div>
          )}

          {hasSelection && effectiveCount > 0 && (
            <button
              onClick={handleExtract}
              disabled={processing}
              className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {processing
                ? "Extracting..."
                : `Extract ${effectiveCount} Page${effectiveCount !== 1 ? "s" : ""} & Download`}
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
