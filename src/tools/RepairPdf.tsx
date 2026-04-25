/**
 * Repair PDF tool.
 *
 * Re-loads a PDF through pdf-lib with lenient parsing (throwOnInvalidObject:false)
 * and re-saves it. This rebuilds the cross-reference table, removes redundant or
 * corrupt objects, and produces a structurally clean file without touching the
 * visible content.
 */

import { CheckCircle2, ShieldOff } from "lucide-react";
import { useCallback, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { InfoCallout } from "../components/InfoCallout.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { usePdfFile } from "../hooks/usePdfFile.ts";
import { downloadPdf, formatFileSize, pdfFilename } from "../utils/file-helpers.ts";
import { repairPdf } from "../utils/pdf-operations.ts";

export default function RepairPdf() {
  const [sizeAfter, setSizeAfter] = useState(0);
  const [done, setDone] = useState(false);

  const pdf = usePdfFile({
    onReset: () => {
      setSizeAfter(0);
      setDone(false);
    },
  });
  const task = useAsyncProcess();

  const handleRepair = useCallback(async () => {
    if (!pdf.file) return;
    const file = pdf.file;
    setDone(false);
    const ok = await task.run(async () => {
      const result = await repairPdf(file);
      setSizeAfter(result.byteLength);
      downloadPdf(result, pdfFilename(file, "_repaired"));
    }, "Failed to repair PDF. The file may be severely corrupted.");
    if (ok) setDone(true);
  }, [pdf.file, task]);

  return (
    <div className="space-y-6">
      <FileDropZone
        glowColor={categoryGlow.transform}
        iconColor={categoryAccent.transform}
        accept=".pdf,application/pdf"
        onFiles={pdf.onFiles}
        label="Drop a PDF file here"
        hint="Re-save the PDF through pdf-lib to fix structural issues"
      />

      {pdf.file && (
        <>
          <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border divide-y divide-slate-100 dark:divide-dark-border">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium text-slate-600 dark:text-dark-text-muted">
                File
              </span>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-800 dark:text-dark-text truncate max-w-48">
                  {pdf.file.name}
                </span>
                <button
                  type="button"
                  onClick={pdf.reset}
                  className="text-xs text-primary-600 hover:text-primary-700 shrink-0"
                >
                  Change
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium text-slate-600 dark:text-dark-text-muted">
                Original size
              </span>
              <span className="text-sm text-slate-800 dark:text-dark-text">
                {formatFileSize(pdf.file.size)}
              </span>
            </div>
            {sizeAfter > 0 && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium text-slate-600 dark:text-dark-text-muted">
                  Repaired size
                </span>
                <span className="text-sm text-slate-800 dark:text-dark-text">
                  {formatFileSize(sizeAfter)}
                </span>
              </div>
            )}
          </div>

          <InfoCallout icon={ShieldOff} title="Encryption will be removed" accent="warning">
            Repair re-builds the PDF structure from scratch. Content (text, images, forms) is
            preserved, but any password protection or encryption is stripped so the output is
            unprotected.
          </InfoCallout>

          <ActionButton
            onClick={handleRepair}
            processing={task.processing}
            label="Repair & Download PDF"
            processingLabel="Repairing..."
          />

          {done && (
            <InfoCallout icon={CheckCircle2} accent="transform">
              PDF repaired successfully. The file has been downloaded.
            </InfoCallout>
          )}
        </>
      )}

      {(pdf.loadError || task.error) && <AlertBox message={pdf.loadError ?? task.error ?? ""} />}
    </div>
  );
}
