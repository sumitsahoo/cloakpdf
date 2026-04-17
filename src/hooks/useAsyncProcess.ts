/**
 * React hook for the "perform an async operation" state machine that
 * every PDF tool needs for its main action button.
 *
 * Without the hook, every tool repeats the same boilerplate:
 *
 *   setProcessing(true);
 *   setError(null);
 *   try {
 *     …work…
 *   } catch (e) {
 *     setError(e instanceof Error ? e.message : "Something went wrong.");
 *   } finally {
 *     setProcessing(false);
 *   }
 *
 * {@link useAsyncProcess} captures exactly that, plus:
 *
 *   - Re-entrancy guard: firing the run while a previous run is still
 *     in flight is a no-op, so double-clicks can't launch two copies.
 *   - Consistent error extraction via the shared {@link errorMessage}
 *     helper.
 *   - An imperative `setError` escape hatch for tools that need to
 *     surface validation errors that happen *before* the async work
 *     starts (e.g. mismatched passwords).
 *
 * @example
 *   const task = useAsyncProcess();
 *
 *   const handleApply = useCallback(async () => {
 *     await task.run(async () => {
 *       const result = await rotatePages(file, rotations);
 *       downloadPdf(result, pdfFilename(file, "_rotated"));
 *     }, "Failed to rotate pages. Please try again.");
 *   }, [file, rotations, task]);
 */

import { useCallback, useRef, useState } from "react";
import { errorMessage } from "../utils/file-helpers.ts";

export interface UseAsyncProcessReturn {
  /** `true` while a `run()` call is in flight. */
  processing: boolean;
  /** User-facing error from the last failed run, or `null`. */
  error: string | null;
  /**
   * Imperatively set (or clear) the error — useful for validation
   * errors that must surface before the async work even starts,
   * e.g. "Passwords do not match".
   */
  setError: (message: string | null) => void;
  /**
   * Execute `fn` with processing/error state management. Returns `true`
   * when `fn` resolved successfully, `false` when it threw, and `false`
   * (without invoking `fn`) when another run is already in progress.
   *
   * @param fn - The async work to perform. Any value it returns is
   *   ignored — capture outputs in the enclosing scope if needed.
   * @param fallbackMessage - Message displayed when `fn` throws a
   *   non-`Error` value. Defaults to a generic "operation failed" string.
   */
  run: (fn: () => Promise<void>, fallbackMessage?: string) => Promise<boolean>;
}

/**
 * Track `processing` + `error` state for a repeatable async operation.
 *
 * The returned object is referentially stable across renders — its
 * `run` and `setError` methods are safe to include in dependency
 * arrays without causing effect churn.
 */
export function useAsyncProcess(): UseAsyncProcessReturn {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guard against double-clicks: if a run is already active we skip
  // the new one rather than starting two concurrent operations that
  // would race on the same state.
  const inFlightRef = useRef(false);

  const run = useCallback(
    async (
      fn: () => Promise<void>,
      fallbackMessage = "The operation failed. Please try again.",
    ): Promise<boolean> => {
      if (inFlightRef.current) return false;
      inFlightRef.current = true;
      setProcessing(true);
      setError(null);
      try {
        await fn();
        return true;
      } catch (e) {
        setError(errorMessage(e, fallbackMessage));
        return false;
      } finally {
        inFlightRef.current = false;
        setProcessing(false);
      }
    },
    [],
  );

  return { processing, error, setError, run };
}
