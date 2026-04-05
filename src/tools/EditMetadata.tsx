/**
 * Edit Metadata tool.
 *
 * Allows users to view and edit all standard PDF metadata fields:
 * title, author, subject, keywords, creator, producer, creation date,
 * and modification date. The modified PDF can be downloaded.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Bookmark,
  Building2,
  CalendarClock,
  CalendarPlus,
  FileText,
  Tag,
  Undo2,
  User,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DateTimeInput } from "../components/DateTimeInput.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import type { PdfMetadata } from "../types.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";
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

export default function EditMetadata() {
  const [file, setFile] = useState<File | null>(null);
  const [originalMetadata, setOriginalMetadata] = useState<PdfMetadata | null>(null);
  const [metadata, setMetadata] = useState<PdfMetadata | null>(null);
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleFile = useCallback((files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setOriginalMetadata(null);
    setMetadata(null);
    setSaved(false);
    setError(null);
  }, []);

  // Load metadata when a file is selected
  useEffect(() => {
    if (!file) return;
    const currentFile = file;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const meta = await getPdfMetadata(currentFile);
        if (!cancelled) {
          setOriginalMetadata(meta);
          setMetadata(meta);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to read metadata.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [file]);

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

  const handleSave = useCallback(async () => {
    if (!file || !metadata) return;
    setProcessing(true);
    setError(null);
    try {
      const data = await setPdfMetadata(file, metadata);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(data, `${baseName}_metadata.pdf`);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update metadata.");
    } finally {
      setProcessing(false);
    }
  }, [file, metadata]);

  const isDirty =
    metadata !== null &&
    originalMetadata !== null &&
    METADATA_FIELDS.some((f) => metadata[f.key] !== originalMetadata[f.key]);

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          glowColor={categoryGlow.security}
          iconColor={categoryAccent.security}
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="View and edit document metadata properties"
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
                setOriginalMetadata(null);
                setMetadata(null);
                setSaved(false);
              }}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              Change file
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
            </div>
          ) : metadata ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                  Edit document properties below
                </p>
                {isDirty && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-dark-text-muted dark:hover:text-dark-text transition-colors"
                  >
                    <Undo2 className="w-4 h-4" />
                    Reset
                  </button>
                )}
              </div>
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border divide-y divide-slate-100 dark:divide-dark-border">
                {METADATA_FIELDS.map((field) => {
                  const isFieldDirty =
                    originalMetadata !== null &&
                    metadata[field.key] !== originalMetadata[field.key];
                  return (
                    <div
                      key={field.key}
                      className={`p-4 flex flex-col sm:flex-row sm:items-center gap-2 transition-colors ${isFieldDirty ? "bg-amber-50/60 dark:bg-amber-900/10" : ""}`}
                    >
                      <label
                        htmlFor={`meta-${field.key}`}
                        className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-dark-text sm:w-44 shrink-0"
                      >
                        <field.icon
                          className={`w-4 h-4 transition-colors ${isFieldDirty ? "text-amber-500 dark:text-amber-400" : "text-amber-600 dark:text-amber-400"}`}
                        />
                        {field.label}
                        {isFieldDirty && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 ml-auto" />
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

              <button
                type="button"
                onClick={handleSave}
                disabled={processing || !isDirty}
                className="w-full bg-amber-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {processing ? "Saving..." : "Save & Download PDF"}
              </button>

              {saved && (
                <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">
                    ✅ Metadata updated and PDF downloaded successfully.
                  </p>
                </div>
              )}
            </div>
          ) : null}
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
