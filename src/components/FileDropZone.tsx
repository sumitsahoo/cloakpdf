/**
 * Reusable drag-and-drop file input component.
 *
 * Supports both drag-over drop and traditional click-to-browse. Visual
 * feedback (border/background color change) is provided while a file
 * is being dragged over the zone. The hidden `<input>` is reset after
 * each selection so the same file can be picked again if needed.
 */

import { useState, useRef, useCallback } from "react";
import { CloudUpload } from "lucide-react";

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
}

export function FileDropZone({
  accept,
  multiple = false,
  onFiles,
  label = "Drop files here or click to browse",
  hint,
}: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 ${
        isDragOver
          ? "border-primary-400 bg-primary-50/50 dark:bg-primary-900/30"
          : "border-slate-300 dark:border-dark-border hover:border-primary-300 hover:bg-slate-50 dark:hover:bg-dark-surface"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        className="hidden"
      />
      <CloudUpload
        className={`w-10 h-10 mx-auto mb-3 transition-colors ${isDragOver ? "text-primary-500" : "text-slate-400 dark:text-dark-text-muted"}`}
        strokeWidth={1.5}
      />
      <p className="text-slate-600 dark:text-dark-text font-medium">{label}</p>
      {hint && <p className="text-sm text-slate-400 dark:text-dark-text-muted mt-1">{hint}</p>}
    </div>
  );
}
