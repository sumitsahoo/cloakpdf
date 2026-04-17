/**
 * File Attachment tool.
 *
 * Allows users to view, add, extract, and remove file attachments
 * embedded in a PDF. Uses the @pdfme/pdf-lib attach() API.
 */

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, Paperclip, Plus, Trash2 } from "lucide-react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { InfoCallout } from "../components/InfoCallout.tsx";
import { ActionButton } from "../components/ActionButton.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import type { PdfAttachment } from "../utils/pdf-operations.ts";
import {
  attachFilesToPdf,
  listPdfAttachments,
  removeAttachmentsFromPdf,
} from "../utils/pdf-operations.ts";
import { downloadBlob, downloadPdf, formatFileSize } from "../utils/file-helpers.ts";

export default function FileAttachment() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [attachments, setAttachments] = useState<PdfAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load existing attachments when a PDF is selected
  useEffect(() => {
    if (!pdfFile) return;
    const currentFile = pdfFile;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const list = await listPdfAttachments(currentFile);
        if (!cancelled) setAttachments(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to read attachments.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [pdfFile]);

  const handlePdfFile = useCallback((files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setPdfFile(pdf);
    setAttachments([]);
    setError(null);
    setSuccess(null);
  }, []);

  const handleAddFiles = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!pdfFile || !e.target.files?.length) return;
      const filesToAttach = Array.from(e.target.files);
      setProcessing(true);
      setError(null);
      setSuccess(null);
      try {
        const data = await attachFilesToPdf(pdfFile, filesToAttach);
        const newFile = new window.File([data as BlobPart], pdfFile.name, {
          type: "application/pdf",
        });
        setPdfFile(newFile);
        const names = filesToAttach.map((f) => f.name);
        setSuccess(
          names.length === 1
            ? `Added "${names[0]}".`
            : `Added ${names.length} files: ${names.join(", ")}.`,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to attach files.");
      } finally {
        setProcessing(false);
        e.target.value = "";
      }
    },
    [pdfFile],
  );

  const handleRemove = useCallback(
    async (name: string) => {
      if (!pdfFile) return;
      setProcessing(true);
      setError(null);
      setSuccess(null);
      try {
        const data = await removeAttachmentsFromPdf(pdfFile, new Set([name]));
        const newFile = new window.File([data as BlobPart], pdfFile.name, {
          type: "application/pdf",
        });
        setPdfFile(newFile);
        setSuccess(`Removed "${name}".`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to remove attachment.");
      } finally {
        setProcessing(false);
      }
    },
    [pdfFile],
  );

  const handleExtract = useCallback((attachment: PdfAttachment) => {
    const blob = new Blob([attachment.data as BlobPart]);
    downloadBlob(blob, attachment.name);
  }, []);

  const handleDownloadPdf = useCallback(async () => {
    if (!pdfFile) return;
    const buf = await pdfFile.arrayBuffer();
    const baseName = pdfFile.name.replace(/\.pdf$/i, "");
    downloadPdf(new Uint8Array(buf), `${baseName}_attachments.pdf`);
  }, [pdfFile]);

  return (
    <div className="space-y-6">
      {!pdfFile ? (
        <FileDropZone
          glowColor={categoryGlow.organise}
          iconColor={categoryAccent.organise}
          accept=".pdf,application/pdf"
          onFiles={handlePdfFile}
          label="Drop a PDF file here"
          hint="View, add, extract, or remove embedded file attachments"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={pdfFile.name}
            details={formatFileSize(pdfFile.size)}
            onChangeFile={() => {
              setPdfFile(null);
              setAttachments([]);
              setSuccess(null);
              setError(null);
            }}
          />

          {loading ? (
            <LoadingSpinner color="border-blue-200 border-t-blue-600" />
          ) : (
            <div className="space-y-4">
              {/* Header with add button */}
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                  {attachments.length === 0
                    ? "No attachments found"
                    : `${attachments.length} attachment${attachments.length > 1 ? "s" : ""}`}
                </p>
                <label className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer transition-colors">
                  <Plus className="w-4 h-4" />
                  Add files
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleAddFiles}
                    disabled={processing}
                  />
                </label>
              </div>

              {/* Attachment list */}
              {attachments.length > 0 && (
                <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border divide-y divide-slate-100 dark:divide-dark-border">
                  {attachments.map((att, idx) => (
                    <div key={`${att.name}-${idx}`} className="p-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                        <Paperclip className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 dark:text-dark-text truncate">
                          {att.name}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {formatFileSize(att.size)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleExtract(att)}
                        title="Download attachment"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:text-emerald-400 dark:hover:bg-emerald-900/20 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(att.name)}
                        disabled={processing}
                        title="Remove attachment"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Info box */}
              <div className="bg-slate-50 dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border p-4">
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text mb-1">
                  About file attachments
                </p>
                <ul className="text-sm text-slate-500 dark:text-dark-text-muted space-y-1 list-disc list-inside">
                  <li>Attach any file type — images, documents, spreadsheets, etc.</li>
                  <li>
                    Attachments are embedded inside the PDF and visible in the attachments panel
                  </li>
                  <li>Extract individual files or remove them from the PDF</li>
                </ul>
              </div>

              {/* Download modified PDF */}
              <ActionButton
                onClick={handleDownloadPdf}
                processing={processing}
                label="Download PDF"
                processingLabel="Processing..."
                color="bg-blue-600 hover:bg-blue-700"
              />
            </div>
          )}
        </>
      )}

      {success && (
        <InfoCallout icon={CheckCircle2} accent="organise">
          {success}
        </InfoCallout>
      )}

      {error && <AlertBox variant="error" message={error} />}
    </div>
  );
}
