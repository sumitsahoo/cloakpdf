/**
 * Reusable drag-and-drop file input component.
 *
 * Supports both drag-over drop and traditional click-to-browse. Visual
 * feedback (border/background color change) is provided while a file
 * is being dragged over the zone. The hidden `<input>` is reset after
 * each selection so the same file can be picked again if needed.
 */

import { FileUp } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { categoryGlow } from "../config/theme.ts";

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
  /**
   * CSS color for the icon tint (e.g. "rgb(37,99,235)").
   * Should match the tool's category accent. Defaults to slate.
   */
  iconColor?: string;
}

export function FileDropZone({
  accept,
  multiple = false,
  onFiles,
  label = "Drop files here or click to browse",
  hint,
  glowColor = categoryGlow.organise,
  iconColor,
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
      style={{ touchAction: "manipulation" }}
      className={`group relative w-full overflow-hidden border-2 border-dashed rounded-xl p-10 text-center cursor-pointer
        transition-[border-color,background-color,transform] duration-200
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2
        ${
          isDragOver
            ? "border-primary-400 bg-primary-50/80 dark:bg-primary-900/40 scale-[1.005]"
            : "border-slate-300 dark:border-dark-border bg-white/70 dark:bg-dark-surface/70 hover:border-primary-300 hover:bg-white/90 dark:hover:bg-dark-surface/90 active:border-primary-300 active:bg-white/90 dark:active:bg-dark-surface/90"
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
        aria-label={label}
        className="hidden"
      />

      {/* Icon container */}
      <div
        className={`relative z-10 w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center
          transition-[background-color,transform] duration-200
          motion-safe:group-hover:-translate-y-1 motion-safe:[&:has(~*)]:translate-y-0
          ${
            isDragOver
              ? "bg-primary-100 dark:bg-primary-900/50 motion-safe:-translate-y-1"
              : "bg-slate-100 dark:bg-dark-surface group-hover:bg-primary-50 dark:group-hover:bg-primary-900/30"
          }`}
      >
        <FileUp
          className={`w-8 h-8 transition-[color,opacity] duration-200 ${
            iconColor
              ? isDragOver
                ? "opacity-100"
                : "opacity-50 group-hover:opacity-100"
              : isDragOver
                ? "text-primary-500"
                : "text-slate-400 dark:text-dark-text-muted group-hover:text-primary-400"
          }`}
          style={iconColor ? { color: iconColor } : undefined}
          strokeWidth={1.5}
        />
      </div>

      <p
        className={`relative z-10 font-medium transition-colors duration-200 ${isDragOver ? "text-primary-600 dark:text-primary-400" : "text-slate-600 dark:text-dark-text"}`}
      >
        {label}
      </p>
      {hint && (
        <p className="relative z-10 text-sm text-slate-400 dark:text-dark-text-muted mt-1">
          {hint}
        </p>
      )}
    </button>
  );
}
