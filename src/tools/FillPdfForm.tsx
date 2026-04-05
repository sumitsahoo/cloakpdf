/**
 * Fill PDF Form tool.
 *
 * Renders all PDF pages as thumbnails. The user selects a page to see and fill
 * its form fields. Field values are kept in memory across page switches so the
 * full document can be downloaded in one go.
 *
 * ## Field ordering
 * PDF form fields are stored in document-internal order, which rarely matches
 * their visual layout. To present fields in the same top-to-bottom sequence the
 * user sees on screen, we resolve each field's position from the page's widget
 * annotations (`getFieldPageIndices`) and then sort by:
 *   1. Page index ascending  — fields on earlier pages come first.
 *   2. y-coordinate descending — within a page, higher widget positions
 *      (i.e. closer to the top) come first.  PDF coordinate origin is
 *      bottom-left, so a larger y value means nearer to the top of the page.
 */

import { useState, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { fillPdfForm, getFieldPageIndices } from "../utils/pdf-operations.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";

type FieldType = "text" | "checkbox" | "dropdown" | "radio" | "other";

interface FieldInfo {
  name: string;
  type: FieldType;
  defaultValue: string | boolean;
  options?: string[];
  multiline?: boolean;
  /** 0-based index of the page that contains this field's widget annotation. */
  pageIndex: number;
  /**
   * Top edge of the widget's bounding box in PDF user-space units (ury from
   * the annotation Rect array).  Higher values are closer to the top of the
   * page because PDF coordinates originate at the bottom-left corner.
   * Used together with `pageIndex` to sort fields in reading order.
   */
  y: number;
}

export default function FillPdfForm() {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [thumbnailIds, setThumbnailIds] = useState<string[]>([]);
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string | boolean>>({});
  const [flatten, setFlatten] = useState(false);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setThumbnails([]);
    setThumbnailIds([]);
    setSelectedPage(null);
    setFields([]);
    setFieldValues({});
    setError(null);
    setLoading(true);

    try {
      const { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } =
        await import("pdf-lib");

      const [thumbs, fieldPageMap, arrayBuffer] = await Promise.all([
        renderAllThumbnails(pdf),
        getFieldPageIndices(pdf),
        pdf.arrayBuffer(),
      ]);

      setThumbnails(thumbs);
      setThumbnailIds(thumbs.map((_, i) => `thumb-${i}-${Date.now()}`));

      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const form = pdfDoc.getForm();
      const rawFields = form.getFields();

      const infos: FieldInfo[] = rawFields
        .map((field) => {
          const name = field.getName();
          const pos = fieldPageMap.get(name);
          const pageIndex = pos?.pageIndex ?? 0;
          const y = pos?.y ?? 0;
          if (field instanceof PDFTextField) {
            return {
              name,
              type: "text" as FieldType,
              defaultValue: field.getText() ?? "",
              multiline: field.isMultiline(),
              pageIndex,
              y,
            };
          }
          if (field instanceof PDFCheckBox) {
            return {
              name,
              type: "checkbox" as FieldType,
              defaultValue: field.isChecked(),
              pageIndex,
              y,
            };
          }
          if (field instanceof PDFDropdown) {
            return {
              name,
              type: "dropdown" as FieldType,
              defaultValue: field.getSelected()[0] ?? "",
              options: field.getOptions(),
              pageIndex,
              y,
            };
          }
          if (field instanceof PDFRadioGroup) {
            return {
              name,
              type: "radio" as FieldType,
              defaultValue: field.getSelected() ?? "",
              options: field.getOptions(),
              pageIndex,
              y,
            };
          }
          return { name, type: "other" as FieldType, defaultValue: "", pageIndex, y };
        })
        .filter((f) => f.type !== "other") as FieldInfo[];
      // Sort fields by their visual position: top-to-bottom within each page,
      // pages in document order. PDF y-coordinates origin is bottom-left, so a
      // higher y value means the widget sits closer to the top of the page.
      infos.sort((a, b) => a.pageIndex - b.pageIndex || b.y - a.y);

      setFields(infos);
      setFieldValues(Object.fromEntries(infos.map((f) => [f.name, f.defaultValue])));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to load form fields. The file may be corrupted or password-protected.",
      );
      setFile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFill = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    try {
      const result = await fillPdfForm(file, fieldValues, flatten);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_filled.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fill PDF. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file, fieldValues, flatten]);

  // Count fields per page for thumbnail badges.
  const fieldCountByPage = fields.reduce<Record<number, number>>((acc, f) => {
    acc[f.pageIndex] = (acc[f.pageIndex] ?? 0) + 1;
    return acc;
  }, {});

  const pageFields =
    selectedPage !== null ? fields.filter((f) => f.pageIndex === selectedPage) : [];

  const totalFields = fields.length;

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          glowColor={categoryGlow.annotate}
          iconColor={categoryAccent.annotate}
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="PDF must contain interactive form fields"
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
                setThumbnails([]);
                setThumbnailIds([]);
                setSelectedPage(null);
                setFields([]);
                setFieldValues({});
              }}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              Change file
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Page selector */}
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text mb-2">
                  {totalFields === 0
                    ? "No fillable form fields found in this PDF"
                    : "Select a page to fill its fields"}
                </p>

                {totalFields === 0 ? (
                  <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                      This PDF does not contain interactive form fields. Use the Add Watermark or
                      Add Signature tools to annotate it instead.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                    {thumbnails.map((thumb, i) => {
                      const count = fieldCountByPage[i] ?? 0;
                      const isSelected = selectedPage === i;
                      return (
                        <button
                          key={thumbnailIds[i] ?? i}
                          type="button"
                          onClick={() => setSelectedPage(i)}
                          className={`flex flex-col items-center gap-1 p-1 rounded-lg border-2 transition-colors ${
                            isSelected
                              ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                              : "border-transparent hover:border-slate-200 dark:hover:border-dark-border"
                          }`}
                        >
                          <div className="relative w-full aspect-3/4">
                            <img
                              src={thumb}
                              className="w-full h-full object-cover rounded"
                              alt={`Page ${i + 1}`}
                            />
                            {count > 0 && (
                              <span className="absolute top-0.5 right-0.5 bg-emerald-600 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                                {count}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 dark:text-dark-text-muted">
                            {i + 1}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Fields for selected page */}
              {selectedPage !== null && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                    Page {selectedPage + 1} —{" "}
                    {pageFields.length === 0
                      ? "no form fields"
                      : `${pageFields.length} field${pageFields.length !== 1 ? "s" : ""}`}
                  </p>

                  {pageFields.length === 0 ? (
                    <div className="bg-slate-50 dark:bg-dark-surface border border-slate-200 dark:border-dark-border rounded-xl p-4 text-sm text-slate-500 dark:text-dark-text-muted">
                      This page has no interactive form fields. Select a page with a badge to fill
                      its fields.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {pageFields.map((field) => (
                        <div key={field.name}>
                          <label className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1">
                            {field.name}
                          </label>

                          {field.type === "text" && (
                            <>
                              {field.multiline ? (
                                <textarea
                                  value={(fieldValues[field.name] as string) ?? ""}
                                  onChange={(e) =>
                                    setFieldValues((prev) => ({
                                      ...prev,
                                      [field.name]: e.target.value,
                                    }))
                                  }
                                  rows={3}
                                  className="w-full border border-slate-300 dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-white dark:bg-dark-surface text-slate-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                                />
                              ) : (
                                <input
                                  type="text"
                                  value={(fieldValues[field.name] as string) ?? ""}
                                  onChange={(e) =>
                                    setFieldValues((prev) => ({
                                      ...prev,
                                      [field.name]: e.target.value,
                                    }))
                                  }
                                  className="w-full border border-slate-300 dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-white dark:bg-dark-surface text-slate-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary-500"
                                />
                              )}
                            </>
                          )}

                          {field.type === "checkbox" && (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={(fieldValues[field.name] as boolean) ?? false}
                                onChange={(e) =>
                                  setFieldValues((prev) => ({
                                    ...prev,
                                    [field.name]: e.target.checked,
                                  }))
                                }
                                className="w-4 h-4 text-primary-600 rounded"
                              />
                              <span className="text-sm text-slate-600 dark:text-dark-text-muted">
                                Checked
                              </span>
                            </label>
                          )}

                          {field.type === "dropdown" && field.options && (
                            <div className="relative">
                              <select
                                value={(fieldValues[field.name] as string) ?? ""}
                                onChange={(e) =>
                                  setFieldValues((prev) => ({
                                    ...prev,
                                    [field.name]: e.target.value,
                                  }))
                                }
                                className="w-full appearance-none border border-slate-300 dark:border-dark-border rounded-lg pl-3 pr-9 py-2 text-sm bg-white dark:bg-dark-surface text-slate-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
                              >
                                <option value="">— Select —</option>
                                {field.options.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 dark:text-dark-text-muted">
                                <ChevronDown className="w-4 h-4" />
                              </div>
                            </div>
                          )}

                          {field.type === "radio" && field.options && (
                            <div className="flex flex-wrap gap-4">
                              {field.options.map((opt) => (
                                <label key={opt} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    name={field.name}
                                    value={opt}
                                    checked={(fieldValues[field.name] as string) === opt}
                                    onChange={() =>
                                      setFieldValues((prev) => ({ ...prev, [field.name]: opt }))
                                    }
                                    className="w-4 h-4 text-primary-600"
                                  />
                                  <span className="text-sm text-slate-600 dark:text-dark-text-muted">
                                    {opt}
                                  </span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Flatten + download — shown whenever there are fields */}
              {totalFields > 0 && (
                <div className="space-y-3">
                  <div className="bg-slate-50 dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border p-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={flatten}
                        onChange={(e) => setFlatten(e.target.checked)}
                        className="w-4 h-4 text-primary-600 rounded"
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                          Flatten after filling
                        </p>
                        <p className="text-xs text-slate-400 dark:text-dark-text-muted">
                          Converts form fields to static text — the PDF will no longer be editable
                        </p>
                      </div>
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={handleFill}
                    disabled={processing}
                    className="w-full bg-emerald-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {processing ? "Filling…" : "Fill & Download PDF"}
                  </button>
                </div>
              )}
            </>
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
