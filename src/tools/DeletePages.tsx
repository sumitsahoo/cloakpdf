import { useState, useCallback } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import { deletePages } from "../utils/pdf-operations.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";
import { downloadPdf } from "../utils/file-helpers.ts";

export default function DeletePages() {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setSelectedPages(new Set());
    setLoading(true);
    try {
      const thumbs = await renderAllThumbnails(pdf);
      setThumbnails(thumbs);
    } finally {
      setLoading(false);
    }
  }, []);

  const togglePage = useCallback((pageIndex: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageIndex)) next.delete(pageIndex);
      else next.add(pageIndex);
      return next;
    });
  }, []);

  const handleDelete = useCallback(async () => {
    if (!file || selectedPages.size === 0) return;
    if (selectedPages.size >= thumbnails.length) return; // Can't delete all pages
    setProcessing(true);
    try {
      const result = await deletePages(file, Array.from(selectedPages));
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_edited.pdf`);
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
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">
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
              className="text-sm text-indigo-600 hover:text-indigo-700"
            >
              Change file
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : (
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
                        <svg
                          className="w-8 h-8 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </div>
                    ) : null
                  }
                />
              ))}
            </div>
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
    </div>
  );
}
