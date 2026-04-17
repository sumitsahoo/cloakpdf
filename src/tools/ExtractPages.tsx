/**
 * Extract Pages tool.
 *
 * Displays page thumbnails in a grid. The user can click individual pages to
 * select them, use Select All / Clear shortcuts, or type a range string
 * (e.g. "1-3, 5, 7-9") to specify pages by number. The selected pages are
 * written to a new PDF and downloaded.
 */

import { Check, CheckSquare, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import { ThumbnailGrid } from "../components/ThumbnailGrid.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { usePdfFile } from "../hooks/usePdfFile.ts";
import { downloadPdf, pdfFilename } from "../utils/file-helpers.ts";
import { extractPages } from "../utils/pdf-operations.ts";
import { renderAllThumbnails, revokeThumbnails } from "../utils/pdf-renderer.ts";

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
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [rangeInput, setRangeInput] = useState("");

  const pdf = usePdfFile<string[]>({
    load: renderAllThumbnails,
    onReset: (thumbs) => {
      revokeThumbnails(thumbs ?? []);
      setSelectedPages(new Set());
      setRangeInput("");
    },
  });
  const task = useAsyncProcess();

  const thumbnails = pdf.data ?? [];

  // Stable keys that don't use the map index directly in JSX (avoids lint warning)
  const thumbnailKeys = useMemo(
    () => thumbnails.map((_, i) => `${pdf.file?.name ?? "page"}-${i}`),
    [thumbnails, pdf.file?.name],
  );

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

  const clearAll = useCallback(() => setSelectedPages(new Set()), []);

  const handleExtract = useCallback(async () => {
    if (!pdf.file) return;

    // Range input takes priority over thumbnail clicks when filled
    const indices = rangeInput.trim()
      ? parseRangeInput(rangeInput, thumbnails.length)
      : [...selectedPages].sort((a, b) => a - b);

    if (indices.length === 0) return;

    const file = pdf.file;
    await task.run(async () => {
      const result = await extractPages(file, indices);
      downloadPdf(result, pdfFilename(file, "_extracted"));
    }, "Failed to extract pages. Please try again.");
  }, [pdf.file, selectedPages, rangeInput, thumbnails.length, task]);

  const hasSelection = rangeInput.trim().length > 0 || selectedPages.size > 0;

  // Effective selection count shown in the button label
  const effectiveCount = rangeInput.trim()
    ? parseRangeInput(rangeInput, thumbnails.length).length
    : selectedPages.size;

  return (
    <div className="space-y-6">
      {!pdf.file ? (
        <FileDropZone
          glowColor={categoryGlow.organise}
          iconColor={categoryAccent.organise}
          accept=".pdf,application/pdf"
          onFiles={pdf.onFiles}
          label="Drop a PDF file here"
          hint="Select pages to keep and download as a new PDF"
        />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted break-all sm:break-normal">
              <span className="font-medium">{pdf.file.name}</span> — {thumbnails.length} pages
              {selectedPages.size > 0 && !rangeInput.trim() && (
                <span className="text-primary-600 dark:text-primary-400 ml-2">
                  ({selectedPages.size} selected)
                </span>
              )}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={selectAll}
                className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 transition-colors"
              >
                <CheckSquare className="w-4 h-4" />
                Select all
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-dark-text-muted dark:hover:text-dark-text transition-colors"
              >
                <X className="w-4 h-4" />
                Clear
              </button>
              <button
                type="button"
                onClick={pdf.reset}
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

          {pdf.loading ? (
            <LoadingSpinner />
          ) : (
            <ThumbnailGrid>
              {thumbnails.map((thumb, i) => (
                <PageThumbnail
                  key={thumbnailKeys[i]}
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
            </ThumbnailGrid>
          )}

          {hasSelection && effectiveCount > 0 && (
            <ActionButton
              onClick={handleExtract}
              processing={task.processing}
              label={`Extract ${effectiveCount} Page${effectiveCount !== 1 ? "s" : ""} & Download`}
              processingLabel="Extracting..."
            />
          )}
        </>
      )}

      {(pdf.loadError || task.error) && <AlertBox message={pdf.loadError ?? task.error ?? ""} />}
    </div>
  );
}
