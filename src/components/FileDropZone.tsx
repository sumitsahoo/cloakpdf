/**
 * Reusable drag-and-drop file input component.
 *
 * Supports both drag-over drop and traditional click-to-browse. Visual
 * feedback (border/background color change) is provided while a file
 * is being dragged over the zone. The hidden `<input>` is reset after
 * each selection so the same file can be picked again if needed.
 */

import { CloudUpload } from "lucide-react";
import { useCallback, useRef, useState } from "react";

interface FileDropZoneProps {
  /** MIME type filter for the hidden file input (e.g. ".pdf,application/pdf"). */
  accept: string;
  /** Whether to allow selecting multiple files at once. */
  multiple?: boolean;
  /** Callback invoked with the selected/dropped File objects. */
  onFiles: (files: File[]) => void;
  /** Primary label text shown in the drop zone. */
  label?: string;
  /** Optional secondary hint text below the label. */
  hint?: string;
  /**
   * CSS color for the cursor/touch spotlight glow (e.g. "rgba(37,99,235,0.18)").
   * Defaults to a neutral blue matching the primary palette.
   */
  glowColor?: string;
}

export function FileDropZone({
  accept,
  multiple = false,
  onFiles,
  label = "Drop files here or click to browse",
  hint,
  glowColor = "rgba(99,102,241,0.14)",
}: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const zoneRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [glowStyle, setGlowStyle] = useState<React.CSSProperties>({ opacity: 0 });

  const setGlowAt = useCallback(
    (clientX: number, clientY: number) => {
      const zone = zoneRef.current;
      if (!zone) return;
      const rect = zone.getBoundingClientRect();
      setGlowStyle({
        opacity: 1,
        background: `radial-gradient(300px circle at ${clientX - rect.left}px ${clientY - rect.top}px, ${glowColor}, transparent 70%)`,
      });
    },
    [glowColor],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => setGlowAt(e.clientX, e.clientY),
    [setGlowAt],
  );

  const handleMouseLeave = useCallback(() => setGlowStyle({ opacity: 0 }), []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLButtonElement>) => {
      const t = e.touches[0];
      setGlowAt(t.clientX, t.clientY);
    },
    [setGlowAt],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLButtonElement>) => {
      const t = e.touches[0];
      setGlowAt(t.clientX, t.clientY);
    },
    [setGlowAt],
  );

  const handleTouchEnd = useCallback(() => setGlowStyle({ opacity: 0 }), []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onFiles(files);
    },
    [onFiles],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) onFiles(files);
      // Reset input so the same file can be selected again
      e.target.value = "";
    },
    [onFiles],
  );

  return (
    <button
      type="button"
      ref={zoneRef}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={`relative w-full overflow-hidden border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 ${
        isDragOver
          ? "border-primary-400 bg-primary-50/50 dark:bg-primary-900/30"
          : "border-slate-300 dark:border-dark-border hover:border-primary-300 hover:bg-slate-50 dark:hover:bg-dark-surface active:border-primary-300 active:bg-slate-50 dark:active:bg-dark-surface"
      }`}
    >
      {/* Cursor / touch spotlight glow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl transition-opacity duration-300"
        style={glowStyle}
      />

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        className="hidden"
      />
      <CloudUpload
        className={`relative z-10 w-10 h-10 mx-auto mb-3 transition-colors ${isDragOver ? "text-primary-500" : "text-slate-400 dark:text-dark-text-muted"}`}
        strokeWidth={1.5}
      />
      <p className="relative z-10 text-slate-600 dark:text-dark-text font-medium">{label}</p>
      {hint && (
        <p className="relative z-10 text-sm text-slate-400 dark:text-dark-text-muted mt-1">
          {hint}
        </p>
      )}
    </button>
  );
}
