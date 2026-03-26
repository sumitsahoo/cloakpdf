/**
 * Duplicate Page tool.
 *
 * Displays all PDF pages as thumbnails. The user selects one page to
 * duplicate, then drags the copy placeholder to choose where it is inserted.
 * The resulting PDF is downloaded immediately.
 */

import { useCallback, useState } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";
import { duplicatePage } from "../utils/pdf-operations.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";

export default function DuplicatePage() {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  // Stable IDs for thumbnails to avoid index-based keys.
  const [thumbnailIds, setThumbnailIds] = useState<string[]>([]);
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  // targetPosition: 0-based index at which the copy is inserted.
  const [targetPosition, setTargetPosition] = useState(0);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverPosition, setDragOverPosition] = useState<number | null>(null);

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
      setThumbnailIds(thumbs.map((_, idx) => `thumb-${idx}-${Date.now()}`));
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

  // Single stable layout: [dropzone_0] [page_0] [dropzone_1] ... [page_N-1] [dropzone_N]
  // The dropzone at targetPosition renders the draggable "Copy" card.
  // Other dropzones are thin gaps that expand into drop targets while dragging.
  const renderCopyRow = () => {
    if (selectedPage === null) return null;
    const items: React.ReactNode[] = [];

    for (let i = 0; i <= thumbnails.length; i++) {
      const isInsertHere = i === targetPosition;
      const isOver = dragOverPosition === i;
      const dropId = thumbnailIds[i] ?? "drop-end";

      if (isInsertHere) {
        items.push(
          <button
            key="copy-page"
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              setIsDragging(true);
            }}
            onDragEnd={() => {
              setIsDragging(false);
              setDragOverPosition(null);
            }}
            className="shrink-0 flex flex-col items-center gap-1 cursor-grab active:cursor-grabbing border-0 bg-transparent p-0"
          >
            <div className="relative w-16 aspect-3/4">
              <img
                src={thumbnails[selectedPage]}
                className="w-full h-full object-cover rounded-lg border-2 border-primary-400"
                alt={`Copy of page ${selectedPage + 1}`}
              />
              <div className="absolute inset-0 bg-primary-500/20 rounded-lg" />
            </div>
            <span className="text-xs text-primary-500 font-medium">Copy</span>
          </button>,
        );
      } else {
        items.push(
          <button
            key={`drop-${dropId}`}
            type="button"
            aria-label={`Insert copy before page ${i + 1}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverPosition(i);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragOverPosition(null);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              setTargetPosition(i);
              setIsDragging(false);
              setDragOverPosition(null);
            }}
            className={`shrink-0 self-stretch flex items-center justify-center rounded-lg transition-all duration-150 border-0 bg-transparent p-0 ${
              isDragging ? (isOver ? "w-16 bg-primary-50 dark:bg-primary-900/20" : "w-4") : "w-1"
            }`}
          >
            {isDragging && (
              <div
                className={`rounded-full transition-all duration-150 ${
                  isOver
                    ? "w-1 h-14 bg-primary-500"
                    : "w-0.5 h-10 bg-primary-200 dark:bg-primary-800"
                }`}
              />
            )}
          </button>,
        );
      }

      if (i < thumbnails.length) {
        items.push(
          <div key={thumbnailIds[i]} className="shrink-0 flex flex-col items-center gap-1">
            <img
              src={thumbnails[i]}
              className="w-16 aspect-3/4 object-cover rounded-lg border border-slate-200 dark:border-dark-border"
              alt={`Page ${i + 1}`}
            />
            <span className="text-xs text-slate-400 dark:text-dark-text-muted">{i + 1}</span>
          </div>,
        );
      }
    }

    return items;
  };

  const insertLabel = targetPosition === 0 ? "At the beginning" : `After page ${targetPosition}`;

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Click a page to select it, then drag the copy to choose where to place it"
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted">
              <span className="font-medium">{file.name}</span> — {formatFileSize(file.size)}
            </p>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setThumbnails([]);
                setThumbnailIds([]);
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
                    : `Page ${selectedPage + 1} selected — drag the copy to set its position`}
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {thumbnails.map((thumb, i) => (
                    <PageThumbnail
                      key={thumbnailIds[i] ?? i}
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
                              aria-hidden="true"
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
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                      {isDragging
                        ? "Drop the copy at the desired position"
                        : "Drag the copy to set its position"}
                    </p>
                    <div className="flex items-end gap-2 overflow-x-auto pb-2 min-h-22">
                      {renderCopyRow()}
                    </div>
                    <p className="text-sm text-primary-600 font-medium">{insertLabel}</p>
                  </div>

                  <button
                    type="button"
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
