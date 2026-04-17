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

import { ChevronDown, FileX } from "lucide-react";
import { useCallback, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { InfoCallout } from "../components/InfoCallout.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { usePdfFile } from "../hooks/usePdfFile.ts";
import { downloadPdf, formatFileSize, pdfFilename } from "../utils/file-helpers.ts";
import { fillPdfForm, getFieldPageIndices } from "../utils/pdf-operations.ts";
import { renderAllThumbnails, revokeThumbnails } from "../utils/pdf-renderer.ts";

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

/** Shape produced by the loader: thumbnails + stable keys + parsed field list. */
interface LoadedForm {
  thumbnails: string[];
  thumbnailIds: string[];
  fields: FieldInfo[];
}

/**
 * Render thumbnails and parse form fields in a single pass. Fields are
 * sorted in visual reading order so the UI lists them consistently.
 */
async function loadForm(file: File): Promise<LoadedForm> {
  const { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } =
    await import("@pdfme/pdf-lib");

  const [thumbs, fieldPageMap, arrayBuffer] = await Promise.all([
    renderAllThumbnails(file),
    getFieldPageIndices(file),
    file.arrayBuffer(),
  ]);

  const pdfDoc = await PDFDocument.load(arrayBuffer);
  const form = pdfDoc.getForm();
  const rawFields = form.getFields();

  const infos: FieldInfo[] = rawFields
    .map((field): FieldInfo => {
      const name = field.getName();
      const pos = fieldPageMap.get(name);
      const pageIndex = pos?.pageIndex ?? 0;
      const y = pos?.y ?? 0;
      if (field instanceof PDFTextField) {
        return {
          name,
          type: "text",
          defaultValue: field.getText() ?? "",
          multiline: field.isMultiline(),
          pageIndex,
          y,
        };
      }
      if (field instanceof PDFCheckBox) {
        return { name, type: "checkbox", defaultValue: field.isChecked(), pageIndex, y };
      }
      if (field instanceof PDFDropdown) {
        return {
          name,
          type: "dropdown",
          defaultValue: field.getSelected()[0] ?? "",
          options: field.getOptions(),
          pageIndex,
          y,
        };
      }
      if (field instanceof PDFRadioGroup) {
        return {
          name,
          type: "radio",
          defaultValue: field.getSelected() ?? "",
          options: field.getOptions(),
          pageIndex,
          y,
        };
      }
      return { name, type: "other", defaultValue: "", pageIndex, y };
    })
    .filter((f) => f.type !== "other");

  // Sort fields by their visual position: top-to-bottom within each page,
  // pages in document order. PDF y-coordinates origin is bottom-left, so a
  // higher y value means the widget sits closer to the top of the page.
  infos.sort((a, b) => a.pageIndex - b.pageIndex || b.y - a.y);

  return {
    thumbnails: thumbs,
    thumbnailIds: thumbs.map((_, i) => `thumb-${i}-${Date.now()}`),
    fields: infos,
  };
}

export default function FillPdfForm() {
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string | boolean>>({});
  const [flatten, setFlatten] = useState(false);

  const pdf = usePdfFile<LoadedForm>({
    load: async (file) => {
      const loaded = await loadForm(file);
      // Initialise the controlled inputs with each field's current value.
      setFieldValues(Object.fromEntries(loaded.fields.map((f) => [f.name, f.defaultValue])));
      return loaded;
    },
    onReset: (data) => {
      revokeThumbnails(data?.thumbnails ?? []);
      setSelectedPage(null);
      setFieldValues({});
    },
    loadErrorMessage:
      "Failed to load form fields. The file may be corrupted or password-protected.",
  });
  const task = useAsyncProcess();

  const thumbnails = pdf.data?.thumbnails ?? [];
  const thumbnailIds = pdf.data?.thumbnailIds ?? [];
  const fields = pdf.data?.fields ?? [];
  const loading = pdf.loading;
  const processing = task.processing;
  const error = pdf.loadError ?? task.error;

  const handleFill = useCallback(async () => {
    if (!pdf.file) return;
    const file = pdf.file;
    await task.run(async () => {
      const result = await fillPdfForm(file, fieldValues, flatten);
      downloadPdf(result, pdfFilename(file, "_filled"));
    }, "Failed to fill PDF. Please try again.");
  }, [pdf.file, fieldValues, flatten, task]);

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
      {!pdf.file ? (
        <FileDropZone
          glowColor={categoryGlow.annotate}
          iconColor={categoryAccent.annotate}
          accept=".pdf,application/pdf"
          onFiles={pdf.onFiles}
          label="Drop a PDF file here"
          hint="PDF must contain interactive form fields"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={pdf.file.name}
            details={formatFileSize(pdf.file.size)}
            onChangeFile={pdf.reset}
          />

          {loading ? (
            <LoadingSpinner color="border-emerald-200 border-t-emerald-600" />
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
                  <InfoCallout icon={FileX} title="No fillable fields" accent="annotate">
                    This PDF does not contain interactive form fields. Use the Add Watermark or Add
                    Signature tools to annotate it instead.
                  </InfoCallout>
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
                  <ActionButton
                    onClick={handleFill}
                    processing={processing}
                    label="Fill & Download PDF"
                    processingLabel="Filling…"
                    color="bg-emerald-600 hover:bg-emerald-700"
                  />
                </div>
              )}
            </>
          )}
        </>
      )}

      {error && <AlertBox message={error} />}
    </div>
  );
}
