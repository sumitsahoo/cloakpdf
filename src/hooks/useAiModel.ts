/**
 * React hook for the "consent → download → ready → run" lifecycle that
 * sits in front of every AI tool.
 *
 * Tools never call `loadPipeline` directly — they call `ensureReady()`
 * and get back a Promise that resolves to the loaded pipeline. The
 * first call shows a consent dialog (because the model isn't cached in
 * memory yet); subsequent calls resolve immediately once the model is
 * ready.
 *
 * The hook keeps a small state machine:
 *
 *   idle ──ensureReady()─▶ awaiting-consent
 *                                │
 *                                ├──confirm()──▶ downloading ──ok──▶ ready
 *                                │                   │
 *                                │                   └──err──▶ error ──retry()──▶ downloading
 *                                │
 *                                └──cancel()──▶ idle (pending promise rejected with "cancelled")
 *
 * `ready` is a terminal in-memory state — once the pipeline is loaded
 * we keep it for the lifetime of the page so repeated runs don't pay
 * the cost again.
 *
 * Cancellation note: there is no way to abort the underlying fetches
 * that Transformers.js issues, so "cancel" really means "stop showing
 * progress and reject the consumer's promise". Files that have already
 * been written to the browser cache stay there, which means the next
 * download picks up where this one left off — only the file that was
 * mid-flight needs to be redownloaded.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { type AiModelId, type AiModelInfo, getModelInfo } from "../utils/ai-models.ts";
import {
  abortPendingLoad,
  type AiPipeline,
  type AiProgress,
  forgetModel,
  getResolvedPipeline,
  isModelMarkedReady,
  loadPipeline,
} from "../utils/ai-runtime.ts";

/**
 * Lifecycle states for an AI model.
 *
 *   - `idle` — nothing requested yet.
 *   - `awaiting-consent` — first-time use; consent dialog visible.
 *   - `downloading` — first-time fetch from Hugging Face's CDN.
 *   - `loading` — model files are (almost certainly) cached; the
 *     pipeline is being constructed from disk. Visually distinct from
 *     `downloading` because the user did not commission new network
 *     traffic — they're just paying the constructor cost.
 *   - `ready` — pipeline in memory, callable.
 *   - `error` — last load attempt threw; retry resets to `downloading`
 *     (or `loading` if files appear cached).
 */
export type AiModelStatus =
  | "idle"
  | "awaiting-consent"
  | "downloading"
  | "loading"
  | "ready"
  | "error";

export interface UseAiModelReturn {
  /** Spec for the model (display name, size, URL, …). */
  info: AiModelInfo;
  /** Current state machine position. */
  status: AiModelStatus;
  /** Latest aggregated download progress (or null when no download is active). */
  progress: AiProgress | null;
  /** Last error from a failed download attempt, or null. */
  error: string | null;
  /**
   * Resolve to the in-memory pipeline. Triggers the consent dialog and
   * download on first call. Rejects with `"cancelled"` if the user
   * dismisses the dialog. Safe to call multiple times.
   */
  ensureReady: () => Promise<AiPipeline>;
  /** Begin the download (called by the consent dialog "Download" button). */
  confirm: () => void;
  /** Retry after a failed download. */
  retry: () => void;
  /** Cancel the pending consent or in-flight download. */
  cancel: () => void;
  /**
   * Drop the hook's reference to the loaded pipeline and reset state
   * back to `idle`. Use this when an out-of-band action (e.g.
   * `disposeAllModels()` from the rollup hook) has torn down the
   * runtime-level pipeline — the hook would otherwise keep reporting
   * `ready` forever even though the underlying pipeline is gone.
   *
   * Does **not** touch the localStorage ready-flag or CacheStorage
   * bytes; those are managed at the runtime/rollup layer. This is
   * pure in-hook state reset.
   */
  reset: () => void;
}

export function useAiModel(modelId: AiModelId): UseAiModelReturn {
  const info = getModelInfo(modelId);

  // Treat "already loaded in this tab" as ready so repeat tool visits
  // skip the dialog. We pull the resolved pipeline up-front so the hook
  // doesn't need to round-trip through `loadPipeline` again on remount
  // (or when the parent component switches `modelId`).
  const initialPipeline = getResolvedPipeline(modelId);
  const initialStatus: AiModelStatus = initialPipeline ? "ready" : "idle";

  const [status, setStatus] = useState<AiModelStatus>(initialStatus);
  const [progress, setProgress] = useState<AiProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track pending consumers so confirm/cancel can resolve/reject them.
  // We use refs (not state) because these callbacks fire from inside
  // user-driven event handlers and we don't want a render cycle between
  // setting them and using them.
  type Pending = {
    resolve: (p: AiPipeline) => void;
    reject: (err: Error) => void;
  };
  const pendingRef = useRef<Pending[]>([]);
  const pipelineRef = useRef<AiPipeline | null>(initialPipeline);

  // When the caller passes a different `modelId` (e.g. the user changed
  // chat tier from small to large), reset to the new model's state.
  // Without this the hook would keep handing out the old pipeline.
  useEffect(() => {
    const resolved = getResolvedPipeline(modelId);
    pipelineRef.current = resolved;
    setStatus(resolved ? "ready" : "idle");
    setProgress(null);
    setError(null);
    // Reject anything queued for the previous model so callers see a
    // clean cancellation rather than a silent swap.
    const pending = pendingRef.current;
    pendingRef.current = [];
    for (const { reject } of pending) reject(new Error("cancelled"));
  }, [modelId]);

  // Prevent setState calls on an unmounted hook (download promises can
  // outlive the tool component if the user navigates away mid-flight).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Run the loader and route the result to every pending consumer.
   *
   * Distinguishes "downloading" (first-time, network-heavy) from
   * "loading" (files already in CacheStorage, just constructing the
   * pipeline). The state matters for the UI: downloads need a
   * full-progress dialog with cancel; cache-warm loads just need a
   * tiny inline spinner.
   */
  const startDownload = useCallback(async () => {
    if (!mountedRef.current) return;
    const cacheWarm = isModelMarkedReady(modelId);
    setStatus(cacheWarm ? "loading" : "downloading");
    setError(null);
    setProgress({
      loaded: 0,
      total: 0,
      file: "",
      status: cacheWarm ? "Loading model" : "Starting…",
    });

    try {
      const pipe = await loadPipeline(modelId, (p) => {
        if (!mountedRef.current) return;
        // Override the runtime's "Downloading model" label with
        // "Loading model" so cache-warm runs read correctly even if
        // transformers.js fires a few progress events while pulling
        // bytes out of CacheStorage.
        setProgress(cacheWarm ? { ...p, status: "Loading model" } : p);
      });
      pipelineRef.current = pipe;
      if (mountedRef.current) {
        setStatus("ready");
        setProgress(null);
      }
      const pending = pendingRef.current;
      pendingRef.current = [];
      for (const { resolve } of pending) resolve(pipe);
    } catch (e) {
      // Late-arrival reject from `loadPipeline` (user cancelled, tier
      // swap, dispose). Not a real error — the consumer was already
      // dropped via `pendingRef.reject(...)` in `cancel()` and the
      // status was reset there. Just bail without surfacing UI.
      if (e instanceof Error && e.message === "load-cancelled") return;
      if (!mountedRef.current) return;
      // If we got here on the warm-cache path, the localStorage flag
      // says the model was previously downloaded but the actual load
      // just threw — most likely the CacheStorage bytes are corrupt
      // (browser eviction mid-write, storage pressure, bit-flip). The
      // next Retry would hit the *exact same* warm-cache path and
      // fail identically: an infinite loop unless the user finds the
      // "Delete cached models" button. Clear the ready flag so the
      // retry goes through the fresh-download UI instead — the user
      // gets the full progress dialog and Cancel CTA, which is the
      // clearer recovery surface even though Transformers.js may
      // still reuse some of the corrupt bytes via its own URL-keyed
      // CacheStorage. From the user's side, the next attempt at
      // least *looks* like a fresh download instead of silently
      // re-hitting the same poison cache.
      if (cacheWarm) {
        forgetModel(modelId);
      }
      // Always surface a generic, user-friendly message in the dialog —
      // raw `error.message` strings from onnxruntime-web (e.g.
      // "Could not find an implementation for GatherBlockQuantized…")
      // mean nothing to end users and look alarming. The original
      // error stays logged to the console so we can still triage from
      // DevTools / Sentry.
      console.error(`[ai-model:${modelId}] load failed`, e);
      setStatus("error");
      setError("We couldn't finish setting up the AI models. Please try again.");
    }
  }, [modelId]);

  const ensureReady = useCallback((): Promise<AiPipeline> => {
    if (pipelineRef.current) return Promise.resolve(pipelineRef.current);

    return new Promise<AiPipeline>((resolve, reject) => {
      pendingRef.current.push({ resolve, reject });

      // A load (cached) or download (cold) is already in flight —
      // just queue up alongside any other waiting consumer.
      if (status === "downloading" || status === "loading") return;
      // If we previously errored, show the error in the dialog so the
      // user can retry — don't kick off a fresh download silently.
      if (status === "error") {
        setStatus("awaiting-consent");
        return;
      }
      // Return visitor: the model has been downloaded successfully at
      // least once in this browser. Skip the consent dialog and load
      // directly from the browser cache — the user already agreed.
      if (isModelMarkedReady(modelId)) {
        void startDownload();
        return;
      }
      // Fresh request: gate on user consent.
      if (status === "idle" || status === "ready") {
        // Ready can only happen here if pipelineRef was cleared (we never
        // do that); falling through to consent is the safe default.
        setStatus("awaiting-consent");
      }
    });
  }, [status, modelId, startDownload]);

  const confirm = useCallback(() => {
    if (status === "downloading" || status === "loading") return;
    void startDownload();
  }, [status, startDownload]);

  const retry = useCallback(() => {
    if (status === "downloading" || status === "loading") return;
    void startDownload();
  }, [status, startDownload]);

  const cancel = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = [];
    for (const { reject } of pending) reject(new Error("cancelled"));
    // Sync-evict any in-flight `loadPipeline` promise so the
    // background fetch can't quietly set `markModelReady` after the
    // user clicked Cancel. The promise itself can't be aborted
    // (Transformers.js doesn't expose a signal), but the late-arrival
    // check inside `loadPipeline` discards the resolved pipe + skips
    // the flag/_resolvedPipelines population when its own promise
    // isn't in `_pipelineCache` any more. Without this, a cancel
    // during a fresh download would leave the user with a "ready"
    // flag pointing at potentially-incomplete `CacheStorage` bytes.
    if (!pipelineRef.current) abortPendingLoad(modelId);
    if (!mountedRef.current) return;
    setStatus(pipelineRef.current ? "ready" : "idle");
    setProgress(null);
    setError(null);
  }, [modelId]);

  const reset = useCallback(() => {
    // Drop the hook's pipeline ref so a future ensureReady() doesn't
    // short-circuit to the now-torn-down handle. Reject any pending
    // consumers since the pipeline they were waiting for is gone.
    pipelineRef.current = null;
    const pending = pendingRef.current;
    pendingRef.current = [];
    for (const { reject } of pending) reject(new Error("reset"));
    if (!mountedRef.current) return;
    setStatus("idle");
    setProgress(null);
    setError(null);
  }, []);

  return {
    info,
    status,
    progress,
    error,
    ensureReady,
    confirm,
    retry,
    cancel,
    reset,
  };
}
