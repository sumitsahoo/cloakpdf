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
  type AiPipeline,
  type AiProgress,
  getResolvedPipeline,
  isModelMarkedReady,
  loadPipeline,
} from "../utils/ai-runtime.ts";
import { errorMessage } from "../utils/file-helpers.ts";

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
      if (!mountedRef.current) return;
      const msg = errorMessage(
        e,
        "Failed to download the AI model. Check your connection and try again.",
      );
      setStatus("error");
      setError(msg);
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
    if (!mountedRef.current) return;
    setStatus(pipelineRef.current ? "ready" : "idle");
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
  };
}
