/**
 * PDF to Image tool.
 *
 * Renders selected PDF pages as PNG or JPEG images at a configurable DPI.
 * A single-page export downloads directly; multi-page exports are packaged
 * into a ZIP file for convenience.
 */

import { Image, ScanLine } from "lucide-react";
import { useCallback, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { LabeledSlider } from "../components/LabeledSlider.tsx";
import { LoadingSpinner } from "../components/LoadingSpinner.tsx";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import { ProgressBar } from "../components/ProgressBar.tsx";
import { ThumbnailGrid } from "../components/ThumbnailGrid.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { usePdfFile } from "../hooks/usePdfFile.ts";
import { downloadBlob, formatFileSize } from "../utils/file-helpers.ts";
import {
  renderAllThumbnails,
  renderPagesToBlobs,
  revokeThumbnails,
} from "../utils/pdf-renderer.ts";

export default function PdfToImage() {
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [format, setFormat] = useState<"image/png" | "image/jpeg">("image/png");
  const [dpi, setDpi] = useState<72 | 150 | 300>(150);
  const [quality, setQuality] = useState(92);
  const [progress, setProgress] = useState<{ rendered: number; total: number } | null>(null);

  const pdf = usePdfFile<string[]>({
    load: async (file) => {
      const thumbs = await renderAllThumbnails(file);
      // Select all pages by default
      setSelectedPages(new Set(thumbs.map((_, i) => i)));
      return thumbs;
    },
    onReset: (thumbs) => {
      revokeThumbnails(thumbs ?? []);
      setSelectedPages(new Set());
    },
  });
  const task = useAsyncProcess();

  const thumbnails = pdf.data ?? [];

  const togglePage = useCallback((idx: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedPages((prev) =>
      prev.size === thumbnails.length ? new Set() : new Set(thumbnails.map((_, i) => i)),
    );
  }, [thumbnails]);

  const handleExport = useCallback(async () => {
    if (!pdf.file || selectedPages.size === 0) return;
    const file = pdf.file;
    setProgress({ rendered: 0, total: selectedPages.size });

    const ok = await task.run(async () => {
      const indices = Array.from(selectedPages).sort((a, b) => a - b);
      const blobs = await renderPagesToBlobs(file, indices, dpi, format, quality / 100, (r, t) =>
        setProgress({ rendered: r, total: t }),
      );

      const ext = format === "image/png" ? "png" : "jpg";
      const baseName = file.name.replace(/\.pdf$/i, "");

      if (blobs.length === 1) {
        downloadBlob(blobs[0].blob, `${baseName}_page${blobs[0].pageIndex + 1}.${ext}`);
      } else {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        for (const { pageIndex, blob } of blobs) {
          const padded = String(pageIndex + 1).padStart(3, "0");
          zip.file(`${baseName}_page${padded}.${ext}`, blob);
        }
        const zipBlob = await zip.generateAsync({ type: "blob" });
        downloadBlob(zipBlob, `${baseName}_images.zip`);
      }
    }, "Failed to export images. Please try again.");

    // Always clear progress when the run completes (success or failure).
    void ok;
    setProgress(null);
  }, [pdf.file, selectedPages, dpi, format, quality, task]);

  return (
    <div className="space-y-6">
      {!pdf.file ? (
        <FileDropZone
          glowColor={categoryGlow.transform}
          iconColor={categoryAccent.transform}
          accept=".pdf,application/pdf"
          onFiles={pdf.onFiles}
          label="Drop a PDF file here"
          hint="Each page will be exported as a PNG or JPEG image"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={pdf.file.name}
            details={formatFileSize(pdf.file.size)}
            onChangeFile={pdf.reset}
            extra={
              selectedPages.size > 0 ? (
                <span className="text-primary-600 ml-2">
                  ({selectedPages.size} of {thumbnails.length} selected)
                </span>
              ) : undefined
            }
          />

          {pdf.loading ? (
            <LoadingSpinner />
          ) : (
            <>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                  Select pages to export
                </p>
                <button
                  onClick={toggleAll}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  {selectedPages.size === thumbnails.length ? "Deselect all" : "Select all"}
                </button>
              </div>

              <ThumbnailGrid>
                {thumbnails.map((thumb, i) => (
                  <PageThumbnail
                    key={i}
                    src={thumb}
                    pageNumber={i + 1}
                    selected={selectedPages.has(i)}
                    onClick={() => togglePage(i)}
                  />
                ))}
              </ThumbnailGrid>

              {/* Export options */}
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border shadow-sm p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-dark-text-muted mb-2">
                      <Image className="w-3.5 h-3.5" />
                      Format
                    </p>
                    <div className="inline-flex w-full items-center gap-0.5 rounded-xl bg-slate-100 dark:bg-dark-bg p-1 border border-slate-200 dark:border-dark-border">
                      {(["image/png", "image/jpeg"] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => setFormat(f)}
                          className={`flex-1 rounded-lg py-1.5 px-3 text-sm transition-all duration-150 ${
                            format === f
                              ? "font-semibold text-white bg-primary-600 shadow-sm"
                              : "font-medium text-slate-500 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text hover:bg-white/60 dark:hover:bg-dark-surface-alt"
                          }`}
                        >
                          {f === "image/png" ? "PNG" : "JPEG"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-dark-text-muted mb-2">
                      <ScanLine className="w-3.5 h-3.5" />
                      Resolution
                    </p>
                    <div className="inline-flex w-full items-center gap-0.5 rounded-xl bg-slate-100 dark:bg-dark-bg p-1 border border-slate-200 dark:border-dark-border">
                      {([72, 150, 300] as const).map((d) => (
                        <button
                          key={d}
                          onClick={() => setDpi(d)}
                          className={`flex-1 rounded-lg py-1.5 px-3 text-sm transition-all duration-150 ${
                            dpi === d
                              ? "font-semibold text-white bg-primary-600 shadow-sm"
                              : "font-medium text-slate-500 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text hover:bg-white/60 dark:hover:bg-dark-surface-alt"
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 dark:text-dark-text-muted mt-1.5">DPI</p>
                  </div>
                </div>

                {format === "image/jpeg" && (
                  <>
                    <LabeledSlider
                      label="JPEG Quality"
                      value={quality}
                      min={60}
                      max={100}
                      step={1}
                      unit="%"
                      onChange={setQuality}
                    />
                    <div className="flex justify-between text-xs text-slate-400 dark:text-dark-text-muted">
                      <span>Smaller</span>
                      <span>Higher quality</span>
                    </div>
                  </>
                )}
              </div>

              {task.processing && progress && (
                <ProgressBar
                  current={progress.rendered}
                  total={progress.total}
                  label="Rendering pages…"
                />
              )}

              <ActionButton
                onClick={handleExport}
                processing={task.processing}
                disabled={task.processing || selectedPages.size === 0}
                label={
                  selectedPages.size === 1
                    ? "Export Image"
                    : `Export ${selectedPages.size} Images as ZIP`
                }
                processingLabel="Exporting…"
              />
            </>
          )}
        </>
      )}

      {(pdf.loadError || task.error) && <AlertBox message={pdf.loadError ?? task.error ?? ""} />}
    </div>
  );
}
