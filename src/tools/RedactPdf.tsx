/**
 * Redact PDF tool.
 *
 * Renders each page as an image and lets the user draw redaction rectangles
 * on a canvas overlay. Redactions are stored as page-relative fractions (0–1)
 * so they remain accurate regardless of display size. On download, the
 * rectangles are converted to PDF user-space coordinates and drawn as
 * permanent filled black boxes via pdf-lib.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { downloadPdf } from "../utils/file-helpers.ts";
import { redactPdf } from "../utils/pdf-operations.ts";
import { renderAllThumbnails } from "../utils/pdf-renderer.ts";
import { Trash2, Undo2 } from "lucide-react";

interface RedactionRect {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

export default function RedactPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [pageIds, setPageIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // editingPage = null → thumbnail grid; number → redact editor for that page
  const [editingPage, setEditingPage] = useState<number | null>(null);
  // Map of pageIndex → list of redaction rects (fraction coords)
  const [redactions, setRedactions] = useState<Map<number, RedactionRect[]>>(new Map());

  // Global undo history — each entry is the full redactions map before a rect was added
  const [undoHistory, setUndoHistory] = useState<Map<number, RedactionRect[]>[]>([]);

  // Canvas drawing state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setRedactions(new Map());
    setUndoHistory([]);
    setEditingPage(null);
    setLoading(true);
    setError(null);
    try {
      const thumbs = await renderAllThumbnails(pdf);
      setThumbnails(thumbs);
      setPageIds(thumbs.map((_, idx) => `${pdf.name}-${idx}`));
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

  const totalRedactions = [...redactions.values()].reduce((sum, r) => sum + r.length, 0);

  /** Redraw all saved rects + optional in-progress rect onto the canvas. */
  const redrawCanvas = useCallback(
    (inProgress?: RedactionRect) => {
      const canvas = canvasRef.current;
      if (!canvas || editingPage === null) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const draw = (r: RedactionRect) => {
        const x = r.xPct * canvas.width;
        const y = r.yPct * canvas.height;
        const w = r.wPct * canvas.width;
        const h = r.hPct * canvas.height;
        ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "#ff4444";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, h);
      };

      for (const r of redactions.get(editingPage) ?? []) draw(r);
      if (inProgress) draw(inProgress);
    },
    [editingPage, redactions],
  );

  // Re-render canvas whenever saved rects or editing page changes
  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  /** Convert a mouse event to canvas-relative fractional coords (0–1). */
  const getRelativePos = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (editingPage === null) return;
      e.preventDefault();
      setDragStart(getRelativePos(e));
    },
    [editingPage, getRelativePos],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragStart || editingPage === null) return;
      e.preventDefault();
      const pos = getRelativePos(e);
      redrawCanvas({
        xPct: Math.min(dragStart.x, pos.x),
        yPct: Math.min(dragStart.y, pos.y),
        wPct: Math.abs(pos.x - dragStart.x),
        hPct: Math.abs(pos.y - dragStart.y),
      });
    },
    [dragStart, editingPage, getRelativePos, redrawCanvas],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!dragStart || editingPage === null) return;
      e.preventDefault();
      const pos = getRelativePos(e);
      const r: RedactionRect = {
        xPct: Math.min(dragStart.x, pos.x),
        yPct: Math.min(dragStart.y, pos.y),
        wPct: Math.abs(pos.x - dragStart.x),
        hPct: Math.abs(pos.y - dragStart.y),
      };

      // Only save rects that are at least 1% of the page in each dimension
      if (r.wPct > 0.01 && r.hPct > 0.01) {
        setRedactions((prev) => {
          setUndoHistory((h) => [...h, prev]);
          const next = new Map(prev);
          const existing = next.get(editingPage) ?? [];
          next.set(editingPage, [...existing, r]);
          return next;
        });
      }

      setDragStart(null);
    },
    [dragStart, editingPage, getRelativePos],
  );

  const removeLastRect = useCallback(() => {
    if (editingPage === null) return;
    setRedactions((prev) => {
      const next = new Map(prev);
      const existing = next.get(editingPage) ?? [];
      if (existing.length === 0) return prev;
      next.set(editingPage, existing.slice(0, -1));
      return next;
    });
  }, [editingPage]);

  const globalUndo = useCallback(() => {
    setUndoHistory((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      setRedactions(prev[prev.length - 1]);
      return next;
    });
  }, []);

  const clearAllRects = useCallback(() => {
    setRedactions(new Map());
    setUndoHistory([]);
  }, []);

  const clearPageRects = useCallback(() => {
    if (editingPage === null) return;
    setRedactions((prev) => {
      const next = new Map(prev);
      next.delete(editingPage);
      return next;
    });
  }, [editingPage]);

  const handleApply = useCallback(async () => {
    if (!file || totalRedactions === 0) return;
    setProcessing(true);
    setError(null);
    try {
      const flat: { pageIndex: number; xPct: number; yPct: number; wPct: number; hPct: number }[] =
        [];
      for (const [pageIndex, rects] of redactions) {
        for (const r of rects) {
          flat.push({ pageIndex, ...r });
        }
      }
      const result = await redactPdf(file, flat);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(result, `${baseName}_redacted.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply redactions. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [file, redactions, totalRedactions]);

  // Sync canvas size to container size on mount / resize
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas || editingPage === null) return;

    const sync = () => {
      const { width, height } = container.getBoundingClientRect();
      canvas.width = width;
      canvas.height = height;
      redrawCanvas();
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(container);
    return () => ro.disconnect();
  }, [editingPage, redrawCanvas]);

  if (!file) {
    return (
      <div className="space-y-6">
        <FileDropZone
          glowColor={categoryGlow.security}
          iconColor={categoryAccent.security}
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Draw black boxes over sensitive content to permanently redact it"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-dark-text-muted break-all sm:break-normal">
          <span className="font-medium">{file.name}</span> — {thumbnails.length} pages
          {totalRedactions > 0 && (
            <span className="text-red-600 dark:text-red-400 ml-2">
              ({totalRedactions} redaction{totalRedactions > 1 ? "s" : ""} drawn)
            </span>
          )}
        </p>
        {editingPage !== null ? (
          <button
            type="button"
            onClick={() => setEditingPage(null)}
            className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
          >
            ← Back to pages
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setFile(null);
              setThumbnails([]);
              setRedactions(new Map());
            }}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            Change file
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : editingPage !== null ? (
        // ── Redact editor for a single page ──────────────────────────────────
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
              Page {editingPage + 1} — drag to draw redaction boxes
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={removeLastRect}
                disabled={(redactions.get(editingPage) ?? []).length === 0}
                className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-dark-text-muted dark:hover:text-dark-text disabled:opacity-40 transition-colors"
              >
                <Undo2 className="w-4 h-4" />
                Undo last
              </button>
              <button
                type="button"
                onClick={clearPageRects}
                disabled={(redactions.get(editingPage) ?? []).length === 0}
                className="inline-flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-40 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Clear page
              </button>
            </div>
          </div>

          <div
            ref={containerRef}
            className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-dark-border select-none"
            style={{ cursor: "crosshair" }}
          >
            <img
              src={thumbnails[editingPage]}
              alt={`Page ${editingPage + 1}`}
              className="w-full h-auto block pointer-events-none"
              draggable={false}
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={() => {
                if (dragStart) {
                  setDragStart(null);
                  redrawCanvas();
                }
              }}
            />
          </div>

          {(redactions.get(editingPage) ?? []).length > 0 && (
            <p className="text-xs text-slate-400 dark:text-dark-text-muted">
              {(redactions.get(editingPage) ?? []).length} redaction
              {(redactions.get(editingPage) ?? []).length > 1 ? "s" : ""} on this page
            </p>
          )}
        </div>
      ) : (
        // ── Page thumbnail grid ───────────────────────────────────────────────
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-dark-text-muted">
              Click a page to open the redaction editor for it.
            </p>
            {totalRedactions > 0 && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={globalUndo}
                  disabled={undoHistory.length === 0}
                  className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-dark-text-muted dark:hover:text-dark-text disabled:opacity-40 transition-colors"
                >
                  <Undo2 className="w-4 h-4" />
                  Undo last
                </button>
                <button
                  type="button"
                  onClick={clearAllRects}
                  className="inline-flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear all
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {thumbnails.map((thumb, i) => {
              const count = (redactions.get(i) ?? []).length;
              return (
                <button
                  type="button"
                  key={pageIds[i]}
                  onClick={() => setEditingPage(i)}
                  className="relative rounded-lg overflow-hidden border-2 border-slate-200 dark:border-dark-border hover:border-primary-400 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <img src={thumb} alt={`Page ${i + 1}`} className="w-full h-auto block" />
                  <div className="absolute bottom-0 inset-x-0 bg-slate-800/70 text-white text-xs py-0.5 text-center">
                    {count > 0 ? (
                      <span className="text-red-300">
                        {count} redaction{count > 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span>Page {i + 1}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {totalRedactions > 0 && editingPage === null && (
        <button
          type="button"
          onClick={handleApply}
          disabled={processing}
          className="w-full bg-red-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {processing
            ? "Applying Redactions..."
            : `Apply ${totalRedactions} Redaction${totalRedactions > 1 ? "s" : ""} & Download`}
        </button>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}
    </div>
  );
}
