/**
 * Edit Metadata tool.
 *
 * Allows users to view and edit all standard PDF metadata fields:
 * title, author, subject, keywords, creator, producer, creation date,
 * and modification date. Also supports one-click redaction of all
 * metadata for privacy. The modified PDF can be downloaded.
 */

import {
  Bookmark,
  Building2,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  FileText,
  type LucideIcon,
  ShieldOff,
  Tag,
  User,
  Wrench,
} from "lucide-react";
import { useCallback, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { DateTimeInput } from "../components/DateTimeInput.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { InfoCallout } from "../components/InfoCallout.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { ResetButton } from "../components/ResetButton.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { usePdfFile } from "../hooks/usePdfFile.ts";
import type { PdfMetadata } from "../types.ts";
import { downloadPdf, formatFileSize, pdfFilename } from "../utils/file-helpers.ts";
import { getPdfMetadata, setPdfMetadata } from "../utils/pdf-operations.ts";

/** Field configuration for rendering the metadata form. */
const METADATA_FIELDS: {
  key: keyof PdfMetadata;
  label: string;
  type: "text" | "datetime-local";
  placeholder: string;
  icon: LucideIcon;
}[] = [
  { key: "title", label: "Title", type: "text", placeholder: "Document title", icon: Bookmark },
  { key: "author", label: "Author", type: "text", placeholder: "Author name", icon: User },
  {
    key: "subject",
    label: "Subject",
    type: "text",
    placeholder: "Document subject",
    icon: FileText,
  },
  {
    key: "keywords",
    label: "Keywords",
    type: "text",
    placeholder: "Comma-separated keywords",
    icon: Tag,
  },
  {
    key: "creator",
    label: "Creator",
    type: "text",
    placeholder: "Creating application",
    icon: Wrench,
  },
  {
    key: "producer",
    label: "Producer",
    type: "text",
    placeholder: "PDF producer software",
    icon: Building2,
  },
  {
    key: "creationDate",
    label: "Creation Date",
    type: "datetime-local",
    placeholder: "",
    icon: CalendarPlus,
  },
  {
    key: "modificationDate",
    label: "Modification Date",
    type: "datetime-local",
    placeholder: "",
    icon: CalendarClock,
  },
];

/** All metadata fields cleared — used by the "Redact All" button. */
const BLANK_METADATA: PdfMetadata = {
  title: "",
  author: "",
  subject: "",
  keywords: "",
  creator: "",
  producer: "",
  creationDate: "",
  modificationDate: "",
};

export default function EditMetadata() {
  const [metadata, setMetadata] = useState<PdfMetadata | null>(null);
  const [saved, setSaved] = useState(false);

  const pdf = usePdfFile<PdfMetadata>({
    load: async (file) => {
      const meta = await getPdfMetadata(file);
      setMetadata(meta);
      return meta;
    },
    onReset: () => {
      setMetadata(null);
      setSaved(false);
    },
    loadErrorMessage: "Failed to read metadata.",
  });
  const task = useAsyncProcess();

  const originalMetadata = pdf.data;

  const handleFieldChange = useCallback(
    (key: keyof PdfMetadata, value: string) => {
      if (!metadata) return;
      setMetadata({ ...metadata, [key]: value });
      setSaved(false);
    },
    [metadata],
  );

  const handleReset = useCallback(() => {
    if (!originalMetadata) return;
    setMetadata(originalMetadata);
    setSaved(false);
  }, [originalMetadata]);

  const handleRedact = useCallback(() => {
    if (!metadata) return;
    setMetadata(BLANK_METADATA);
    setSaved(false);
  }, [metadata]);

  const handleSave = useCallback(async () => {
    if (!pdf.file || !metadata) return;
    const file = pdf.file;
    const ok = await task.run(async () => {
      const data = await setPdfMetadata(file, metadata);
      downloadPdf(data, pdfFilename(file, "_metadata"));
    }, "Failed to update metadata.");
    if (ok) setSaved(true);
  }, [pdf.file, metadata, task]);

  const isDirty =
    metadata !== null &&
    originalMetadata !== null &&
    METADATA_FIELDS.some((f) => metadata[f.key] !== originalMetadata[f.key]);

  return (
    <div className="space-y-6">
      {!pdf.file ? (
        <FileDropZone
          glowColor={categoryGlow.security}
          iconColor={categoryAccent.security}
          accept=".pdf,application/pdf"
          onFiles={pdf.onFiles}
          label="Drop a PDF file here"
          hint="View and edit document metadata properties"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={pdf.file.name}
            details={formatFileSize(pdf.file.size)}
            onChangeFile={pdf.reset}
          />

          {pdf.loading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : metadata ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                  Edit document properties below
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRedact}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 dark:border-red-700/60 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  >
                    <ShieldOff className="w-3.5 h-3.5" />
                    Redact All
                  </button>
                  {isDirty && <ResetButton onClick={handleReset} />}
                </div>
              </div>
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border divide-y divide-slate-100 dark:divide-dark-border">
                {METADATA_FIELDS.map((field) => {
                  const isFieldDirty =
                    originalMetadata !== null &&
                    metadata[field.key] !== originalMetadata[field.key];
                  return (
                    <div
                      key={field.key}
                      className={`p-4 flex flex-col sm:flex-row sm:items-center gap-2 transition-colors ${isFieldDirty ? "bg-primary-50/60 dark:bg-primary-900/10" : ""}`}
                    >
                      <label
                        htmlFor={`meta-${field.key}`}
                        className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-dark-text sm:w-44 shrink-0"
                      >
                        <field.icon
                          className={`w-4 h-4 transition-colors ${isFieldDirty ? "text-primary-500 dark:text-primary-400" : "text-primary-600 dark:text-primary-400"}`}
                        />
                        {field.label}
                        {isFieldDirty && (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary-500 dark:bg-primary-400 ml-auto" />
                        )}
                      </label>
                      {field.type === "datetime-local" ? (
                        <DateTimeInput
                          id={`meta-${field.key}`}
                          value={metadata[field.key]}
                          onChange={(v) => handleFieldChange(field.key, v)}
                        />
                      ) : (
                        <input
                          id={`meta-${field.key}`}
                          type="text"
                          value={metadata[field.key]}
                          placeholder={field.placeholder}
                          onChange={(e) => handleFieldChange(field.key, e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-bg text-sm text-slate-800 dark:text-dark-text placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <ActionButton
                onClick={handleSave}
                processing={task.processing}
                disabled={!isDirty}
                label="Save & Download PDF"
                processingLabel="Saving..."
              />

              {saved && (
                <InfoCallout icon={CheckCircle2} accent="security">
                  Metadata updated and PDF downloaded successfully.
                </InfoCallout>
              )}
            </div>
          ) : null}
        </>
      )}

      {(pdf.loadError || task.error) && <AlertBox message={pdf.loadError ?? task.error ?? ""} />}
    </div>
  );
}
