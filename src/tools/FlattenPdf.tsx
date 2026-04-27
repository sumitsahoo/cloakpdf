/**
 * Flatten PDF tool.
 *
 * Removes all interactive form fields and annotations from a PDF,
 * converting them to static content. Useful for locking down filled
 * forms before sharing.
 */

import { CheckCircle2 } from "lucide-react";
import { useCallback, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { InfoCallout } from "../components/InfoCallout.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { usePdfFile } from "../hooks/usePdfFile.ts";
import { useToolOutput } from "../hooks/useToolOutput.ts";
import { formatFileSize } from "../utils/file-helpers.ts";
import { flattenPdf } from "../utils/pdf-operations.ts";

export default function FlattenPdf() {
  const [result, setResult] = useState<Uint8Array | null>(null);

  const pdf = usePdfFile({ onReset: () => setResult(null) });
  const task = useAsyncProcess();
  const output = useToolOutput();

  const handleFlatten = useCallback(async () => {
    if (!pdf.file) return;
    const file = pdf.file;
    await task.run(async () => {
      const data = await flattenPdf(file);
      // In workflow mode, skip the success/download panel and forward
      // straight to the next step — keeps the runner moving.
      if (output.inWorkflow) {
        output.deliver(data, "_flattened", file);
      } else {
        setResult(data);
      }
    }, "Failed to flatten PDF. Please try again.");
  }, [pdf.file, task, output]);

  const handleDownload = useCallback(() => {
    if (!result || !pdf.file) return;
    output.deliver(result, "_flattened", pdf.file);
  }, [result, pdf.file, output]);

  return (
    <div className="space-y-6">
      {!pdf.file ? (
        <FileDropZone
          glowColor={categoryGlow.transform}
          iconColor={categoryAccent.transform}
          accept=".pdf,application/pdf"
          onFiles={pdf.onFiles}
          label="Drop a PDF file here"
          hint="Form fields and annotations will be converted to static content"
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
              {/* Visual: before → after flattening */}
              <div className="grid grid-cols-2 gap-3">
                {/* Before — interactive */}
                <div className="rounded-xl border border-primary-100 dark:border-primary-900/50 bg-primary-50/40 dark:bg-primary-900/20 p-3 flex flex-col gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-primary-400 dark:text-primary-500">
                    Before
                  </p>
                  {/* title line */}
                  <div className="h-1.5 w-3/4 rounded-full bg-primary-700 dark:bg-primary-300" />
                  {/* body text */}
                  <div className="h-1 w-full rounded-full bg-primary-200 dark:bg-primary-700" />
                  {/* text input — dashed outline with cursor */}
                  <div className="h-4 w-full rounded border border-dashed border-primary-400 dark:border-primary-500 bg-white dark:bg-primary-900/30 flex items-center px-1.5 gap-0.5">
                    <div className="h-1 w-2/5 rounded-full bg-primary-300 dark:bg-primary-600" />
                    <div className="h-2.5 w-px bg-primary-500 dark:bg-primary-400" />
                  </div>
                  {/* dropdown — dashed outline with chevron */}
                  <div className="h-4 w-full rounded border border-dashed border-primary-400 dark:border-primary-500 bg-white dark:bg-primary-900/30 flex items-center justify-between px-1.5">
                    <div className="h-1 w-1/3 rounded-full bg-primary-300 dark:bg-primary-600" />
                    <svg
                      className="w-2 h-2 text-primary-400"
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
                      <div className="h-2.5 w-2.5 rounded-full border-2 border-primary-500 dark:border-primary-400 bg-primary-500 dark:bg-primary-400 flex items-center justify-center">
                        <div className="h-1 w-1 rounded-full bg-white" />
                      </div>
                      <div className="h-1 w-4 rounded-full bg-primary-200 dark:bg-primary-700" />
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="h-2.5 w-2.5 rounded-full border-2 border-primary-300 dark:border-primary-600 bg-white dark:bg-transparent" />
                      <div className="h-1 w-4 rounded-full bg-primary-200 dark:bg-primary-700" />
                    </div>
                  </div>
                  {/* checkbox row — checked */}
                  <div className="flex items-center gap-1.5">
                    <div className="h-3 w-3 rounded border-2 border-primary-500 dark:border-primary-400 bg-primary-500 dark:bg-primary-400 flex items-center justify-center">
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
                    <div className="h-1 w-2/3 rounded-full bg-primary-200 dark:bg-primary-700" />
                  </div>
                  {/* button */}
                  <div className="h-4 w-2/3 rounded border border-primary-400 dark:border-primary-500 bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
                    <div className="h-1 w-1/2 rounded-full bg-primary-500 dark:bg-primary-400" />
                  </div>
                </div>

                {/* After — flat */}
                <div className="rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 p-3 flex flex-col gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-primary-600 dark:text-primary-400">
                    After
                  </p>
                  {/* title line */}
                  <div className="h-1.5 w-3/4 rounded-full bg-primary-700 dark:bg-primary-300" />
                  {/* body text */}
                  <div className="h-1 w-full rounded-full bg-primary-200 dark:bg-primary-700" />
                  {/* flattened text input — plain filled area */}
                  <div className="h-4 w-full rounded bg-primary-100 dark:bg-primary-900/40 flex items-center px-1.5">
                    <div className="h-1 w-2/5 rounded-full bg-primary-500 dark:bg-primary-400" />
                  </div>
                  {/* flattened dropdown — no chevron, just text */}
                  <div className="h-4 w-full rounded bg-primary-100 dark:bg-primary-900/40 flex items-center px-1.5">
                    <div className="h-1 w-1/3 rounded-full bg-primary-400 dark:bg-primary-500" />
                  </div>
                  {/* flattened radio — just solid dots + lines */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <div className="h-2.5 w-2.5 rounded-full bg-primary-300 dark:bg-primary-600" />
                      <div className="h-1 w-4 rounded-full bg-primary-200 dark:bg-primary-700" />
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="h-2.5 w-2.5 rounded-full bg-primary-200 dark:bg-primary-700" />
                      <div className="h-1 w-4 rounded-full bg-primary-200 dark:bg-primary-700" />
                    </div>
                  </div>
                  {/* flattened checkbox — solid square */}
                  <div className="flex items-center gap-1.5">
                    <div className="h-3 w-3 rounded bg-primary-300 dark:bg-primary-600" />
                    <div className="h-1 w-2/3 rounded-full bg-primary-200 dark:bg-primary-700" />
                  </div>
                  {/* button gone — just a muted line */}
                  <div className="h-4 w-2/3 rounded bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                    <div className="h-1 w-1/2 rounded-full bg-primary-300 dark:bg-primary-600" />
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

              <ActionButton
                onClick={handleFlatten}
                processing={task.processing}
                label="Flatten PDF"
                processingLabel="Flattening..."
              />
            </div>
          ) : (
            <div className="space-y-4">
              <InfoCallout icon={CheckCircle2} accent="transform">
                PDF flattened successfully. All form fields and annotations have been removed.
              </InfoCallout>

              <ActionButton
                onClick={handleDownload}
                processing={false}
                label="Download Flattened PDF"
                processingLabel=""
              />
            </div>
          )}
        </>
      )}

      {(pdf.loadError || task.error) && <AlertBox message={pdf.loadError ?? task.error ?? ""} />}
    </div>
  );
}
