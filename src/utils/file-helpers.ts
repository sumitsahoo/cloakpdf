/**
 * Browser-side file I/O helpers.
 *
 * All functions run entirely in the browser — no server requests are made.
 * Object URLs created during downloads are revoked immediately after use
 * to prevent memory leaks.
 */

/**
 * Read a File object into an ArrayBuffer using the FileReader API.
 * Wraps the callback-based FileReader in a Promise for async/await usage.
 */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Trigger a browser download for PDF data.
 *
 * Creates a temporary Blob URL, programmatically clicks a hidden anchor
 * element, and then cleans up by revoking the URL.
 *
 * @param data - Raw PDF bytes to download.
 * @param filename - Suggested filename for the downloaded file.
 */
export function downloadPdf(data: Uint8Array, filename: string): void {
  const blob = new Blob([data as BlobPart], { type: "application/pdf" });
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
 * Trigger a browser download for any Blob type.
 * Works the same as {@link downloadPdf} but accepts an arbitrary Blob.
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
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
