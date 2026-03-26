/**
 * Fill PDF Form tool.
 *
 * Detects all interactive form fields in a PDF (text fields, checkboxes,
 * dropdowns, radio groups) and renders a dynamic form so the user can fill
 * them in the browser. The filled PDF can optionally be flattened to remove
 * editability before downloading.
 */

import { useState, useCallback } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { fillPdfForm } from "../utils/pdf-operations.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";

type FieldType = "text" | "checkbox" | "dropdown" | "radio" | "other";

interface FieldInfo {
  name: string;
  type: FieldType;
  defaultValue: string | boolean;
  options?: string[];
  multiline?: boolean;
}

export default function FillPdfForm() {
  const [file, setFile] = useState<File | null>(null);
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
    setFields([]);
    setFieldValues({});
    setError(null);
    setLoading(true);

    try {
      const { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } =
        await import("pdf-lib");
      const arrayBuffer = await pdf.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const form = pdfDoc.getForm();
      const rawFields = form.getFields();

      const infos: FieldInfo[] = rawFields.map((field) => {
        const name = field.getName();
        if (field instanceof PDFTextField) {
          return {
            name,
            type: "text" as FieldType,
            defaultValue: field.getText() ?? "",
            multiline: field.isMultiline(),
          };
        }
        if (field instanceof PDFCheckBox) {
          return { name, type: "checkbox" as FieldType, defaultValue: field.isChecked() };
        }
        if (field instanceof PDFDropdown) {
          return {
            name,
            type: "dropdown" as FieldType,
            defaultValue: field.getSelected()[0] ?? "",
            options: field.getOptions(),
          };
        }
        if (field instanceof PDFRadioGroup) {
          return {
            name,
            type: "radio" as FieldType,
            defaultValue: field.getSelected() ?? "",
            options: field.getOptions(),
          };
        }
        return { name, type: "other" as FieldType, defaultValue: "" };
      });

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

  const editableFields = fields.filter((f) => f.type !== "other");

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="PDF must contain interactive form fields"
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted">
              <span className="font-medium">{file.name}</span> — {formatFileSize(file.size)}
            </p>
            <button
              onClick={() => {
                setFile(null);
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
              <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : editableFields.length === 0 ? (
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
              <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">
                No fillable form fields found
              </p>
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                This PDF does not contain interactive form fields. Use the Add Watermark or Add
                Signature tools to annotate it instead.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-500 dark:text-dark-text-muted">
                {editableFields.length} field{editableFields.length !== 1 ? "s" : ""} found — fill
                in the values below.
              </p>

              <div className="space-y-3">
                {editableFields.map((field) => (
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
                              setFieldValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                            }
                            rows={3}
                            className="w-full border border-slate-300 dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-white dark:bg-dark-surface text-slate-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                          />
                        ) : (
                          <input
                            type="text"
                            value={(fieldValues[field.name] as string) ?? ""}
                            onChange={(e) =>
                              setFieldValues((prev) => ({ ...prev, [field.name]: e.target.value }))
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
                            setFieldValues((prev) => ({ ...prev, [field.name]: e.target.checked }))
                          }
                          className="w-4 h-4 text-primary-600 rounded"
                        />
                        <span className="text-sm text-slate-600 dark:text-dark-text-muted">
                          Checked
                        </span>
                      </label>
                    )}

                    {field.type === "dropdown" && field.options && (
                      <select
                        value={(fieldValues[field.name] as string) ?? ""}
                        onChange={(e) =>
                          setFieldValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                        }
                        className="w-full border border-slate-300 dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-white dark:bg-dark-surface text-slate-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">— Select —</option>
                        {field.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
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
                onClick={handleFill}
                disabled={processing}
                className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {processing ? "Filling..." : "Fill & Download PDF"}
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
