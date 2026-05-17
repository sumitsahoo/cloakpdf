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

import { useCallback, useEffect, useRef, useState } from "react";
import { LOAD_ERROR_MESSAGE, errorMessage } from "../utils/file-helpers.ts";
import { isPdfEncrypted } from "../utils/pdf-security.ts";
import { useWorkflowSlot } from "../workflow/WorkflowContext.tsx";

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
  /**
   * Whether to accept password-protected PDFs.
   *
   * By default the hook rejects encrypted PDFs upfront — every tool except
   * `PdfPassword` (which strips the password) and `PdfInspector` (which
   * inspects encryption status) needs a clear-text PDF to do useful work,
   * so the default keeps them from hitting opaque pdf-lib / PDF.js errors
   * mid-operation. When rejected, `encryptedFile` exposes the file so the
   * tool can render `EncryptedPdfNotice` with a CTA to PDF Password.
   *
   * Set to `true` for tools whose purpose is to deal with encrypted PDFs.
   */
  allowEncrypted?: boolean;
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
   * The user-dropped PDF that turned out to be password-protected, or
   * `null`. Tools render `<EncryptedPdfNotice>` when this is set instead
   * of the dropzone / loaded-file UI. Always `null` when
   * `allowEncrypted: true` was passed in.
   */
  encryptedFile: File | null;
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
  const { loadErrorMessage = LOAD_ERROR_MESSAGE, allowEncrypted = false } = options;
  const allowEncryptedRef = useRef(allowEncrypted);
  allowEncryptedRef.current = allowEncrypted;

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
  const [encryptedFile, setEncryptedFile] = useState<File | null>(null);

  // Track the most recent data so that `onReset` sees it even when
  // invoked before React has committed a state update.
  const dataRef = useRef<T | null>(null);
  dataRef.current = data;

  // A monotonic ID prevents stale loader resolutions from overwriting
  // state that belongs to a newer file. Every call to `onFiles` or
  // `reset` bumps this, and each async branch checks the ID before
  // mutating state.
  const requestIdRef = useRef(0);

  // When this tool is rendered as a workflow step, a slot supplies the
  // intermediate PDF directly — there is no dropzone for the user to
  // interact with. We seed `file` once per injected reference so the
  // tool's "file loaded" UI mounts immediately. Refs hold `onFiles` and
  // the prior injected file to avoid re-triggering on unrelated renders.
  const slot = useWorkflowSlot();
  const injectedFile = slot?.injectedFile ?? null;
  const onFilesRef = useRef<(files: File[]) => void>(() => undefined);
  const lastInjectedRef = useRef<File | null>(null);

  const reset = useCallback(() => {
    const previous = dataRef.current;
    requestIdRef.current++;
    setFile(null);
    setData(null);
    setLoading(false);
    setLoadError(null);
    setEncryptedFile(null);
    onResetRef.current?.(previous);
  }, []);

  const onFiles = useCallback((files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;

    const previous = dataRef.current;
    const requestId = ++requestIdRef.current;

    // Clear any stale state before the async work begins. We deliberately
    // do NOT set `file` synchronously: setting it before the encryption
    // check completes leaks one render to consumers that watch
    // `pdf.file` (e.g. AskPdf's RAG `useEffect`), which then races
    // pdfjs against the gate and surfaces a "No password given" alert
    // alongside the encrypted notice. The encryption check is fast
    // enough (parsing the trailer, not the streams) that the brief
    // dropzone-flashing window before the file view appears is the
    // better trade-off.
    onResetRef.current?.(previous);
    setFile(null);
    setData(null);
    setLoadError(null);
    setEncryptedFile(null);

    setLoading(true);
    void (async () => {
      try {
        // Gate on encryption first — every tool except the password
        // remover and inspector needs clear-text bytes. Rejecting here
        // means the tool never sees the file (no loader run, no
        // half-broken state) and the UI can render the encrypted notice
        // in place of the dropzone.
        if (!allowEncryptedRef.current && (await isPdfEncrypted(pdf))) {
          if (requestIdRef.current !== requestId) return;
          setEncryptedFile(pdf);
          return;
        }
        if (requestIdRef.current !== requestId) return;
        // Encryption gate passed — now expose the file to consumers
        // and kick off the optional loader.
        setFile(pdf);

        const loader = loadRef.current;
        if (!loader) return;
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

  onFilesRef.current = onFiles;

  // In workflow mode, drive the same `onFiles` lifecycle with the file
  // supplied by the runner. Re-runs only when the runner injects a
  // different File reference (i.e. a fresh step), not on every render.
  useEffect(() => {
    if (!injectedFile) return;
    if (lastInjectedRef.current === injectedFile) return;
    lastInjectedRef.current = injectedFile;
    onFilesRef.current([injectedFile]);
  }, [injectedFile]);

  return { file, data, loading, loadError, setLoadError, encryptedFile, onFiles, reset };
}
