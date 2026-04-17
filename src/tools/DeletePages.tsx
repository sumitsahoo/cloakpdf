/**
 * Delete Pages tool.
 *
 * Displays page thumbnails in a grid. Clicking a page toggles it for deletion
 * (shown with a red overlay). The user cannot delete all pages — at least one
 * must remain. On confirmation, a new PDF is created with the remaining pages.
 */

import { Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import { ResetButton } from "../components/ResetButton.tsx";
import { ThumbnailGrid } from "../components/ThumbnailGrid.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { usePdfFile } from "../hooks/usePdfFile.ts";
import { downloadPdf, pdfFilename } from "../utils/file-helpers.ts";
import { deletePages } from "../utils/pdf-operations.ts";
import { renderAllThumbnails, revokeThumbnails } from "../utils/pdf-renderer.ts";

export default function DeletePages() {
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());

  const pdf = usePdfFile<string[]>({
    load: renderAllThumbnails,
    onReset: (thumbs) => {
      revokeThumbnails(thumbs ?? []);
      setSelectedPages(new Set());
    },
  });
  const task = useAsyncProcess();

  const thumbnails = pdf.data ?? [];

  /** Toggle a page's selection state for deletion. */
  const togglePage = useCallback((pageIndex: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageIndex)) next.delete(pageIndex);
      else next.add(pageIndex);
      return next;
    });
  }, []);

  const handleReset = useCallback(() => setSelectedPages(new Set()), []);

  /** Create a new PDF excluding all selected pages, then trigger download. */
  const handleDelete = useCallback(async () => {
    if (!pdf.file || selectedPages.size === 0) return;
    if (selectedPages.size >= thumbnails.length) return; // Can't delete all pages
    const file = pdf.file;
    await task.run(async () => {
      const result = await deletePages(file, Array.from(selectedPages));
      downloadPdf(result, pdfFilename(file, "_edited"));
    }, "Failed to delete pages. Please try again.");
  }, [pdf.file, selectedPages, thumbnails.length, task]);

  return (
    <div className="space-y-6">
      {!pdf.file ? (
        <FileDropZone
          glowColor={categoryGlow.organise}
          iconColor={categoryAccent.organise}
          accept=".pdf,application/pdf"
          onFiles={pdf.onFiles}
          label="Drop a PDF file here"
          hint="Click pages to mark them for deletion"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={pdf.file.name}
            details={`${thumbnails.length} pages`}
            onChangeFile={pdf.reset}
            extra={
              selectedPages.size > 0 ? (
                <span className="text-red-500 ml-2">
                  ({selectedPages.size} selected for removal)
                </span>
              ) : undefined
            }
          />

          {pdf.loading ? (
            <LoadingSpinner />
          ) : (
            <>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                  Click pages to mark them for deletion
                </p>
                {selectedPages.size > 0 && <ResetButton onClick={handleReset} />}
              </div>
              <ThumbnailGrid>
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
              </ThumbnailGrid>
            </>
          )}

          {selectedPages.size > 0 && selectedPages.size < thumbnails.length && (
            <ActionButton
              onClick={handleDelete}
              processing={task.processing}
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

      {(pdf.loadError || task.error) && <AlertBox message={pdf.loadError ?? task.error ?? ""} />}
    </div>
  );
}
