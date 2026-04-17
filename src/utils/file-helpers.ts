/**
 * Browser-side file I/O helpers.
 *
 * All functions run entirely in the browser — no server requests are made.
 * Object URLs created during downloads are revoked immediately after use
 * to prevent memory leaks.
 */

/**
 * Shared error message used whenever loading a PDF fails without a more
 * specific reason. Tools import this so the wording stays consistent.
 */
export const LOAD_ERROR_MESSAGE =
  "Failed to load PDF. The file may be corrupted or password-protected.";

/**
 * Extract a user-facing message from an unknown thrown value.
 *
 * Falls back to `fallback` when the value isn't an `Error` instance — this
 * is the common case when something like a rejected Promise carries a
 * non-Error payload (e.g. a plain string from a third-party library).
 *
 * @param error - The caught value from a `try/catch` block.
 * @param fallback - Message shown when `error` isn't an `Error`.
 */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Build an output filename from a source PDF by stripping its `.pdf`
 * extension and appending a descriptive suffix.
 *
 * @example
 *   pdfFilename(file, "_rotated");        // "report_rotated.pdf"
 *   pdfFilename("report.PDF", "_merged"); // "report_merged.pdf"
 *
 * @param source - Either the source `File` or a raw filename string.
 * @param suffix - Text inserted between the base name and the extension
 *   (include a leading underscore or space as desired).
 */
export function pdfFilename(source: File | string, suffix: string): string {
  const name = typeof source === "string" ? source : source.name;
  return `${name.replace(/\.pdf$/i, "")}${suffix}.pdf`;
}

/**
 * Trigger a browser download for any Blob type.
 *
 * Creates a temporary Blob URL, programmatically clicks a hidden anchor
 * element, and then cleans up by revoking the URL.
 *
 * @param blob - The Blob to download.
 * @param filename - Suggested filename for the downloaded file.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Trigger a browser download for PDF data.
 *
 * @param data - Raw PDF bytes to download.
 * @param filename - Suggested filename for the downloaded file.
 */
export function downloadPdf(data: Uint8Array, filename: string): void {
  downloadBlob(new Blob([data as Uint8Array<ArrayBuffer>], { type: "application/pdf" }), filename);
}

/**
 * Format a byte count into a human-readable string (e.g. "1.3 MB").
 *
 * Uses base-1024 units: B → KB → MB → GB.
 *
 * @param bytes - The number of bytes to format.
 * @returns A formatted string with one decimal place.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}
