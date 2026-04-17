/**
 * OCR PDF tool.
 *
 * Extracts text from scanned or image-based PDFs using Tesseract.js OCR.
 * Each page is rendered at high DPI via PDF.js, preprocessed for contrast,
 * and then recognised with spatial layout preservation. Features:
 *
 * - **Auto Detect** language or manual language selection via pill buttons
 * - Per-page progress bar during OCR
 * - Page-wise collapsible text panels with individual "Copy" buttons
 * - "Copy All" and "Download as TXT" actions
 */

import { CloudDownload } from "lucide-react";
import { useCallback, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { InfoCallout } from "../components/InfoCallout.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { usePdfFile } from "../hooks/usePdfFile.ts";
import { downloadBlob, formatFileSize, pdfFilename } from "../utils/file-helpers.ts";
import { createSearchablePdf, extractTextOcr } from "../utils/pdf-operations.ts";

/** Language options displayed as pill buttons. "auto" uses Tesseract OSD. */
const LANGUAGES = [
  { code: "auto", label: "🌐 Auto Detect" },
  { code: "ara", label: "🇸🇦 Arabic" },
  { code: "chi_sim", label: "🇨🇳 Chinese" },
  { code: "nld", label: "🇳🇱 Dutch" },
  { code: "eng", label: "🇬🇧 English" },
  { code: "fra", label: "🇫🇷 French" },
  { code: "deu", label: "🇩🇪 German" },
  { code: "hin", label: "🇮🇳 Hindi" },
  { code: "ita", label: "🇮🇹 Italian" },
  { code: "jpn", label: "🇯🇵 Japanese" },
  { code: "kor", label: "🇰🇷 Korean" },
  { code: "por", label: "🇵🇹 Portuguese" },
  { code: "rus", label: "🇷🇺 Russian" },
  { code: "spa", label: "🇪🇸 Spanish" },
] as const;

export default function OcrPdf() {
  const [language, setLanguage] = useState("auto");
  const [progressStatus, setProgressStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set());
  const [copiedPage, setCopiedPage] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [creatingPdf, setCreatingPdf] = useState(false);

  const pdf = usePdfFile({
    onReset: () => {
      setPages([]);
      setProgress(null);
      setProgressStatus(null);
      setExpandedPages(new Set());
    },
  });
  const task = useAsyncProcess();
  const processing = task.processing;
  const error = task.error;

  /** Run Tesseract OCR on every page and store the per-page text results. */
  const handleExtract = useCallback(async () => {
    if (!pdf.file) return;
    const file = pdf.file;
    setPages([]);
    setProgress({ current: 0, total: 0 });
    setProgressStatus("Initializing OCR engine…");
    const ok = await task.run(async () => {
      const pageTexts = await extractTextOcr(file, language, (current, total, status) => {
        setProgress({ current, total });
        if (status) setProgressStatus(status);
      });
      setPages(pageTexts);
      // Start with all pages collapsed for easy navigation
      setExpandedPages(new Set());
    }, "Failed to extract text. Please try again.");
    void ok;
    setProgress(null);
    setProgressStatus(null);
  }, [pdf.file, language, task]);

  // Combine all page texts with page-number headers for copy/download operations
  const fullText = pages.map((text, i) => `--- Page ${i + 1} ---\n\n${text}`).join("\n\n");

  const handleCopyAll = useCallback(async () => {
    if (!fullText) return;
    try {
      await navigator.clipboard.writeText(fullText);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      task.setError("Failed to copy to clipboard.");
    }
  }, [fullText, task]);

  const handleCopyPage = useCallback(
    async (pageIndex: number) => {
      const text = pages[pageIndex];
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        setCopiedPage(pageIndex);
        setTimeout(() => setCopiedPage(null), 2000);
      } catch {
        task.setError("Failed to copy to clipboard.");
      }
    },
    [pages, task],
  );

  const handleDownload = useCallback(() => {
    if (!fullText || !pdf.file) return;
    const baseName = pdf.file.name.replace(/\.pdf$/i, "");
    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, `${baseName}_ocr.txt`);
  }, [fullText, pdf.file]);

  /** Overlay invisible OCR text on the original PDF so it becomes searchable. */
  const handleDownloadSearchablePdf = useCallback(async () => {
    if (!pdf.file || pages.length === 0) return;
    const file = pdf.file;
    setCreatingPdf(true);
    task.setError(null);
    try {
      const pdfBytes = await createSearchablePdf(file, pages);
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
      downloadBlob(blob, pdfFilename(file, "_searchable"));
    } catch (e) {
      task.setError(e instanceof Error ? e.message : "Failed to create searchable PDF.");
    } finally {
      setCreatingPdf(false);
    }
  }, [pdf.file, pages, task]);

  const togglePage = useCallback((pageIndex: number) => {
    setExpandedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageIndex)) {
        next.delete(pageIndex);
      } else {
        next.add(pageIndex);
      }
      return next;
    });
  }, []);

  const totalWords = pages.reduce(
    (sum, text) => sum + text.split(/\s+/).filter((w) => w.length > 0).length,
    0,
  );
  const totalChars = pages.reduce((sum, text) => sum + text.length, 0);
  const progressPercent =
    progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="space-y-6">
      {!pdf.file ? (
        <FileDropZone
          glowColor={categoryGlow.transform}
          iconColor={categoryAccent.transform}
          accept=".pdf,application/pdf"
          onFiles={pdf.onFiles}
          label="Drop a PDF file here"
          hint="Extract text from scanned or image-based PDFs using OCR"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={pdf.file.name}
            details={formatFileSize(pdf.file.size)}
            onChangeFile={pdf.reset}
          />

          {pages.length === 0 ? (
            <div className="space-y-4">
              {/* First-run download notice */}
              <InfoCallout icon={CloudDownload} title="First-run download" accent="transform">
                The OCR engine (<span className="font-medium">~2 MB</span>) and the selected
                language data (<span className="font-medium">~10–15 MB</span>) are fetched once from
                a public CDN, then cached locally for offline reuse.
              </InfoCallout>

              {/* Language pill selector */}
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border shadow-sm p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-dark-text-muted mb-3">
                  OCR Language
                </p>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => setLanguage(lang.code)}
                      disabled={processing}
                      className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                        language === lang.code
                          ? "bg-violet-600 text-white shadow-sm"
                          : "bg-slate-100 dark:bg-dark-bg text-slate-600 dark:text-dark-text-muted border border-slate-200 dark:border-dark-border hover:bg-slate-200 dark:hover:bg-dark-border"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Progress section */}
              {processing && progress && progress.total > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-dark-text-muted">
                      {progressStatus || `Processing page ${progress.current} of ${progress.total}`}
                    </span>
                    <span className="font-medium text-primary-600">{progressPercent}%</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-dark-border rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-violet-600 h-full rounded-full transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Initializing spinner */}
              {processing && (!progress || progress.total === 0) && (
                <div className="flex items-center gap-3 py-4">
                  <div className="w-5 h-5 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
                  <span className="text-sm text-slate-600 dark:text-dark-text-muted">
                    {progressStatus || "Initializing OCR engine…"}
                  </span>
                </div>
              )}

              <ActionButton
                onClick={handleExtract}
                processing={processing}
                label="Extract Text"
                processingLabel="Extracting Text..."
                color="bg-violet-600 hover:bg-violet-700"
              />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Stats bar */}
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-dark-text-muted">Pages</p>
                    <p className="text-xl font-bold text-slate-800 dark:text-dark-text">
                      {pages.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-dark-text-muted">Words</p>
                    <p className="text-xl font-bold text-slate-800 dark:text-dark-text">
                      {totalWords.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-dark-text-muted">Characters</p>
                    <p className="text-xl font-bold text-slate-800 dark:text-dark-text">
                      {totalChars.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Expand / Collapse all toggle */}
              <div className="flex items-center justify-end">
                <button
                  onClick={() =>
                    expandedPages.size === pages.length
                      ? setExpandedPages(new Set())
                      : setExpandedPages(new Set(pages.map((_, i) => i)))
                  }
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-dark-border text-slate-600 dark:text-dark-text-muted hover:bg-slate-200 dark:hover:bg-dark-surface transition-colors"
                >
                  {expandedPages.size === pages.length ? "▲ Collapse All" : "▼ Expand All"}
                </button>
              </div>

              {/* Page-wise text panels */}
              <div className="space-y-2">
                {pages.map((pageText, idx) => {
                  const isExpanded = expandedPages.has(idx);
                  const pageWords = pageText.split(/\s+/).filter((w) => w.length > 0).length;
                  return (
                    <div
                      key={idx}
                      className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border overflow-hidden"
                    >
                      {/* Page header — click to expand/collapse */}
                      <div
                        onClick={() => togglePage(idx)}
                        className="w-full flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-dark-border/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`text-slate-400 dark:text-dark-text-muted transition-transform ${
                              isExpanded ? "rotate-90" : ""
                            }`}
                          >
                            ▶
                          </span>
                          <span className="text-sm font-semibold text-slate-700 dark:text-dark-text">
                            Page {idx + 1}
                          </span>
                          <span className="text-xs text-slate-400 dark:text-dark-text-muted">
                            {pageWords} words
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleCopyPage(idx);
                          }}
                          className="text-xs px-3 py-1 rounded-full bg-slate-100 dark:bg-dark-border text-slate-600 dark:text-dark-text-muted hover:bg-primary-100 hover:text-primary-700 dark:hover:bg-primary-900/40 dark:hover:text-primary-300 transition-colors"
                        >
                          {copiedPage === idx ? "✅ Copied!" : "📋 Copy"}
                        </button>
                      </div>

                      {/* Collapsible text content */}
                      {isExpanded && (
                        <div className="px-4 pb-4">
                          <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-dark-text font-mono leading-relaxed bg-slate-50 dark:bg-dark-bg rounded-lg p-3 max-h-64 overflow-y-auto">
                            {pageText || "(No text detected on this page)"}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Global action buttons */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={handleCopyAll}
                  className="bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border text-slate-700 dark:text-dark-text py-3 px-4 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-dark-border transition-colors text-sm"
                >
                  {copiedAll ? "✅ Copied!" : "📋 Copy All"}
                </button>
                <button
                  onClick={handleDownload}
                  className="bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border text-slate-700 dark:text-dark-text py-3 px-4 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-dark-border transition-colors text-sm"
                >
                  💾 Download TXT
                </button>
                <button
                  onClick={handleDownloadSearchablePdf}
                  disabled={creatingPdf}
                  className="bg-violet-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  {creatingPdf ? "Creating…" : "📄 Searchable PDF"}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {error && <AlertBox message={error} />}
    </div>
  );
}
