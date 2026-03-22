import { useState, useCallback } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { compressPdf } from "../utils/pdf-operations.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";

export default function CompressPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{
    original: number;
    compressed: number;
    data: Uint8Array;
  } | null>(null);

  const handleFile = useCallback((files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setResult(null);
  }, []);

  const handleCompress = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    try {
      const data = await compressPdf(file);
      setResult({
        original: file.size,
        compressed: data.length,
        data,
      });
    } finally {
      setProcessing(false);
    }
  }, [file]);

  const handleDownload = useCallback(() => {
    if (!result || !file) return;
    const baseName = file.name.replace(/\.pdf$/i, "");
    downloadPdf(result.data, `${baseName}_compressed.pdf`);
  }, [result, file]);

  const savings = result
    ? Math.max(0, Math.round(((result.original - result.compressed) / result.original) * 100))
    : 0;

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="We'll optimize the file structure to reduce size"
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">
              <span className="font-medium">{file.name}</span> — {formatFileSize(file.size)}
            </p>
            <button
              onClick={() => {
                setFile(null);
                setResult(null);
              }}
              className="text-sm text-indigo-600 hover:text-indigo-700"
            >
              Change file
            </button>
          </div>

          {!result ? (
            <button
              onClick={handleCompress}
              disabled={processing}
              className="w-full bg-indigo-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {processing ? "Compressing..." : "Compress PDF"}
            </button>
          ) : (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-sm text-slate-500">Original</p>
                    <p className="text-xl font-bold text-slate-800">
                      {formatFileSize(result.original)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Compressed</p>
                    <p className="text-xl font-bold text-emerald-600">
                      {formatFileSize(result.compressed)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Saved</p>
                    <p
                      className={`text-xl font-bold ${savings > 0 ? "text-emerald-600" : "text-slate-500"}`}
                    >
                      {savings}%
                    </p>
                  </div>
                </div>
                {savings === 0 && (
                  <p className="text-sm text-slate-500 text-center mt-4">
                    This file is already well optimized. The output is about the same size.
                  </p>
                )}
              </div>

              <button
                onClick={handleDownload}
                className="w-full bg-indigo-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-indigo-700 transition-colors"
              >
                Download Compressed PDF
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
