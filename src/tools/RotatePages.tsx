/**
 * Rotate Pages tool.
 *
 * Renders page thumbnails with per-page rotation buttons (−90°, +90°, 180°)
 * and a “Rotate All” shortcut. Rotation angles are accumulated in a Map
 * keyed by 0-based page index. Only pages with a non-zero rotation are
 * modified on save.
 */

import { useState, useCallback } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { PageThumbnail } from "../components/PageThumbnail.tsx";
import { RotateCcw, RotateCw, FlipVertical2 } from "lucide-react";
import { rotatePages } from "../utils/pdf-operations.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";
import { downloadPdf } from "../utils/file-helpers.ts";

export default function RotatePages() {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [rotations, setRotations] = useState<Map<number, number>>(new Map());
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setRotations(new Map());
    setLoading(true);
    setError(null);
    try {
      const thumbs = await renderAllThumbnails(pdf);
      setThumbnails(thumbs);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to load PDF. The file may be corrupted or password-protected.",
      );
      setFile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Accumulate rotation for a single page (angles are additive, mod 360). */
  const rotatePage = useCallback((pageIndex: number, angle: number) => {
    setRotations((prev) => {
      const next = new Map(prev);
      const current = next.get(pageIndex) ?? 0;
      next.set(pageIndex, (current + angle) % 360);
      return next;
    });
  }, []);

  /** Apply the same rotation increment to every page at once. */
  const rotateAll = useCallback(
    (angle: number) => {
      setRotations((prev) => {
        const next = new Map(prev);
        for (let i = 0; i < thumbnails.length; i++) {
          const current = next.get(i) ?? 0;
          next.set(i, (current + angle) % 360);
        }
        return next;
      });
    },
    [thumbnails.length],
  );

  const handleApply = useCallback(async () => {
    if (!file || rotations.size === 0) return;
    setProcessing(true);
    setError(null);
    try {
      const result = await rotatePages(file, rotations);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_rotated.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to rotate pages. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file, rotations]);

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Click rotation buttons on each page to adjust"
        />
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted">
              <span className="font-medium">{file.name}</span> — {thumbnails.length} pages
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => rotateAll(90)}
                className="text-sm px-3 py-1.5 bg-slate-100 dark:bg-dark-surface-alt dark:text-dark-text hover:bg-slate-200 dark:hover:bg-dark-border rounded-lg transition-colors"
              >
                Rotate All 90° →
              </button>
              <button
                onClick={() => {
                  setFile(null);
                  setThumbnails([]);
                  setRotations(new Map());
                }}
                className="text-sm text-primary-600 hover:text-primary-700"
              >
                Change file
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {thumbnails.map((thumb, i) => (
                <div key={i} className="space-y-2">
                  <PageThumbnail src={thumb} pageNumber={i + 1} rotation={rotations.get(i) ?? 0} />
                  <div className="flex justify-center gap-1">
                    <button
                      onClick={() => rotatePage(i, -90)}
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-dark-surface-alt text-slate-500 dark:text-dark-text-muted transition-colors"
                      title="Rotate 90° left"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => rotatePage(i, 90)}
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-dark-surface-alt text-slate-500 dark:text-dark-text-muted transition-colors"
                      title="Rotate 90° right"
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => rotatePage(i, 180)}
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-dark-surface-alt text-slate-500 dark:text-dark-text-muted transition-colors"
                      title="Rotate 180°"
                    >
                      <FlipVertical2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {rotations.size > 0 && (
            <button
              onClick={handleApply}
              disabled={processing}
              className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {processing ? "Applying..." : "Apply Rotations & Download"}
            </button>
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
