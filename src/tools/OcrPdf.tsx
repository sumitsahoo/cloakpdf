/**
 * OCR PDF tool.
 *
 * Extracts text from scanned or image-based PDFs using Tesseract.js OCR.
 * Each page is rendered at high DPI via PDF.js, preprocessed for contrast,
 * and then recognised with spatial layout preservation. The extracted text
 * can be copied to clipboard or downloaded as a `.txt` file.
 */

import { useState, useCallback, useRef } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { extractTextOcr } from "../utils/pdf-operations.ts";
import { downloadBlob, formatFileSize } from "../utils/file-helpers.ts";

/** Supported OCR languages with friendly labels. */
const LANGUAGES = [
  { code: "eng", label: "English" },
  { code: "fra", label: "French" },
  { code: "deu", label: "German" },
  { code: "spa", label: "Spanish" },
  { code: "ita", label: "Italian" },
  { code: "por", label: "Portuguese" },
  { code: "nld", label: "Dutch" },
  { code: "jpn", label: "Japanese" },
  { code: "chi_sim", label: "Chinese (Simplified)" },
  { code: "kor", label: "Korean" },
  { code: "ara", label: "Arabic" },
  { code: "hin", label: "Hindi" },
] as const;

export default function OcrPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("eng");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const handleFile = useCallback((files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setResult(null);
    setProgress(null);
    setCopied(false);
    setError(null);
  }, []);

  const handleExtract = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    setResult(null);
    setProgress({ current: 0, total: 0 });
    try {
      const text = await extractTextOcr(file, language, (current, total) => {
        setProgress({ current, total });
      });
      setResult(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to extract text. Please try again.");
    } finally {
      setProcessing(false);
      setProgress(null);
    }
  }, [file, language]);

  const handleCopy = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Failed to copy to clipboard.");
    }
  }, [result]);

  const handleDownload = useCallback(() => {
    if (!result || !file) return;
    const baseName = file.name.replace(/\.pdf$/i, "");
    const blob = new Blob([result], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, `${baseName}_ocr.txt`);
  }, [result, file]);

  const wordCount = result ? result.split(/\s+/).filter((w) => w.length > 0).length : 0;
  const charCount = result ? result.length : 0;
  const progressPercent =
    progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Extract text from scanned or image-based PDFs using OCR"
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted">
              <span className="font-medium">{file.name}</span> — {formatFileSize(file.size)}
            </p>
            <button
              onClick={() => {
                setFile(null);
                setResult(null);
                setProgress(null);
                setCopied(false);
              }}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              Change file
            </button>
          </div>

          {!result ? (
            <div className="space-y-4">
              {/* Language selector */}
              <div>
                <label
                  htmlFor="ocr-language"
                  className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-2"
                >
                  OCR Language
                </label>
                <select
                  id="ocr-language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={processing}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface text-sm text-slate-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Progress bar */}
              {processing && progress && progress.total > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-dark-text-muted">
                      Processing page {progress.current} of {progress.total}
                    </span>
                    <span className="font-medium text-primary-600">{progressPercent}%</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-dark-border rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-primary-600 h-full rounded-full transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Loading spinner for initial setup (before page count known) */}
              {processing && (!progress || progress.total === 0) && (
                <div className="flex items-center gap-3 py-4">
                  <div className="w-5 h-5 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                  <span className="text-sm text-slate-600 dark:text-dark-text-muted">
                    Initializing OCR engine...
                  </span>
                </div>
              )}

              <button
                onClick={handleExtract}
                disabled={processing}
                className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {processing ? "Extracting Text..." : "Extract Text"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Stats bar */}
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border p-4">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-dark-text-muted">Words</p>
                    <p className="text-xl font-bold text-slate-800 dark:text-dark-text">
                      {wordCount.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-dark-text-muted">Characters</p>
                    <p className="text-xl font-bold text-slate-800 dark:text-dark-text">
                      {charCount.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Extracted text */}
              <div className="relative">
                <textarea
                  ref={textRef}
                  readOnly
                  value={result}
                  rows={16}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-bg text-sm text-slate-800 dark:text-dark-text font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleCopy}
                  className="bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border text-slate-700 dark:text-dark-text py-3 px-6 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-dark-border transition-colors"
                >
                  {copied ? "✅ Copied!" : "📋 Copy to Clipboard"}
                </button>
                <button
                  onClick={handleDownload}
                  className="bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 transition-colors"
                >
                  💾 Download as TXT
                </button>
              </div>
            </div>
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
