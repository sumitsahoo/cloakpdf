/**
 * Split PDF tool.
 *
 * Displays page thumbnails with clickable dividers between them. The user
 * clicks between pages to insert split points, or picks a quick-split mode
 * (every page, every N pages). The PDF is then split into separate files
 * and downloaded — as a single PDF when there's only one part, or as a ZIP
 * archive when there are multiple.
 */

import { Minus, Scissors, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { usePdfFile } from "../hooks/usePdfFile.ts";
import { downloadBlob, downloadPdf, pdfFilename } from "../utils/file-helpers.ts";
import { extractPages } from "../utils/pdf-operations.ts";
import { renderAllThumbnails, revokeThumbnails } from "../utils/pdf-renderer.ts";

export default function SplitPdf() {
  /** Set of 0-based page indices *after* which a split occurs. */
  const [splitPoints, setSplitPoints] = useState<Set<number>>(new Set());
  const [everyN, setEveryN] = useState(1);

  const pdf = usePdfFile<string[]>({
    load: renderAllThumbnails,
    onReset: (thumbs) => {
      revokeThumbnails(thumbs ?? []);
      setSplitPoints(new Set());
    },
  });
  const task = useAsyncProcess();

  const thumbnails = pdf.data ?? [];

  const thumbnailKeys = useMemo(
    () => thumbnails.map((_, i) => `${pdf.file?.name ?? "page"}-${i}`),
    [thumbnails, pdf.file?.name],
  );

  /** Toggle a split point after the given page index. */
  const toggleSplit = useCallback((afterIndex: number) => {
    setSplitPoints((prev) => {
      const next = new Set(prev);
      if (next.has(afterIndex)) next.delete(afterIndex);
      else next.add(afterIndex);
      return next;
    });
  }, []);

  /** Split after every page. */
  const splitEveryPage = useCallback(() => {
    if (thumbnails.length <= 1) return;
    const pts = new Set<number>();
    for (let i = 0; i < thumbnails.length - 1; i++) pts.add(i);
    setSplitPoints(pts);
  }, [thumbnails.length]);

  /** Split every N pages. */
  const splitEveryNPages = useCallback(
    (n: number) => {
      if (thumbnails.length <= 1 || n < 1) return;
      const pts = new Set<number>();
      for (let i = n - 1; i < thumbnails.length - 1; i += n) pts.add(i);
      setSplitPoints(pts);
    },
    [thumbnails.length],
  );

  const clearSplits = useCallback(() => setSplitPoints(new Set()), []);

  /** Derive page ranges (0-based index arrays) from split points. */
  const parts = useMemo(() => {
    if (thumbnails.length === 0) return [];
    const sorted = [...splitPoints].sort((a, b) => a - b);
    const ranges: number[][] = [];
    let start = 0;
    for (const sp of sorted) {
      const indices: number[] = [];
      for (let i = start; i <= sp; i++) indices.push(i);
      ranges.push(indices);
      start = sp + 1;
    }
    if (start < thumbnails.length) {
      const indices: number[] = [];
      for (let i = start; i < thumbnails.length; i++) indices.push(i);
      ranges.push(indices);
    }
    return ranges;
  }, [thumbnails.length, splitPoints]);

  const handleSplit = useCallback(async () => {
    if (!pdf.file || parts.length === 0) return;
    const file = pdf.file;
    await task.run(async () => {
      if (parts.length === 1) {
        const result = await extractPages(file, parts[0]);
        downloadPdf(result, pdfFilename(file, "_split"));
      } else {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        const padLen = String(parts.length).length;
        const baseName = file.name.replace(/\.pdf$/i, "");
        for (let i = 0; i < parts.length; i++) {
          const result = await extractPages(file, parts[i]);
          const padded = String(i + 1).padStart(padLen, "0");
          zip.file(`${baseName}_part${padded}.pdf`, result);
        }
        const zipBlob = await zip.generateAsync({ type: "blob" });
        downloadBlob(zipBlob, `${baseName}_split.zip`);
      }
    }, "Failed to split PDF. Please try again.");
  }, [pdf.file, parts, task]);

  return (
    <div className="space-y-6">
      {!pdf.file ? (
        <FileDropZone
          glowColor={categoryGlow.organise}
          iconColor={categoryAccent.organise}
          accept=".pdf,application/pdf"
          onFiles={pdf.onFiles}
          label="Drop a PDF file here"
          hint="Split a PDF into multiple separate files"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={pdf.file.name}
            details={`${thumbnails.length} page${thumbnails.length !== 1 ? "s" : ""}`}
            onChangeFile={pdf.reset}
            extra={
              splitPoints.size > 0 ? (
                <span className="text-primary-600 dark:text-primary-400 ml-2">
                  → {parts.length} parts
                </span>
              ) : undefined
            }
          />

          {/* Quick split controls */}
          {thumbnails.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-700 dark:text-dark-text">
                Quick split:
              </span>
              <button
                type="button"
                onClick={splitEveryPage}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-slate-200 dark:border-dark-border text-slate-600 dark:text-dark-text-muted hover:bg-slate-50 dark:hover:bg-dark-surface-alt transition-colors"
              >
                <Scissors className="w-3.5 h-3.5" />
                Every page
              </button>
              <div className="inline-flex items-center gap-1.5">
                <span className="text-sm text-slate-500 dark:text-dark-text-muted">Every</span>
                <input
                  type="number"
                  min={1}
                  max={thumbnails.length}
                  value={everyN}
                  onChange={(e) => setEveryN(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
                  className="w-16 px-2 py-1.5 border border-slate-300 dark:border-dark-border dark:bg-dark-surface dark:text-dark-text rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => splitEveryNPages(everyN)}
                  className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 dark:border-dark-border text-slate-600 dark:text-dark-text-muted hover:bg-slate-50 dark:hover:bg-dark-surface-alt transition-colors"
                >
                  pages
                </button>
              </div>
              {splitPoints.size > 0 && (
                <button
                  type="button"
                  onClick={clearSplits}
                  className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-dark-text-muted dark:hover:text-dark-text transition-colors ml-auto"
                >
                  <X className="w-4 h-4" />
                  Clear splits
                </button>
              )}
            </div>
          )}

          {pdf.loading ? (
            <LoadingSpinner />
          ) : (
            <>
              <p className="text-xs text-slate-400 dark:text-dark-text-muted">
                Click between pages to add or remove split points
              </p>
              <div className="flex flex-wrap gap-x-1 gap-y-3 items-start">
                {thumbnails.map((thumb, i) => (
                  <div key={thumbnailKeys[i]} className="flex items-start">
                    <div className="w-[100px] sm:w-[120px]">
                      <PageThumbnail src={thumb} pageNumber={i + 1} />
                    </div>
                    {i < thumbnails.length - 1 && (
                      <button
                        type="button"
                        onClick={() => toggleSplit(i)}
                        className={`flex flex-col items-center justify-center self-stretch mx-0.5 w-6 rounded-lg transition-colors group ${
                          splitPoints.has(i)
                            ? "bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 border-dashed"
                            : "hover:bg-slate-100 dark:hover:bg-dark-surface-alt border border-transparent"
                        }`}
                        aria-label={
                          splitPoints.has(i)
                            ? `Remove split after page ${i + 1}`
                            : `Split after page ${i + 1}`
                        }
                      >
                        {splitPoints.has(i) ? (
                          <Scissors className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
                        ) : (
                          <Minus className="w-3.5 h-3.5 text-slate-300 dark:text-dark-border group-hover:text-slate-500 dark:group-hover:text-dark-text-muted transition-colors" />
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {splitPoints.size > 0 && (
            <ActionButton
              onClick={handleSplit}
              processing={task.processing}
              label={`Split into ${parts.length} Part${parts.length !== 1 ? "s" : ""} & Download`}
              processingLabel="Splitting..."
            />
          )}
        </>
      )}

      {(pdf.loadError || task.error) && <AlertBox message={pdf.loadError ?? task.error ?? ""} />}
    </div>
  );
}
