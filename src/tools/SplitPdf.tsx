/**
 * Split PDF tool.
 *
 * Displays all pages as selectable thumbnails. The user can click individual
 * pages to select them or enter a range string (e.g. "1-3, 5, 7-9") to
 * specify which pages to extract. The selected pages are written to a new
 * PDF and downloaded.
 */

import { useState, useCallback } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import { splitPdf } from "../utils/pdf-operations.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";
import { downloadPdf } from "../utils/file-helpers.ts";

export default function SplitPdf() {
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

  const handleSplit = useCallback(async () => {
    if (!file) return;

    let pages: number[] = [];

    if (rangeInput.trim()) {
      // Parse range input like "1-3, 5, 7-9"
      const parts = rangeInput.split(",").map((s) => s.trim());
      for (const part of parts) {
        const rangeParts = part.split("-").map((s) => Number.parseInt(s.trim(), 10));
        if (
          rangeParts.length === 2 &&
          !Number.isNaN(rangeParts[0]) &&
          !Number.isNaN(rangeParts[1])
        ) {
          for (let i = rangeParts[0]; i <= rangeParts[1]; i++) pages.push(i);
        } else if (rangeParts.length === 1 && !Number.isNaN(rangeParts[0])) {
          pages.push(rangeParts[0]);
        }
      }
    } else {
      pages = Array.from(selectedPages).map((i) => i + 1);
    }

    if (pages.length === 0) return;

    setProcessing(true);
    setError(null);
    try {
      const ranges = pages.map((p) => ({ start: p, end: p }));
      const result = await splitPdf(file, ranges);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_extracted.pdf`);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to split PDF. Please check your file and try again.",
      );
    } finally {
      setProcessing(false);
    }
  }, [file, selectedPages, rangeInput]);

  const hasSelection = selectedPages.size > 0 || rangeInput.trim().length > 0;

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Select pages to extract from the document"
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
                setSelectedPages(new Set());
              }}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              Change file
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5">
              Page range (optional)
            </label>
            <input
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
                />
              ))}
            </div>
          )}

          {hasSelection && (
            <button
              onClick={handleSplit}
              disabled={processing}
              className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {processing ? "Extracting..." : "Extract Selected Pages"}
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
