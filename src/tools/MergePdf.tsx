import { useState, useCallback } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { mergePdfs } from "../utils/pdf-operations.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";

interface FileItem {
  file: File;
  id: string;
}

export default function MergePdf() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [processing, setProcessing] = useState(false);

  const handleFiles = useCallback((newFiles: File[]) => {
    const items = newFiles
      .filter((f) => f.type === "application/pdf")
      .map((f) => ({ file: f, id: crypto.randomUUID() }));
    setFiles((prev) => [...prev, ...items]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const moveFile = useCallback((index: number, direction: -1 | 1) => {
    setFiles((prev) => {
      const next = [...prev];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }, []);

  const handleMerge = useCallback(async () => {
    if (files.length < 2) return;
    setProcessing(true);
    try {
      const result = await mergePdfs(files.map((f) => f.file));
      downloadPdf(result, "merged.pdf");
    } catch (e) {
      console.error("Merge failed:", e);
    } finally {
      setProcessing(false);
    }
  }, [files]);

  return (
    <div className="space-y-6">
      <FileDropZone
        accept=".pdf,application/pdf"
        multiple
        onFiles={handleFiles}
        label="Drop PDF files here or click to browse"
        hint="Select 2 or more PDF files to merge"
      />

      {files.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {files.map((item, index) => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-7 h-7 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center text-sm font-medium shrink-0">
                {index + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{item.file.name}</p>
                <p className="text-xs text-slate-400">{formatFileSize(item.file.size)}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => moveFile(index, -1)}
                  disabled={index === 0}
                  className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
                  aria-label="Move up"
                >
                  <svg
                    className="w-4 h-4 text-slate-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 15l7-7 7 7"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => moveFile(index, 1)}
                  disabled={index === files.length - 1}
                  className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
                  aria-label="Move down"
                >
                  <svg
                    className="w-4 h-4 text-slate-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => removeFile(item.id)}
                  className="p-1.5 rounded hover:bg-red-50 transition-colors"
                  aria-label="Remove file"
                >
                  <svg
                    className="w-4 h-4 text-slate-400 hover:text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {files.length >= 2 && (
        <button
          onClick={handleMerge}
          disabled={processing}
          className="w-full bg-indigo-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {processing ? "Merging..." : `Merge ${files.length} Files`}
        </button>
      )}
    </div>
  );
}
