/**
 * Rotate Pages tool.
 *
 * Renders page thumbnails with per-page rotation buttons (−90°, +90°, 180°)
 * and a "Rotate All" shortcut. Rotation angles are accumulated in a Map
 * keyed by 0-based page index. Only pages with a non-zero rotation are
 * modified on save.
 */

import { useCallback, useState } from "react";
import { FlipVertical2, RotateCcw, RotateCw } from "lucide-react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { ResetButton } from "../components/ResetButton.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { usePdfFile } from "../hooks/usePdfFile.ts";
import { downloadPdf, pdfFilename } from "../utils/file-helpers.ts";
import { rotatePages } from "../utils/pdf-operations.ts";
import { renderAllThumbnails, revokeThumbnails } from "../utils/pdf-renderer.ts";

export default function RotatePages() {
  const [rotations, setRotations] = useState<Map<number, number>>(new Map());

  const pdf = usePdfFile<string[]>({
    load: renderAllThumbnails,
    onReset: (thumbs) => {
      revokeThumbnails(thumbs ?? []);
      setRotations(new Map());
    },
  });
  const task = useAsyncProcess();

  const thumbnails = pdf.data ?? [];

  /** Accumulate rotation for a single page (angles are additive, mod 360). */
  const rotatePage = useCallback((pageIndex: number, angle: number) => {
    setRotations((prev) => {
      const next = new Map(prev);
      next.set(pageIndex, ((next.get(pageIndex) ?? 0) + angle) % 360);
      return next;
    });
  }, []);

  /** Apply the same rotation increment to every page at once. */
  const rotateAll = useCallback(
    (angle: number) => {
      setRotations((prev) => {
        const next = new Map(prev);
        for (let i = 0; i < thumbnails.length; i++) {
          next.set(i, ((next.get(i) ?? 0) + angle) % 360);
        }
        return next;
      });
    },
    [thumbnails.length],
  );

  const handleReset = useCallback(() => setRotations(new Map()), []);

  const handleApply = useCallback(async () => {
    if (!pdf.file || rotations.size === 0) return;
    const file = pdf.file;
    await task.run(async () => {
      const result = await rotatePages(file, rotations);
      downloadPdf(result, pdfFilename(file, "_rotated"));
    }, "Failed to rotate pages. Please try again.");
  }, [pdf.file, rotations, task]);

  return (
    <div className="space-y-6">
      {!pdf.file ? (
        <FileDropZone
          glowColor={categoryGlow.organise}
          iconColor={categoryAccent.organise}
          accept=".pdf,application/pdf"
          onFiles={pdf.onFiles}
          label="Drop a PDF file here"
          hint="Click rotation buttons on each page to adjust"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={pdf.file.name}
            details={`${thumbnails.length} pages`}
            onChangeFile={pdf.reset}
            extra={
              thumbnails.length > 0 ? (
                <button
                  type="button"
                  onClick={() => rotateAll(90)}
                  className="ml-2 text-sm px-3 py-1 bg-slate-100 dark:bg-dark-surface-alt dark:text-dark-text hover:bg-slate-200 dark:hover:bg-dark-border rounded-lg transition-colors"
                >
                  Rotate All 90° →
                </button>
              ) : undefined
            }
          />

          {pdf.loading ? (
            <LoadingSpinner />
          ) : (
            <>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                  Click rotation buttons on each page to adjust
                </p>
                {rotations.size > 0 && <ResetButton onClick={handleReset} />}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {thumbnails.map((thumb, i) => (
                  <div key={i} className="space-y-2">
                    <PageThumbnail
                      src={thumb}
                      pageNumber={i + 1}
                      rotation={rotations.get(i) ?? 0}
                    />
                    <div className="flex justify-center gap-1">
                      <button
                        onClick={() => rotatePage(i, -90)}
                        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-dark-surface-alt text-slate-500 dark:text-dark-text-muted transition-colors"
                        title="Rotate 90° left"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => rotatePage(i, 90)}
                        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-dark-surface-alt text-slate-500 dark:text-dark-text-muted transition-colors"
                        title="Rotate 90° right"
                      >
                        <RotateCw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => rotatePage(i, 180)}
                        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-dark-surface-alt text-slate-500 dark:text-dark-text-muted transition-colors"
                        title="Rotate 180°"
                      >
                        <FlipVertical2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {rotations.size > 0 && (
            <ActionButton
              onClick={handleApply}
              processing={task.processing}
              label="Apply Rotations & Download"
              processingLabel="Applying..."
            />
          )}
        </>
      )}

      {(pdf.loadError || task.error) && <AlertBox message={pdf.loadError ?? task.error ?? ""} />}
    </div>
  );
}
