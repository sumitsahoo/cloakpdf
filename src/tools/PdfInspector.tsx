/**
 * PDF Inspector tool.
 *
 * Reads technical information from a PDF without modifying it:
 * version, page count, file size, encryption status, metadata,
 * and per-page dimensions. No download — purely informational.
 */

import {
  Bookmark,
  BookOpen,
  Building2,
  FileCode2,
  FileText,
  HardDrive,
  Lock,
  LockOpen,
  type LucideIcon,
  Ruler,
  Tag,
  User,
  Wrench,
} from "lucide-react";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { usePdfFile } from "../hooks/usePdfFile.ts";
import { formatFileSize } from "../utils/file-helpers.ts";
import { getPdfInfo } from "../utils/pdf-operations.ts";
import type { PdfInfo } from "../utils/pdf-operations.ts";

const PT_TO_MM = 0.352778;

function InfoRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 py-3 px-4">
      <span className="text-sm font-medium text-slate-500 dark:text-dark-text-muted sm:w-40 shrink-0 flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />}
        {label}
      </span>
      <span className="text-sm text-slate-800 dark:text-dark-text break-all">{value}</span>
    </div>
  );
}

export default function PdfInspector() {
  const pdf = usePdfFile<PdfInfo>({
    load: getPdfInfo,
    loadErrorMessage: "Failed to read PDF information.",
  });

  const info = pdf.data;
  const fileName = pdf.file?.name ?? "";

  return (
    <div className="space-y-6">
      <FileDropZone
        glowColor={categoryGlow.security}
        iconColor={categoryAccent.security}
        accept=".pdf,application/pdf"
        onFiles={pdf.onFiles}
        label="Drop a PDF file here"
        hint="Inspect version, page count, dimensions, metadata, and more"
      />

      {pdf.loading && <LoadingSpinner color="border-amber-200 border-t-amber-600" />}

      {info && !pdf.loading && (
        <div className="space-y-4">
          {/* Document summary */}
          <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border divide-y divide-slate-100 dark:divide-dark-border">
            <div className="px-4 py-2.5 bg-slate-50 dark:bg-dark-surface-alt rounded-t-xl flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              <p className="text-xs font-semibold text-slate-500 dark:text-dark-text-muted uppercase tracking-wide">
                Document
              </p>
            </div>
            <InfoRow icon={FileText} label="File name" value={fileName} />
            <InfoRow icon={HardDrive} label="File size" value={formatFileSize(info.fileSize)} />
            <InfoRow icon={FileCode2} label="PDF version" value={info.version} />
            <InfoRow icon={BookOpen} label="Page count" value={info.pageCount} />
            <InfoRow
              icon={info.isEncrypted ? Lock : LockOpen}
              label="Encrypted"
              value={
                info.isEncrypted ? (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                    Yes
                  </span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">No</span>
                )
              }
            />
          </div>

          {/* Metadata */}
          {(info.title || info.author || info.subject || info.creator || info.producer) && (
            <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border divide-y divide-slate-100 dark:divide-dark-border">
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-dark-surface-alt rounded-t-xl flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                <p className="text-xs font-semibold text-slate-500 dark:text-dark-text-muted uppercase tracking-wide">
                  Metadata
                </p>
              </div>
              {info.title && <InfoRow icon={Bookmark} label="Title" value={info.title} />}
              {info.author && <InfoRow icon={User} label="Author" value={info.author} />}
              {info.subject && <InfoRow icon={FileText} label="Subject" value={info.subject} />}
              {info.creator && <InfoRow icon={Wrench} label="Creator" value={info.creator} />}
              {info.producer && <InfoRow icon={Building2} label="Producer" value={info.producer} />}
            </div>
          )}

          {/* Page dimensions */}
          {info.pages.length > 0 && (
            <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-dark-surface-alt flex items-center gap-1.5">
                <Ruler className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                <p className="text-xs font-semibold text-slate-500 dark:text-dark-text-muted uppercase tracking-wide">
                  Page Dimensions
                </p>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-dark-border">
                {info.pages.map((dim, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-sm text-slate-500 dark:text-dark-text-muted flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
                      Page {i + 1}
                    </span>
                    <span className="text-sm text-slate-800 dark:text-dark-text font-mono">
                      {dim.width.toFixed(0)} × {dim.height.toFixed(0)} pt
                      <span className="text-slate-400 dark:text-dark-text-muted ml-2 text-xs">
                        ({(dim.width * PT_TO_MM).toFixed(1)} × {(dim.height * PT_TO_MM).toFixed(1)}{" "}
                        mm)
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {pdf.loadError && <AlertBox message={pdf.loadError} />}
    </div>
  );
}
