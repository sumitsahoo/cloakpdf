import { useState, useCallback } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import { splitPdf } from "../utils/pdf-operations.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";
import { downloadPdf } from "../utils/file-helpers.ts";

export default function SplitPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [rangeInput, setRangeInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setSelectedPages(new Set());
    setRangeInput("");
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

  const handleSplit = useCallback(async () => {
    if (!file) return;

    let pages: number[] = [];

    if (rangeInput.trim()) {
      // Parse range input like "1-3, 5, 7-9"
      const parts = rangeInput.split(",").map((s) => s.trim());
      for (const part of parts) {
        const rangeParts = part.split("-").map((s) => Number.parseInt(s.trim(), 10));
        if (
          rangeParts.length === 2 &&
          !Number.isNaN(rangeParts[0]) &&
          !Number.isNaN(rangeParts[1])
        ) {
          for (let i = rangeParts[0]; i <= rangeParts[1]; i++) pages.push(i);
        } else if (rangeParts.length === 1 && !Number.isNaN(rangeParts[0])) {
          pages.push(rangeParts[0]);
        }
      }
    } else {
      pages = Array.from(selectedPages).map((i) => i + 1);
    }

    if (pages.length === 0) return;

    setProcessing(true);
    try {
      const ranges = pages.map((p) => ({ start: p, end: p }));
      const result = await splitPdf(file, ranges);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_extracted.pdf`);
    } finally {
      setProcessing(false);
    }
  }, [file, selectedPages, rangeInput]);

  const hasSelection = selectedPages.size > 0 || rangeInput.trim().length > 0;

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Select pages to extract from the document"
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">
              <span className="font-medium">{file.name}</span> — {thumbnails.length} pages
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

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Page range (optional)
            </label>
            <input
              type="text"
              value={rangeInput}
              onChange={(e) => setRangeInput(e.target.value)}
              placeholder="e.g., 1-3, 5, 7-9"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="text-xs text-slate-400 mt-1">Or click pages below to select them</p>
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
                />
              ))}
            </div>
          )}

          {hasSelection && (
            <button
              onClick={handleSplit}
              disabled={processing}
              className="w-full bg-indigo-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {processing ? "Extracting..." : "Extract Selected Pages"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
