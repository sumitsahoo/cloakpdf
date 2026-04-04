/**
 * Delete Pages tool.
 *
 * Displays page thumbnails in a grid. Clicking a page toggles it for deletion
 * (shown with a red overlay). The user cannot delete all pages — at least one
 * must remain. On confirmation, a new PDF is created with the remaining pages.
 */

import { useCallback, useState } from "react";
import { Trash2, Undo2 } from "lucide-react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import { downloadPdf } from "../utils/file-helpers.ts";
import { deletePages } from "../utils/pdf-operations.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";

export default function DeletePages() {
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

  /** Toggle a page's selection state for deletion. */
  const togglePage = useCallback((pageIndex: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageIndex)) next.delete(pageIndex);
      else next.add(pageIndex);
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    setSelectedPages(new Set());
  }, []);

  /** Create a new PDF excluding all selected pages, then trigger download. */
  const handleDelete = useCallback(async () => {
    if (!file || selectedPages.size === 0) return;
    if (selectedPages.size >= thumbnails.length) return; // Can't delete all pages
    setProcessing(true);
    setError(null);
    try {
      const result = await deletePages(file, Array.from(selectedPages));
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_edited.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete pages. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file, selectedPages, thumbnails.length]);

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Click pages to mark them for deletion"
        />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted break-all sm:break-normal">
              <span className="font-medium">{file.name}</span> — {thumbnails.length} pages
              {selectedPages.size > 0 && (
                <span className="text-red-500 ml-2">
                  ({selectedPages.size} selected for removal)
                </span>
              )}
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

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                  Click pages to mark them for deletion
                </p>
                {selectedPages.size > 0 && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-dark-text-muted dark:hover:text-dark-text transition-colors"
                  >
                    <Undo2 className="w-4 h-4" />
                    Reset
                  </button>
                )}
              </div>
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
                        <div className="bg-red-500/70 inset-0 absolute flex items-center justify-center">
                          <Trash2 className="w-8 h-8 text-white" />
                        </div>
                      ) : null
                    }
                  />
                ))}
              </div>
            </>
          )}

          {selectedPages.size > 0 && selectedPages.size < thumbnails.length && (
            <button
              onClick={handleDelete}
              disabled={processing}
              className="w-full bg-red-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {processing
                ? "Removing..."
                : `Remove ${selectedPages.size} Page${selectedPages.size > 1 ? "s" : ""} & Download`}
            </button>
          )}

          {selectedPages.size >= thumbnails.length && (
            <p className="text-center text-sm text-red-500">
              Cannot delete all pages. Deselect at least one page.
            </p>
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
