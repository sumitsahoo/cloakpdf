/**
 * Flatten PDF tool.
 *
 * Removes all interactive form fields and annotations from a PDF,
 * converting them to static content. Useful for locking down filled
 * forms before sharing.
 */

import { useState, useCallback } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { flattenPdf } from "../utils/pdf-operations.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";

export default function FlattenPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Uint8Array | null>(null);

  const handleFile = useCallback((files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setResult(null);
    setError(null);
  }, []);

  const handleFlatten = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    try {
      const data = await flattenPdf(file);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to flatten PDF. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file]);

  const handleDownload = useCallback(() => {
    if (!result || !file) return;
    const baseName = file.name.replace(/\.pdf$/i, "");
    downloadPdf(result, `${baseName}_flattened.pdf`);
  }, [result, file]);

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          glowColor={categoryGlow.transform}
          iconColor={categoryAccent.transform}
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Form fields and annotations will be converted to static content"
        />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted break-all sm:break-normal">
              <span className="font-medium">{file.name}</span> — {formatFileSize(file.size)}
            </p>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setResult(null);
              }}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              Change file
            </button>
          </div>

          {!result ? (
            <div className="space-y-4">
              {/* Visual: before → after flattening */}
              <div className="grid grid-cols-2 gap-3">
                {/* Before — interactive */}
                <div className="rounded-xl border border-violet-100 dark:border-violet-900/50 bg-violet-50/40 dark:bg-violet-950/20 p-3 flex flex-col gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-400 dark:text-violet-500">
                    Before
                  </p>
                  {/* title line */}
                  <div className="h-1.5 w-3/4 rounded-full bg-violet-700 dark:bg-violet-300" />
                  {/* body text */}
                  <div className="h-1 w-full rounded-full bg-violet-200 dark:bg-violet-700" />
                  {/* text input — dashed outline with cursor */}
                  <div className="h-4 w-full rounded border border-dashed border-violet-400 dark:border-violet-500 bg-white dark:bg-violet-950/30 flex items-center px-1.5 gap-0.5">
                    <div className="h-1 w-2/5 rounded-full bg-violet-300 dark:bg-violet-600" />
                    <div className="h-2.5 w-px bg-violet-500 dark:bg-violet-400" />
                  </div>
                  {/* dropdown — dashed outline with chevron */}
                  <div className="h-4 w-full rounded border border-dashed border-violet-400 dark:border-violet-500 bg-white dark:bg-violet-950/30 flex items-center justify-between px-1.5">
                    <div className="h-1 w-1/3 rounded-full bg-violet-300 dark:bg-violet-600" />
                    <svg
                      className="w-2 h-2 text-violet-400"
                      fill="none"
                      viewBox="0 0 8 8"
                      aria-hidden="true"
                    >
                      <path
                        d="M1 2.5l3 3 3-3"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  {/* radio buttons */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <div className="h-2.5 w-2.5 rounded-full border-2 border-violet-500 dark:border-violet-400 bg-violet-500 dark:bg-violet-400 flex items-center justify-center">
                        <div className="h-1 w-1 rounded-full bg-white" />
                      </div>
                      <div className="h-1 w-4 rounded-full bg-violet-200 dark:bg-violet-700" />
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="h-2.5 w-2.5 rounded-full border-2 border-violet-300 dark:border-violet-600 bg-white dark:bg-transparent" />
                      <div className="h-1 w-4 rounded-full bg-violet-200 dark:bg-violet-700" />
                    </div>
                  </div>
                  {/* checkbox row — checked */}
                  <div className="flex items-center gap-1.5">
                    <div className="h-3 w-3 rounded border-2 border-violet-500 dark:border-violet-400 bg-violet-500 dark:bg-violet-400 flex items-center justify-center">
                      <svg
                        className="w-2 h-2 text-white"
                        fill="none"
                        viewBox="0 0 8 8"
                        aria-hidden="true"
                      >
                        <path
                          d="M1.5 4l2 2 3-3"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <div className="h-1 w-2/3 rounded-full bg-violet-200 dark:bg-violet-700" />
                  </div>
                  {/* button */}
                  <div className="h-4 w-2/3 rounded border border-violet-400 dark:border-violet-500 bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
                    <div className="h-1 w-1/2 rounded-full bg-violet-500 dark:bg-violet-400" />
                  </div>
                </div>

                {/* After — flat */}
                <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 p-3 flex flex-col gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">
                    After
                  </p>
                  {/* title line */}
                  <div className="h-1.5 w-3/4 rounded-full bg-violet-700 dark:bg-violet-300" />
                  {/* body text */}
                  <div className="h-1 w-full rounded-full bg-violet-200 dark:bg-violet-700" />
                  {/* flattened text input — plain filled area */}
                  <div className="h-4 w-full rounded bg-violet-100 dark:bg-violet-900/40 flex items-center px-1.5">
                    <div className="h-1 w-2/5 rounded-full bg-violet-500 dark:bg-violet-400" />
                  </div>
                  {/* flattened dropdown — no chevron, just text */}
                  <div className="h-4 w-full rounded bg-violet-100 dark:bg-violet-900/40 flex items-center px-1.5">
                    <div className="h-1 w-1/3 rounded-full bg-violet-400 dark:bg-violet-500" />
                  </div>
                  {/* flattened radio — just solid dots + lines */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <div className="h-2.5 w-2.5 rounded-full bg-violet-300 dark:bg-violet-600" />
                      <div className="h-1 w-4 rounded-full bg-violet-200 dark:bg-violet-700" />
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="h-2.5 w-2.5 rounded-full bg-violet-200 dark:bg-violet-700" />
                      <div className="h-1 w-4 rounded-full bg-violet-200 dark:bg-violet-700" />
                    </div>
                  </div>
                  {/* flattened checkbox — solid square */}
                  <div className="flex items-center gap-1.5">
                    <div className="h-3 w-3 rounded bg-violet-300 dark:bg-violet-600" />
                    <div className="h-1 w-2/3 rounded-full bg-violet-200 dark:bg-violet-700" />
                  </div>
                  {/* button gone — just a muted line */}
                  <div className="h-4 w-2/3 rounded bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                    <div className="h-1 w-1/2 rounded-full bg-violet-300 dark:bg-violet-600" />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border p-4">
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text mb-1">
                  What flattening does
                </p>
                <ul className="text-sm text-slate-500 dark:text-dark-text-muted space-y-1 list-disc list-inside">
                  <li>Converts fillable form fields to plain text</li>
                  <li>Removes interactive checkboxes, dropdowns, and buttons</li>
                  <li>Makes the document non-editable</li>
                </ul>
              </div>

              <button
                type="button"
                onClick={handleFlatten}
                disabled={processing}
                className="w-full bg-violet-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {processing ? "Flattening..." : "Flatten PDF"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
                <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">
                  PDF flattened successfully. All form fields and annotations have been removed.
                </p>
              </div>

              <button
                type="button"
                onClick={handleDownload}
                className="w-full bg-violet-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-violet-700 transition-colors"
              >
                Download Flattened PDF
              </button>
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
