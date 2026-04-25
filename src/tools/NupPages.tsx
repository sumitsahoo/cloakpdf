/**
 * N-up Pages tool.
 *
 * Arranges multiple PDF pages onto single sheets in a grid layout.
 * The user picks from four layouts (2x1, 1x2, 2x2, 3x3) and downloads
 * a new PDF where source pages are scaled to fill each grid cell.
 */

import { CheckCircle2, LayoutGrid } from "lucide-react";
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
import { nupPages } from "../utils/pdf-operations.ts";
import { getPageCount } from "../utils/pdf-renderer.ts";

type NupLayout = "2x1" | "1x2" | "2x2" | "3x3";

const LAYOUTS: {
  value: NupLayout;
  label: string;
  desc: string;
  cols: number;
  rows: number;
}[] = [
  { value: "2x1", label: "2-up Landscape", desc: "2 pages side by side", cols: 2, rows: 1 },
  { value: "1x2", label: "2-up Portrait", desc: "2 pages top to bottom", cols: 1, rows: 2 },
  { value: "2x2", label: "4-up", desc: "4 pages in a 2×2 grid", cols: 2, rows: 2 },
  { value: "3x3", label: "9-up", desc: "9 pages in a 3×3 grid", cols: 3, rows: 3 },
];

export default function NupPages() {
  const [layout, setLayout] = useState<NupLayout>("2x2");
  const [done, setDone] = useState(false);

  const pdf = usePdfFile<number>({
    load: getPageCount,
    onReset: () => setDone(false),
  });
  const task = useAsyncProcess();

  const pageCount = pdf.data ?? 0;

  const handleProcess = useCallback(async () => {
    if (!pdf.file) return;
    const file = pdf.file;
    setDone(false);
    const ok = await task.run(async () => {
      const result = await nupPages(file, layout);
      downloadPdf(result, pdfFilename(file, `_${layout}`));
    }, "Failed to create N-up PDF. Please try again.");
    if (ok) setDone(true);
  }, [pdf.file, layout, task]);

  const selected = LAYOUTS.find((l) => l.value === layout)!;
  const perSheet = selected.cols * selected.rows;
  const outSheets = pageCount > 0 ? Math.ceil(pageCount / perSheet) : 0;

  return (
    <div className="space-y-6">
      {!pdf.file ? (
        <FileDropZone
          glowColor={categoryGlow.transform}
          iconColor={categoryAccent.transform}
          accept=".pdf,application/pdf"
          onFiles={pdf.onFiles}
          label="Drop a PDF file here"
          hint="Multiple pages will be arranged onto single sheets"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={pdf.file.name}
            details={`${formatFileSize(pdf.file.size)}${!pdf.loading && pageCount > 0 ? `, ${pageCount} pages` : ""}`}
            onChangeFile={pdf.reset}
          />

          {pdf.loading ? (
            <LoadingSpinner />
          ) : (
            <>
              {/* Layout selector */}
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border shadow-sm p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-dark-text-muted mb-3">
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Layout
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {LAYOUTS.map((l) => (
                    <button
                      key={l.value}
                      type="button"
                      onClick={() => setLayout(l.value)}
                      className={`border-2 rounded-xl p-3 text-center transition-all duration-150 ${
                        layout === l.value
                          ? "border-primary-500 bg-primary-50 dark:bg-primary-900/30 ring-1 ring-primary-300 dark:ring-primary-700"
                          : "border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-dark-surface-alt"
                      }`}
                    >
                      {/* Visual grid preview */}
                      <div
                        className="mx-auto mb-2 grid gap-0.5 p-1 bg-slate-100 dark:bg-dark-border rounded"
                        style={{
                          gridTemplateColumns: `repeat(${l.cols}, 1fr)`,
                          width: 48,
                          height: 48,
                        }}
                      >
                        {Array.from({ length: l.cols * l.rows }).map((_, i) => (
                          <div key={i} className="bg-slate-300 dark:bg-slate-500 rounded-sm" />
                        ))}
                      </div>
                      <p
                        className={`text-xs font-semibold ${layout === l.value ? "text-primary-700 dark:text-primary-300" : "text-slate-700 dark:text-dark-text"}`}
                      >
                        {l.label}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-dark-text-muted leading-snug">
                        {l.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {pageCount > 0 && (
                <p className="text-sm text-slate-500 dark:text-dark-text-muted text-center">
                  {pageCount} pages → {outSheets} sheet{outSheets !== 1 ? "s" : ""} ({perSheet}{" "}
                  pages per sheet)
                </p>
              )}

              <ActionButton
                onClick={handleProcess}
                processing={task.processing}
                disabled={task.processing || pageCount === 0}
                label={`Create ${selected.label} PDF`}
                processingLabel="Processing..."
              />

              {done && (
                <InfoCallout icon={CheckCircle2} accent="transform">
                  N-up PDF created and downloaded successfully.
                </InfoCallout>
              )}
            </>
          )}
        </>
      )}

      {(pdf.loadError || task.error) && <AlertBox message={pdf.loadError ?? task.error ?? ""} />}
    </div>
  );
}
