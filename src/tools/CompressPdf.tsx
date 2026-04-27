/**
 * Compress PDF tool.
 *
 * Offers three compression levels (Light / Balanced / Maximum). After
 * compression, shows a summary comparing original vs. compressed size
 * and the percentage saved. The compressed file can then be downloaded.
 */

import { Gauge } from "lucide-react";
import { useCallback, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { ProgressBar } from "../components/ProgressBar.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { usePdfFile } from "../hooks/usePdfFile.ts";
import { useToolOutput } from "../hooks/useToolOutput.ts";
import { formatFileSize } from "../utils/file-helpers.ts";
import { compressPdf } from "../utils/pdf-operations.ts";

export default function CompressPdf() {
  const [quality, setQuality] = useState<"low" | "medium" | "high">("medium");
  const [result, setResult] = useState<{
    original: number;
    compressed: number;
    data: Uint8Array;
  } | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const pdf = usePdfFile({
    onReset: () => setResult(null),
  });
  const task = useAsyncProcess();
  const output = useToolOutput();
  const processing = task.processing;
  const error = task.error;

  /** Compress the PDF at the selected quality preset and store the result for download. */
  const handleCompress = useCallback(async () => {
    if (!pdf.file) return;
    const file = pdf.file;
    const ok = await task.run(async () => {
      const data = await compressPdf(file, quality, (current, total) =>
        setProgress({ current, total }),
      );
      // Workflow mode bypasses the savings panel — the user picked a
      // quality preset, the result is the result, advance the runner.
      if (output.inWorkflow) {
        output.deliver(data, "_compressed", file);
      } else {
        setResult({ original: file.size, compressed: data.length, data });
      }
    }, "Failed to compress PDF. Please try again.");
    void ok;
    setProgress(null);
  }, [pdf.file, quality, task, output]);

  const handleDownload = useCallback(() => {
    if (!result || !pdf.file) return;
    output.deliver(result.data, "_compressed", pdf.file);
  }, [result, pdf.file, output]);

  // Clamp to 0 so we never show negative savings when the output is larger
  const savings = result
    ? Math.max(0, Math.round(((result.original - result.compressed) / result.original) * 100))
    : 0;

  return (
    <div className="space-y-6">
      {!pdf.file ? (
        <FileDropZone
          glowColor={categoryGlow.transform}
          iconColor={categoryAccent.transform}
          accept=".pdf,application/pdf"
          onFiles={pdf.onFiles}
          label="Drop a PDF file here"
          hint="We'll optimize the file structure to reduce size"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={pdf.file.name}
            details={formatFileSize(pdf.file.size)}
            onChangeFile={pdf.reset}
          />

          {!result ? (
            <div className="space-y-4">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-dark-text-muted mb-2">
                  <Gauge className="w-3.5 h-3.5" />
                  Compression Level
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    {
                      value: "low" as const,
                      label: "Light",
                      desc: "Best quality, less compression",
                      blur: "blur(0px)",
                    },
                    {
                      value: "medium" as const,
                      label: "Balanced",
                      desc: "Good balance of size & quality",
                      blur: "blur(0.4px)",
                    },
                    {
                      value: "high" as const,
                      label: "Maximum",
                      desc: "Smallest file, lower quality",
                      blur: "blur(0.9px)",
                    },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setQuality(opt.value)}
                      className={`p-3 rounded-xl border-2 text-left transition-all duration-150 ${
                        quality === opt.value
                          ? "border-primary-500 bg-primary-50 dark:bg-primary-900/30 ring-1 ring-primary-300 dark:ring-primary-700"
                          : "border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-dark-surface-alt"
                      }`}
                    >
                      {/* Mini document preview showing sharpness */}
                      <div className="mb-2.5 rounded-md overflow-hidden border border-primary-100 dark:border-primary-900/50 bg-primary-50/40 dark:bg-primary-900/20 w-full aspect-video flex flex-col p-1.5 gap-1">
                        <div
                          className="w-full h-1.5 rounded-full bg-primary-700 dark:bg-primary-300"
                          style={{ filter: opt.blur }}
                        />
                        <div
                          className="w-4/5 h-1.5 rounded-full bg-primary-400 dark:bg-primary-500"
                          style={{ filter: opt.blur }}
                        />
                        <div
                          className="w-full h-1.5 rounded-full bg-primary-200 dark:bg-primary-700"
                          style={{ filter: opt.blur }}
                        />
                        <div
                          className="w-3/5 h-1.5 rounded-full bg-primary-200 dark:bg-primary-700"
                          style={{ filter: opt.blur }}
                        />
                        <div
                          className="mt-0.5 w-full h-5 rounded bg-primary-100 dark:bg-primary-900/50"
                          style={{ filter: opt.blur }}
                        />
                        <div
                          className="w-full h-1.5 rounded-full bg-primary-200 dark:bg-primary-700"
                          style={{ filter: opt.blur }}
                        />
                        <div
                          className="w-2/3 h-1.5 rounded-full bg-primary-200 dark:bg-primary-700"
                          style={{ filter: opt.blur }}
                        />
                      </div>
                      <p
                        className={`text-sm font-semibold ${quality === opt.value ? "text-primary-700 dark:text-primary-300" : "text-slate-700 dark:text-dark-text"}`}
                      >
                        {opt.label}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-dark-text-muted mt-0.5 leading-snug">
                        {opt.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {processing && progress && (
                <ProgressBar
                  current={progress.current}
                  total={progress.total}
                  label="Processing pages…"
                />
              )}

              <ActionButton
                onClick={handleCompress}
                processing={processing}
                label="Compress PDF"
                processingLabel="Compressing... (this may take a moment)"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border p-6">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-dark-text-muted">Original</p>
                    <p className="text-xl font-bold text-slate-800 dark:text-dark-text">
                      {formatFileSize(result.original)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-dark-text-muted">Compressed</p>
                    <p className="text-xl font-bold text-emerald-600">
                      {formatFileSize(result.compressed)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-dark-text-muted">Saved</p>
                    <p
                      className={`text-xl font-bold ${savings > 0 ? "text-emerald-600" : "text-slate-500 dark:text-dark-text-muted"}`}
                    >
                      {savings}%
                    </p>
                  </div>
                </div>
                {savings === 0 && (
                  <p className="text-sm text-slate-500 dark:text-dark-text-muted text-center mt-4">
                    This file is already well optimized. The output is about the same size.
                  </p>
                )}
              </div>

              <ActionButton
                onClick={handleDownload}
                processing={false}
                label="Download Compressed PDF"
                processingLabel=""
              />
            </div>
          )}
        </>
      )}

      {error && <AlertBox message={error} />}
    </div>
  );
}
