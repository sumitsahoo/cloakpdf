/**
 * React hook for the PDF-upload lifecycle shared across nearly every tool.
 *
 * Almost every tool in the app follows the same five-step choreography
 * when the user drops a PDF:
 *
 *   1. Replace the previously-selected file.
 *   2. Clear any cleanup-able resources attached to the old file
 *      (thumbnail blob URLs, parsed page dimensions, etc.).
 *   3. Run an async loader that derives the shape of data the tool needs
 *      (thumbnails, metadata, page count, …) from the new file.
 *   4. Display a loading indicator while the loader runs.
 *   5. Show a dismissible error if the loader throws; also restore the
 *      "no file selected" UI so the user can pick another one.
 *
 * This hook encapsulates all of that in a single call plus two tiny
 * callbacks. Tools keep ownership of any *additional* tool-specific
 * state (selections, draggable items, options); the hook's `onReset`
 * gives them one callback to clear everything in lockstep with the file.
 *
 * @example
 *   const pdf = usePdfFile<string[]>({
 *     load: renderAllThumbnails,
 *     onReset: revokeThumbnails,
 *   });
 *
 *   return !pdf.file ? (
 *     <FileDropZone onFiles={pdf.onFiles} ... />
 *   ) : (
 *     <>
 *       <FileInfoBar fileName={pdf.file.name} onChangeFile={pdf.reset} ... />
 *       {pdf.loading ? <LoadingSpinner /> : (pdf.data ?? []).map(...)}
 *     </>
 *   );
 */

import { useCallback, useRef, useState } from "react";
import { LOAD_ERROR_MESSAGE, errorMessage } from "../utils/file-helpers.ts";

export interface UsePdfFileOptions<T> {
  /**
   * Async function that derives tool-specific data from the selected file.
   *
   * Called once per new file; the resolved value is stored in `data` and
   * later passed back to {@link onReset} when the file is cleared. Omit
   * `load` when the tool only needs the raw `File` — for example tools
   * that hand the `File` directly to a pdf-lib operation without any
   * preview work (Compress, Flatten, Repair, Merge).
   */
  load?: (file: File) => Promise<T>;
  /**
   * Cleanup callback invoked with the previously-loaded `data` whenever
   * the file is replaced or cleared — including the implicit replace
   * that happens when the user drops a second file.
   *
   * Use this to revoke object URLs, release canvas memory, or clear any
   * extra tool-local state (selections, draggable items, etc.) that was
   * scoped to the old file. Safe to call with `null` when no data has
   * been produced yet (e.g. the very first file drop or an error before
   * `load` resolved).
   */
  onReset?: (previousData: T | null) => void;
  /**
   * Fallback error message when {@link load} throws a non-`Error` value.
   * Defaults to the shared {@link LOAD_ERROR_MESSAGE} so every tool
   * displays identical wording without copy-pasting the string.
   */
  loadErrorMessage?: string;
}

export interface UsePdfFileReturn<T> {
  /** Currently-selected PDF, or `null` when nothing is picked. */
  file: File | null;
  /** Value returned by the most recent successful {@link UsePdfFileOptions.load}, or `null`. */
  data: T | null;
  /** `true` while the loader is running; `false` when idle, errored, or done. */
  loading: boolean;
  /** Load error to surface to the user, or `null`. Cleared when a new file is selected. */
  loadError: string | null;
  /** Imperatively override the load error (e.g. to clear it after the user dismisses it). */
  setLoadError: (message: string | null) => void;
  /**
   * Handler to pass to `<FileDropZone onFiles={...} />`. Starts the
   * upload lifecycle with the first file in the array; ignores empty
   * drops. Subsequent drops are allowed — the previous file is reset
   * first so no cleanup is missed.
   */
  onFiles: (files: File[]) => void;
  /**
   * Imperatively clear the file. Intended for the "Change file"
   * button in the file-info bar. Cancels any in-flight load and
   * runs {@link UsePdfFileOptions.onReset} with the last `data`.
   */
  reset: () => void;
}

/**
 * Manage a single-PDF upload with an optional async derivation step.
 *
 * Safe against stale async results: if the user drops a second file
 * before the first file's loader resolves, the earlier promise's result
 * is discarded so it can't clobber the newer state.
 *
 * @typeParam T - Shape of the data returned by {@link UsePdfFileOptions.load}.
 *   Use `void` (the default) when the tool doesn't need derived data.
 */
export function usePdfFile<T = void>(options: UsePdfFileOptions<T> = {}): UsePdfFileReturn<T> {
  const { loadErrorMessage = LOAD_ERROR_MESSAGE } = options;

  // Latch the latest callbacks in refs so that `onFiles` and `reset`
  // don't need to be recreated every render. This keeps the hook's
  // return handlers referentially stable for consumers that pass them
  // to memoised children.
  const loadRef = useRef(options.load);
  loadRef.current = options.load;
  const onResetRef = useRef(options.onReset);
  onResetRef.current = options.onReset;
  const fallbackMessageRef = useRef(loadErrorMessage);
  fallbackMessageRef.current = loadErrorMessage;

  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Track the most recent data so that `onReset` sees it even when
  // invoked before React has committed a state update.
  const dataRef = useRef<T | null>(null);
  dataRef.current = data;

  // A monotonic ID prevents stale loader resolutions from overwriting
  // state that belongs to a newer file. Every call to `onFiles` or
  // `reset` bumps this, and each async branch checks the ID before
  // mutating state.
  const requestIdRef = useRef(0);

  const reset = useCallback(() => {
    const previous = dataRef.current;
    requestIdRef.current++;
    setFile(null);
    setData(null);
    setLoading(false);
    setLoadError(null);
    onResetRef.current?.(previous);
  }, []);

  const onFiles = useCallback((files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;

    const previous = dataRef.current;
    const requestId = ++requestIdRef.current;

    // Synchronously flip state so the UI switches into the file-loaded
    // view immediately. Any stale data/thumbs get torn down first.
    onResetRef.current?.(previous);
    setFile(pdf);
    setData(null);
    setLoadError(null);

    const loader = loadRef.current;
    if (!loader) return;

    setLoading(true);
    void (async () => {
      try {
        const result = await loader(pdf);
        if (requestIdRef.current !== requestId) return;
        setData(result);
      } catch (e) {
        if (requestIdRef.current !== requestId) return;
        // Roll the file back so the drop zone reappears — the user
        // can't do anything useful with a file whose load failed.
        setLoadError(errorMessage(e, fallbackMessageRef.current));
        setFile(null);
      } finally {
        if (requestIdRef.current === requestId) setLoading(false);
      }
    })();
  }, []);

  return { file, data, loading, loadError, setLoadError, onFiles, reset };
}
