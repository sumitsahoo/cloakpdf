/**
 * Add Bookmarks tool.
 *
 * Lets users build a list of bookmark entries (title + target page) and embed
 * them as a PDF outline. The viewer's bookmarks panel opens automatically
 * because /PageMode is set to UseOutlines. Any existing outline is replaced.
 */

import { CheckCircle2, Plus, X } from "lucide-react";
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
import { downloadPdf, formatFileSize, pdfFilename } from "../utils/file-helpers.ts";
import { addPdfBookmarks } from "../utils/pdf-operations.ts";

interface BookmarkEntry {
  id: number;
  title: string;
  pageNumber: string; // string for controlled input; parsed to number on save
}

let nextId = 1;
const initialBookmarks = (): BookmarkEntry[] => [{ id: nextId++, title: "", pageNumber: "1" }];

/** Load the page count via pdf-lib (same lenient settings the operations use). */
async function getPageCount(file: File): Promise<number> {
  const { PDFDocument } = await import("@pdfme/pdf-lib");
  const buf = await file.arrayBuffer();
  const doc = await PDFDocument.load(buf, { throwOnInvalidObject: false });
  return doc.getPageCount();
}

export default function AddBookmarks() {
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>(initialBookmarks);
  const [done, setDone] = useState(false);

  const pdf = usePdfFile<number>({
    load: getPageCount,
    onReset: () => {
      setDone(false);
      setBookmarks(initialBookmarks());
    },
    loadErrorMessage: "Failed to load PDF.",
  });
  const task = useAsyncProcess();

  const pageCount = pdf.data ?? 0;

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
      downloadPdf(result, pdfFilename(file, "_bookmarks"));
    }, "Failed to add bookmarks. Please try again.");
    if (ok) setDone(true);
  }, [pdf.file, bookmarks, pageCount, task]);

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

              <ActionButton
                onClick={handleApply}
                processing={task.processing}
                disabled={task.processing || bookmarks.every((b) => !b.title.trim())}
                label={`Add ${bookmarks.filter((b) => b.title.trim()).length} Bookmark${bookmarks.filter((b) => b.title.trim()).length !== 1 ? "s" : ""} & Download`}
                processingLabel="Adding Bookmarks..."
              />

              {done && (
                <InfoCallout icon={CheckCircle2} accent="organise">
                  Bookmarks added successfully. The PDF has been downloaded.
                </InfoCallout>
              )}
            </div>
          )}
        </>
      )}

      {(pdf.loadError || task.error) && <AlertBox message={pdf.loadError ?? task.error ?? ""} />}
    </div>
  );
}
