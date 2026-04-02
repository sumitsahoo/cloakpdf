/**
 * Add Bookmarks tool.
 *
 * Lets users build a list of bookmark entries (title + target page) and embed
 * them as a PDF outline. The viewer's bookmarks panel opens automatically
 * because /PageMode is set to UseOutlines. Any existing outline is replaced.
 */

import { useState, useCallback, useEffect } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { addPdfBookmarks } from "../utils/pdf-operations.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";
import { X, Plus } from "lucide-react";

interface BookmarkEntry {
  id: number;
  title: string;
  pageNumber: string; // string for controlled input; parsed to number on save
}

let nextId = 1;

export default function AddBookmarks() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([
    { id: nextId++, title: "", pageNumber: "1" },
  ]);

  const handleFile = useCallback((files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setDone(false);
    setError(null);
    setLoading(true);
  }, []);

  useEffect(() => {
    if (!file || !loading) return;
    let cancelled = false;
    void (async () => {
      try {
        const { PDFDocument } = await import("pdf-lib");
        const buf = await file.arrayBuffer();
        const doc = await PDFDocument.load(buf, { throwOnInvalidObject: false });
        if (!cancelled) setPageCount(doc.getPageCount());
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load PDF.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, loading]);

  const addRow = useCallback(() => {
    setBookmarks((prev) => [...prev, { id: nextId++, title: "", pageNumber: "1" }]);
  }, []);

  const removeRow = useCallback((id: number) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const updateRow = useCallback(
    (id: number, field: keyof Omit<BookmarkEntry, "id">, value: string) => {
      setBookmarks((prev) => prev.map((b) => (b.id === id ? { ...b, [field]: value } : b)));
    },
    [],
  );

  const handleApply = useCallback(async () => {
    if (!file) return;
    const valid = bookmarks.filter((b) => b.title.trim());
    if (valid.length === 0) {
      setError("Add at least one bookmark with a title.");
      return;
    }
    setProcessing(true);
    setError(null);
    setDone(false);
    try {
      const entries = valid.map((b) => ({
        title: b.title.trim(),
        pageIndex: Math.max(0, Math.min(parseInt(b.pageNumber, 10) || 1, pageCount) - 1),
      }));
      const result = await addPdfBookmarks(file, entries);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_bookmarks.pdf`);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add bookmarks. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file, bookmarks, pageCount]);

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Add a clickable bookmark list to navigate the document"
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted">
              <span className="font-medium">{file.name}</span> — {formatFileSize(file.size)}
              {pageCount > 0 && `, ${pageCount} pages`}
            </p>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setPageCount(0);
                setDone(false);
                setBookmarks([{ id: nextId++, title: "", pageNumber: "1" }]);
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
            <div className="space-y-3">
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto] gap-0 divide-y divide-slate-100 dark:divide-dark-border">
                  {/* Header row */}
                  <div className="col-span-3 grid grid-cols-[1fr_auto_auto] px-4 py-2 bg-slate-50 dark:bg-dark-surface-alt">
                    <span className="text-xs font-medium text-slate-500 dark:text-dark-text-muted uppercase tracking-wide">
                      Bookmark title
                    </span>
                    <span className="text-xs font-medium text-slate-500 dark:text-dark-text-muted uppercase tracking-wide w-20 text-center">
                      Page
                    </span>
                    <span className="w-8" />
                  </div>

                  {bookmarks.map((bm, idx) => (
                    <div
                      key={bm.id}
                      className="col-span-3 grid grid-cols-[1fr_auto_auto] items-center gap-2 px-4 py-2"
                    >
                      <input
                        type="text"
                        value={bm.title}
                        placeholder={`Bookmark ${idx + 1}`}
                        onChange={(e) => updateRow(bm.id, "title", e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-200 dark:border-dark-border dark:bg-dark-bg dark:text-dark-text rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                      <input
                        type="number"
                        min={1}
                        max={pageCount || 9999}
                        value={bm.pageNumber}
                        onChange={(e) => updateRow(bm.id, "pageNumber", e.target.value)}
                        className="w-20 px-2 py-1.5 border border-slate-200 dark:border-dark-border dark:bg-dark-bg dark:text-dark-text rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => removeRow(bm.id)}
                        disabled={bookmarks.length === 1}
                        className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 disabled:opacity-30 transition-colors rounded"
                        aria-label="Remove bookmark"
                      >
                        <X className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Add bookmark
              </button>

              <button
                type="button"
                onClick={handleApply}
                disabled={processing || bookmarks.every((b) => !b.title.trim())}
                className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {processing
                  ? "Adding Bookmarks..."
                  : `Add ${bookmarks.filter((b) => b.title.trim()).length} Bookmark${bookmarks.filter((b) => b.title.trim()).length !== 1 ? "s" : ""} & Download`}
              </button>

              {done && (
                <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">
                    Bookmarks added successfully. The PDF has been downloaded.
                  </p>
                </div>
              )}
            </div>
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
