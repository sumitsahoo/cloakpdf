/**
 * Merge PDFs tool.
 *
 * Lets the user drop multiple PDF files, reorder them with up/down buttons,
 * and merge them into a single downloaded PDF. Files are stored locally
 * with unique IDs for stable list keys.
 */

import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { type SortMode, SortByNameButton } from "../components/SortByNameButton.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { downloadPdf, formatFileSize, naturalCompare } from "../utils/file-helpers.ts";
import { mergePdfs } from "../utils/pdf-operations.ts";

/** Internal representation of a queued PDF file. */
interface FileItem {
  file: File;
  id: string;
}

export default function MergePdf() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("off");
  const task = useAsyncProcess();

  const cycleSortMode = useCallback(() => {
    setSortMode((m) => (m === "off" ? "asc" : m === "asc" ? "desc" : "off"));
  }, []);

  /**
   * Files in the order shown to the user. Sorting derives a view without
   * mutating `files`, so toggling the sort back to "off" restores the
   * original drop order.
   */
  const displayedFiles = useMemo(() => {
    if (sortMode === "off") return files;
    const sorted = [...files].sort((a, b) => naturalCompare(a.file.name, b.file.name));
    return sortMode === "desc" ? sorted.reverse() : sorted;
  }, [files, sortMode]);

  const isSortActive = sortMode !== "off";

  const handleFiles = useCallback((newFiles: File[]) => {
    const items = newFiles
      .filter((f) => f.type === "application/pdf")
      .map((f) => ({ file: f, id: crypto.randomUUID() }));
    setFiles((prev) => [...prev, ...items]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  /** Swap a file with its neighbour to change the merge order. Disabled while sorted. */
  const moveFile = useCallback(
    (index: number, direction: -1 | 1) => {
      if (isSortActive) return;
      setFiles((prev) => {
        const next = [...prev];
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= next.length) return prev;
        [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
        return next;
      });
    },
    [isSortActive],
  );

  const handleMerge = useCallback(async () => {
    if (displayedFiles.length < 2) return;
    await task.run(async () => {
      const result = await mergePdfs(displayedFiles.map((f) => f.file));
      downloadPdf(result, "merged.pdf");
    }, "Failed to merge PDFs. Please check your files and try again.");
  }, [displayedFiles, task]);

  return (
    <div className="space-y-6">
      <FileDropZone
        glowColor={categoryGlow.organise}
        iconColor={categoryAccent.organise}
        accept=".pdf,application/pdf"
        multiple
        onFiles={handleFiles}
        label="Drop PDF files here or click to browse"
        hint="Select 2 or more PDF files to merge"
      />

      {files.length > 0 && (
        <>
          {files.length > 1 && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-slate-500 dark:text-dark-text-muted">
                {isSortActive
                  ? `Sorted by name (${sortMode === "asc" ? "A → Z" : "Z → A"})`
                  : `${files.length} files in import order`}
              </p>
              <SortByNameButton mode={sortMode} onClick={cycleSortMode} />
            </div>
          )}

          <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border divide-y divide-slate-100 dark:divide-dark-border">
            {displayedFiles.map((item, index) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-7 h-7 bg-primary-50 text-primary-600 rounded-full flex items-center justify-center text-sm font-medium shrink-0">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 dark:text-dark-text truncate">
                    {item.file.name}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-dark-text-muted">
                    {formatFileSize(item.file.size)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => moveFile(index, -1)}
                    disabled={isSortActive || index === 0}
                    title={isSortActive ? "Clear sort to reorder manually" : "Move up"}
                    className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-dark-surface-alt disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    aria-label="Move up"
                  >
                    <ChevronUp className="w-4 h-4 text-slate-500 dark:text-dark-text-muted" />
                  </button>
                  <button
                    onClick={() => moveFile(index, 1)}
                    disabled={isSortActive || index === displayedFiles.length - 1}
                    title={isSortActive ? "Clear sort to reorder manually" : "Move down"}
                    className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-dark-surface-alt disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    aria-label="Move down"
                  >
                    <ChevronDown className="w-4 h-4 text-slate-500 dark:text-dark-text-muted" />
                  </button>
                  <button
                    onClick={() => removeFile(item.id)}
                    className="p-1.5 rounded hover:bg-red-50 transition-colors"
                    aria-label="Remove file"
                  >
                    <X className="w-4 h-4 text-slate-400 dark:text-dark-text-muted hover:text-red-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {displayedFiles.length >= 2 && (
        <ActionButton
          onClick={handleMerge}
          processing={task.processing}
          label={`Merge ${displayedFiles.length} Files`}
          processingLabel="Merging..."
        />
      )}

      {task.error && <AlertBox message={task.error} />}
    </div>
  );
}
