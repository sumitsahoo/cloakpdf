/**
 * Add Bookmarks tool.
 *
 * Lets users build a list of bookmark entries (title + target page) and embed
 * them as a PDF outline. The viewer's bookmarks panel opens automatically
 * because /PageMode is set to UseOutlines. Any existing outline is replaced.
 *
 * Layout: dual-pane. Left pane is the bookmark list editor; right pane is a
 * large page preview with prev/next navigation. The "Add bookmark" button
 * pre-fills the new row with the page currently shown in the preview, and
 * clicking a bookmark row jumps the preview to its target page.
 */

import { CheckCircle2, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useCallback, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { InfoCallout } from "../components/InfoCallout.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { usePdfFile } from "../hooks/usePdfFile.ts";
import { useToolOutput } from "../hooks/useToolOutput.ts";
import { formatFileSize } from "../utils/file-helpers.ts";
import { addPdfBookmarks } from "../utils/pdf-operations.ts";
import { PREVIEW_SCALE, renderAllThumbnails, revokeThumbnails } from "../utils/pdf-renderer.ts";

interface BookmarkEntry {
  id: number;
  title: string;
  pageNumber: string; // string for controlled input; parsed to number on save
}

interface LoadedPdf {
  thumbnails: string[];
}

let nextId = 1;
const initialBookmarks = (): BookmarkEntry[] => [{ id: nextId++, title: "", pageNumber: "1" }];

async function loadPdf(file: File): Promise<LoadedPdf> {
  const thumbnails = await renderAllThumbnails(file, PREVIEW_SCALE);
  return { thumbnails };
}

export default function AddBookmarks() {
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>(initialBookmarks);
  const [selectedPage, setSelectedPage] = useState(0);
  const [done, setDone] = useState(false);

  const pdf = usePdfFile<LoadedPdf>({
    load: loadPdf,
    onReset: (data) => {
      revokeThumbnails(data?.thumbnails ?? []);
      setDone(false);
      setSelectedPage(0);
      setBookmarks(initialBookmarks());
    },
    loadErrorMessage: "Failed to load PDF.",
  });
  const task = useAsyncProcess();
  const output = useToolOutput();

  const thumbnails = pdf.data?.thumbnails ?? [];
  const pageCount = thumbnails.length;

  const addRow = useCallback(() => {
    setBookmarks((prev) => [
      ...prev,
      { id: nextId++, title: "", pageNumber: String(selectedPage + 1) },
    ]);
  }, [selectedPage]);

  const removeRow = useCallback((id: number) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const updateRow = useCallback(
    (id: number, field: keyof Omit<BookmarkEntry, "id">, value: string) => {
      setBookmarks((prev) => prev.map((b) => (b.id === id ? { ...b, [field]: value } : b)));
    },
    [],
  );

  /** Jump the preview to the page targeted by a bookmark row. */
  const jumpToBookmark = useCallback(
    (pageNumber: string) => {
      if (pageCount === 0) return;
      const parsed = parseInt(pageNumber, 10);
      if (Number.isNaN(parsed)) return;
      const idx = Math.max(0, Math.min(parsed - 1, pageCount - 1));
      setSelectedPage(idx);
    },
    [pageCount],
  );

  const handleApply = useCallback(async () => {
    if (!pdf.file) return;
    const valid = bookmarks.filter((b) => b.title.trim());
    if (valid.length === 0) {
      task.setError("Add at least one bookmark with a title.");
      return;
    }
    const file = pdf.file;
    setDone(false);
    const ok = await task.run(async () => {
      const entries = valid.map((b) => ({
        title: b.title.trim(),
        pageIndex: Math.max(0, Math.min(parseInt(b.pageNumber, 10) || 1, pageCount) - 1),
      }));
      const result = await addPdfBookmarks(file, entries);
      output.deliver(result, "_bookmarks", file);
    }, "Failed to add bookmarks. Please try again.");
    if (ok) setDone(true);
  }, [pdf.file, bookmarks, pageCount, task, output]);

  const validCount = bookmarks.filter((b) => b.title.trim()).length;

  return (
    <div className="space-y-6">
      {!pdf.file ? (
        <FileDropZone
          glowColor={categoryGlow.organise}
          iconColor={categoryAccent.organise}
          accept=".pdf,application/pdf"
          onFiles={pdf.onFiles}
          label="Drop a PDF file here"
          hint="Add a clickable bookmark list to navigate the document"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={pdf.file.name}
            details={`${formatFileSize(pdf.file.size)}${pageCount > 0 ? `, ${pageCount} pages` : ""}`}
            onChangeFile={pdf.reset}
          />

          {pdf.loading ? (
            <LoadingSpinner />
          ) : (
            <>
              <div className="grid md:grid-cols-2 gap-6">
                {/* ── Left column: bookmark list editor ── */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                      Bookmarks
                      {validCount > 0 && (
                        <span className="text-primary-600 dark:text-primary-400 ml-1.5">
                          ({validCount})
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border overflow-hidden">
                    <div className="grid grid-cols-[1fr_auto_auto] px-3 py-2 bg-slate-50 dark:bg-dark-surface-alt border-b border-slate-100 dark:border-dark-border">
                      <span className="text-xs font-medium text-slate-500 dark:text-dark-text-muted uppercase tracking-wide">
                        Bookmark title
                      </span>
                      <span className="text-xs font-medium text-slate-500 dark:text-dark-text-muted uppercase tracking-wide w-20 text-center">
                        Page
                      </span>
                      <span className="w-8" />
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-dark-border">
                      {bookmarks.map((bm, idx) => {
                        const targetPage =
                          Math.max(1, Math.min(parseInt(bm.pageNumber, 10) || 1, pageCount || 1)) -
                          1;
                        const isPreviewing = targetPage === selectedPage;
                        return (
                          <div
                            key={bm.id}
                            className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-2"
                          >
                            <input
                              type="text"
                              value={bm.title}
                              placeholder={`Bookmark ${idx + 1}`}
                              onChange={(e) => updateRow(bm.id, "title", e.target.value)}
                              onFocus={() => jumpToBookmark(bm.pageNumber)}
                              className="w-full px-3 py-1.5 border border-slate-200 dark:border-dark-border dark:bg-dark-bg dark:text-dark-text rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                            <input
                              type="number"
                              min={1}
                              max={pageCount || 9999}
                              value={bm.pageNumber}
                              onChange={(e) => {
                                updateRow(bm.id, "pageNumber", e.target.value);
                                jumpToBookmark(e.target.value);
                              }}
                              onFocus={() => jumpToBookmark(bm.pageNumber)}
                              aria-label={`Target page for bookmark ${idx + 1}`}
                              className={`w-20 px-2 py-1.5 border rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors ${
                                isPreviewing
                                  ? "border-primary-400 dark:border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200"
                                  : "border-slate-200 dark:border-dark-border dark:bg-dark-bg dark:text-dark-text"
                              }`}
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
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={addRow}
                    className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    Add bookmark for page {selectedPage + 1}
                  </button>

                  <p className="text-xs text-slate-500 dark:text-dark-text-muted leading-relaxed">
                    Use the preview on the right to find the page you want, then click{" "}
                    <span className="font-medium text-slate-700 dark:text-dark-text">
                      Add bookmark
                    </span>{" "}
                    and give it a title.
                  </p>
                </div>

                {/* ── Right column: page preview ── */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                      Preview — Page {selectedPage + 1}
                    </p>
                    {pageCount > 1 && (
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          disabled={selectedPage === 0}
                          onClick={() => setSelectedPage((p) => Math.max(0, p - 1))}
                          className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-dark-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          aria-label="Previous page"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs text-slate-400 dark:text-dark-text-muted tabular-nums px-1">
                          {selectedPage + 1} / {pageCount}
                        </span>
                        <button
                          type="button"
                          disabled={selectedPage === pageCount - 1}
                          onClick={() => setSelectedPage((p) => Math.min(pageCount - 1, p + 1))}
                          className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-dark-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          aria-label="Next page"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {thumbnails[selectedPage] ? (
                    <div className="relative aspect-3/4 bg-white dark:bg-dark-surface rounded-lg border border-slate-200 dark:border-dark-border overflow-hidden">
                      <img
                        src={thumbnails[selectedPage]}
                        alt={`Page ${selectedPage + 1}`}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="aspect-3/4 bg-slate-100 dark:bg-dark-surface-alt rounded-lg" />
                  )}
                </div>
              </div>

              <ActionButton
                onClick={handleApply}
                processing={task.processing}
                disabled={task.processing || validCount === 0}
                label={`Add ${validCount} Bookmark${validCount !== 1 ? "s" : ""} & ${output.deliveryWord}`}
                processingLabel="Adding Bookmarks..."
              />

              {done && (
                <InfoCallout icon={CheckCircle2} accent="organise">
                  Bookmarks added successfully. The PDF has been downloaded.
                </InfoCallout>
              )}
            </>
          )}
        </>
      )}

      {(pdf.loadError || task.error) && <AlertBox message={pdf.loadError ?? task.error ?? ""} />}
    </div>
  );
}
