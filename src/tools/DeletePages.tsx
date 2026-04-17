/**
 * Delete Pages tool.
 *
 * Displays page thumbnails in a grid. Clicking a page toggles it for deletion
 * (shown with a red overlay). The user cannot delete all pages — at least one
 * must remain. On confirmation, a new PDF is created with the remaining pages.
 */

import { useCallback, useState } from "react";
import { Trash2 } from "lucide-react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { ResetButton } from "../components/ResetButton.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import { downloadPdf } from "../utils/file-helpers.ts";
import { deletePages } from "../utils/pdf-operations.ts";
import { renderAllThumbnails, revokeThumbnails } from "../utils/pdf-renderer.ts";

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
          glowColor={categoryGlow.organise}
          iconColor={categoryAccent.organise}
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Click pages to mark them for deletion"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={file.name}
            details={`${thumbnails.length} pages`}
            onChangeFile={() => {
              revokeThumbnails(thumbnails);
              setFile(null);
              setThumbnails([]);
              setSelectedPages(new Set());
            }}
            extra={
              selectedPages.size > 0 ? (
                <span className="text-red-500 ml-2">
                  ({selectedPages.size} selected for removal)
                </span>
              ) : undefined
            }
          />

          {loading ? (
            <LoadingSpinner />
          ) : (
            <>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                  Click pages to mark them for deletion
                </p>
                {selectedPages.size > 0 && <ResetButton onClick={handleReset} />}
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
            <ActionButton
              onClick={handleDelete}
              processing={processing}
              label={`Remove ${selectedPages.size} Page${selectedPages.size > 1 ? "s" : ""} & Download`}
              processingLabel="Removing..."
              color="bg-red-600 hover:bg-red-700"
            />
          )}

          {selectedPages.size >= thumbnails.length && (
            <p className="text-center text-sm text-red-500">
              Cannot delete all pages. Deselect at least one page.
            </p>
          )}
        </>
      )}

      {error && <AlertBox message={error} />}
    </div>
  );
}
