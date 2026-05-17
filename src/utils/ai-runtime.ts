/**
 * Thin wrapper around @huggingface/transformers' `pipeline()` factory.
 *
 * Centralised so the rest of the app:
 *
 *   - imports Transformers.js lazily (heavy WASM + onnxruntime payload).
 *   - sees the same env configuration everywhere (no local models, browser
 *     cache enabled, WebGPU when available with WASM as the fallback).
 *   - receives a single coalesced progress signal (overall loaded / total
 *     bytes plus the file currently downloading) instead of the raw
 *     per-event payloads that Transformers.js emits.
 *   - re-uses a single pipeline instance per model — once a pipeline is
 *     loaded it stays in memory until the page unloads.
 */
import { type AiModelId, getModelInfo } from "./ai-models.ts";

/**
 * Public type for a loaded pipeline instance. Transformers.js exposes
 * one concrete class per task (e.g. `TokenClassificationPipeline`) and
 * the unions are awkward to spell out; every call site immediately
 * casts to a task-specific callable signature, so a single opaque
 * handle is enough at this boundary.
 */
export type AiPipeline = object;

/** Coalesced progress snapshot delivered to the UI. */
export interface AiProgress {
  /** Bytes downloaded so far across every file in the model. */
  loaded: number;
  /**
   * Total bytes for files we've seen so far. May grow as Transformers.js
   * discovers additional files mid-download — keep that in mind when
   * computing a percent.
   */
  total: number;
  /** Name of the file currently being downloaded. */
  file: string;
  /** Status string suitable for showing under the progress bar. */
  status: string;
}

let _transformers: typeof import("@huggingface/transformers") | null = null;
const _pipelineCache = new Map<AiModelId, Promise<AiPipeline>>();
/**
 * Synchronously-resolvable handle to a pipeline that has finished
 * loading. Lets {@link getResolvedPipeline} hand the same in-memory
 * instance to a freshly mounted hook without going through a Promise —
 * which is what fixes the "I already downloaded this, why am I being
 * asked again?" UX bug on remount.
 */
const _resolvedPipelines = new Map<AiModelId, AiPipeline>();

/**
 * `localStorage` key used to remember that a model has loaded successfully
 * at least once in this browser. The `isModelMarkedReady` flag isn't proof
 * the bytes are still in CacheStorage (the browser can evict under storage
 * pressure), but it's a cheap way to skip the consent dialog on return
 * visits when the cache is overwhelmingly likely to be warm.
 */
const READY_FLAG_PREFIX = "cloakpdf:ai-model-ready:";

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    // Some embed contexts (private windows, sandboxed iframes) throw on access.
    return null;
  }
}

/**
 * `true` when a previous session already finished downloading this model.
 * Tools use this to skip the consent dialog and load the pipeline
 * directly when the cache is (almost certainly) warm.
 */
export function isModelMarkedReady(modelId: AiModelId): boolean {
  const storage = safeLocalStorage();
  return storage?.getItem(READY_FLAG_PREFIX + modelId) === "1";
}

/** Persist the "downloaded once" flag. Best-effort — failures are silent. */
function markModelReady(modelId: AiModelId): void {
  const storage = safeLocalStorage();
  try {
    storage?.setItem(READY_FLAG_PREFIX + modelId, "1");
  } catch {
    // ignore (storage full / blocked)
  }
}

/**
 * Forget that a model has been downloaded — the consent dialog will
 * reappear next time it's needed. Use this when the user explicitly asks
 * to re-download from scratch after a corruption or partial download.
 * Does not delete bytes from CacheStorage; only the in-memory pipeline
 * and the localStorage hint.
 */
export function forgetModel(modelId: AiModelId): void {
  const storage = safeLocalStorage();
  try {
    storage?.removeItem(READY_FLAG_PREFIX + modelId);
  } catch {
    // ignore
  }
  _pipelineCache.delete(modelId);
  _resolvedPipelines.delete(modelId);
}

/**
 * Sync-evict an in-flight {@link loadPipeline} promise so its
 * late-arrival check (inside the loader) trips and the resolved
 * pipeline is discarded without setting the ready flag or
 * re-populating runtime state.
 *
 * Used by {@link useAiModel.cancel} when the user explicitly bails
 * out of a download via the consent dialog — without this, the
 * underlying fetch (Transformers.js doesn't expose an abort signal)
 * runs to completion, sets `markModelReady`, and the user comes back
 * to a half-downloaded `localStorage` flag pointing at potentially-
 * incomplete `CacheStorage` bytes. Next visit auto-loads, fails
 * mid-construct, surfaces a generic error, and the user is stuck
 * until they hit "Delete cached models" — even though they thought
 * they'd already cancelled cleanly.
 *
 * Does not touch any `_resolvedPipelines` entry — only the in-flight
 * promise reference. If the pipeline somehow finished resolving
 * before this runs (race), the late-arrival check will see the
 * cleared cache slot and discard the pipe.
 */
export function abortPendingLoad(modelId: AiModelId): void {
  _pipelineCache.delete(modelId);
}

/**
 * Release the in-memory pipeline for a model without touching the
 * "downloaded once" flag. The browser's CacheStorage keeps the bytes
 * so re-loading is cheap. Used when the user switches chat tiers so
 * the old model's weights and KV cache stop sitting in RAM. Best-
 * effort: if the pipeline's `dispose()` method throws (or doesn't
 * exist in older Transformers.js versions) we still drop our refs so
 * GC can reclaim the memory eventually.
 */
export async function unloadModel(modelId: AiModelId): Promise<void> {
  const pipe = _resolvedPipelines.get(modelId);
  _resolvedPipelines.delete(modelId);
  _pipelineCache.delete(modelId);
  if (!pipe) return;
  const disposable = pipe as { dispose?: () => Promise<void> | void };
  if (typeof disposable.dispose === "function") {
    try {
      await disposable.dispose();
    } catch {
      // Best-effort — the references are dropped above so GC will
      // catch up even if the runtime didn't tear cleanly down.
    }
  }
}

/**
 * Synchronously return the in-memory pipeline for `modelId` if it
 * finished loading earlier in this page session, else `null`. Used by
 * {@link useAiModel} on mount to skip the consent flow when a previous
 * mount already paid the load cost — `_pipelineCache` only stores the
 * Promise, so this map lets us answer the "is it done?" question
 * without awaiting.
 */
export function getResolvedPipeline(modelId: AiModelId): AiPipeline | null {
  return _resolvedPipelines.get(modelId) ?? null;
}

/**
 * Iterate every loaded pipeline and call {@link unloadModel} on it.
 *
 * Memory hygiene: the browser reclaims the tab's JS heap and WASM
 * memory automatically when the user closes the tab, so this isn't
 * strictly required for "close the app" cleanup. We call it from
 * `pagehide` anyway as defense-in-depth, and expose it for the
 * "Free model memory" affordance in the UI — useful when the user has
 * finished using AI but wants to keep the rest of the app running
 * without ~300 MB of pipelines resident.
 */
export async function disposeAllModels(): Promise<void> {
  // Cover both fully-loaded pipelines AND in-flight downloads. The
  // download itself isn't abortable (Transformers.js doesn't expose
  // one), but dropping our promise reference + cache entry means the
  // resolved pipeline — if it eventually arrives — won't sit in memory
  // without a consumer.
  const ids = new Set<AiModelId>([..._resolvedPipelines.keys(), ..._pipelineCache.keys()]);
  await Promise.all([...ids].map((id) => unloadModel(id)));
}

/**
 * Deferred-dispose helpers.
 *
 * React 18 StrictMode (dev only) double-invokes effects: mount →
 * cleanup → mount. A synchronous `disposeAllModels()` in the cleanup
 * would tear down the pipelines we just loaded — and the re-mount path
 * then has to start over. {@link scheduleDispose} arms a short timer
 * instead; {@link cancelScheduledDispose} disarms it when a remount
 * fires soon after. The same machinery doubles as a small grace period
 * for production navigations where the user immediately clicks back.
 *
 * 250 ms is enough to cover StrictMode's synchronous remount and
 * "oops, I meant to click that other tool" clicks, but short enough
 * that a genuine navigation away frees memory promptly.
 */
let _disposeTimer: ReturnType<typeof setTimeout> | null = null;
const DISPOSE_DELAY_MS = 250;

export function scheduleDispose(): void {
  if (_disposeTimer !== null) return;
  _disposeTimer = setTimeout(() => {
    _disposeTimer = null;
    void disposeAllModels();
  }, DISPOSE_DELAY_MS);
}

export function cancelScheduledDispose(): void {
  if (_disposeTimer === null) return;
  clearTimeout(_disposeTimer);
  _disposeTimer = null;
}

/**
 * Cache-name(s) Transformers.js uses for model weight storage when
 * `env.useBrowserCache` is true. v3/v4 default to a single
 * `transformers-cache` entry; we delete it whole rather than walking
 * the URL list because (a) it's the simplest correct evict and (b)
 * it also reclaims orphan bytes from models that were swapped out of
 * the registry (SmolLM2, bge-reranker-v2-m3, bge-reranker-base) but
 * left their weights sitting in CacheStorage forever after.
 *
 * Add additional names here if a future Transformers.js bump moves
 * to a versioned cache key (`transformers-cache-v5` etc.).
 */
const TRANSFORMERS_CACHE_NAMES = ["transformers-cache"];

/**
 * Result of an evict pass — what we tell the user back in the UI.
 *
 *   - `deletedCaches`: number of CacheStorage entries we successfully
 *     dropped. 0 means there was nothing cached (e.g. user never
 *     downloaded), 1 means we wiped the canonical Transformers.js
 *     cache, >1 only happens if we add additional cache names above.
 *   - `cacheApiAvailable`: `false` on the rare browser that doesn't
 *     expose the Cache API at all (very old engines / privacy modes).
 *     The UI uses this to fall back to "Free memory only" copy
 *     instead of pretending the eviction succeeded.
 */
export interface ModelCacheEvictResult {
  deletedCaches: number;
  cacheApiAvailable: boolean;
}

/**
 * Evict the Transformers.js model bytes from the browser's
 * CacheStorage. Frees roughly 1.2 GB on the Compact tier / 1.9 GB on
 * Quality for the current AI bundle (chat + embed + rerank) and
 * forces a fresh download on next use.
 *
 * Does **not** unload the in-memory pipelines — call
 * {@link disposeAllModels} alongside this when you actually want the
 * full evict. The hook layer in {@link useRagModels.evict} chains
 * both for the UI affordance.
 *
 * Also does not clear the localStorage ready flags
 * (`cloakpdf:ai-model-ready:*`) — that's
 * {@link clearAllReadyFlags}'s job. Three small functions instead of
 * one big one so the orchestration is testable and the failure modes
 * stay independent (e.g. CacheStorage delete succeeds but the
 * localStorage clear throws on a private window — we don't want to
 * roll back the disk eviction over that).
 */
export async function evictModelCacheBytes(): Promise<ModelCacheEvictResult> {
  if (typeof caches === "undefined") {
    return { deletedCaches: 0, cacheApiAvailable: false };
  }
  let deleted = 0;
  for (const name of TRANSFORMERS_CACHE_NAMES) {
    try {
      const ok = await caches.delete(name);
      if (ok) deleted += 1;
    } catch (e) {
      // Best-effort — a failure on one entry shouldn't abort the
      // rest. We don't surface this to the user because there's
      // nothing actionable; the failure mode is "the bytes are still
      // there and will be re-evicted next time the user clicks
      // delete". The console log is for triage.
      console.warn(`[ai-runtime] failed to delete CacheStorage "${name}"`, e);
    }
  }
  return { deletedCaches: deleted, cacheApiAvailable: true };
}

/**
 * Best-effort `pagehide` handler that releases pipelines when the tab
 * is going away for real (`event.persisted === false`). For bfcache
 * navigations (`persisted === true`) the JS is frozen and we leave the
 * pipelines in place so the user comes back to a warm app.
 *
 * Idempotent: calling more than once just no-ops on subsequent calls.
 */
let _pagehideRegistered = false;
export function registerPagehideCleanup(): void {
  if (_pagehideRegistered || typeof window === "undefined") return;
  _pagehideRegistered = true;
  window.addEventListener(
    "pagehide",
    (event) => {
      if (event.persisted) return;
      void disposeAllModels();
    },
    { passive: true },
  );
}

/**
 * Lazily import Transformers.js. The first call carries the cost of
 * pulling the WASM runtime; subsequent calls are essentially free.
 */
async function getTransformers(): Promise<typeof import("@huggingface/transformers")> {
  if (!_transformers) {
    _transformers = await import("@huggingface/transformers");
    // Force CDN fetches — we don't ship the models in our bundle.
    _transformers.env.allowLocalModels = false;
    // Persist downloads in the browser Cache API so repeat visits work
    // offline and the service worker can intercept them.
    _transformers.env.useBrowserCache = true;
  }
  return _transformers;
}

/** `true` when this page supports WebGPU and the navigator exposes it. */
async function detectWebGpu(): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    const adapter = await gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

/**
 * Resolve (or reuse) a Transformers.js pipeline for the given model.
 *
 * Multiple concurrent callers asking for the same model share the same
 * promise so we don't kick off two downloads in parallel.
 *
 * The progress callback aggregates per-file events into a single
 * loaded/total pair across the whole model. We emit a `status: "ready"`
 * snapshot at the very end so the UI can advance even when the last
 * `progress` event from Transformers.js carries stale numbers.
 */
export async function loadPipeline(
  modelId: AiModelId,
  onProgress?: (p: AiProgress) => void,
): Promise<AiPipeline> {
  const existing = _pipelineCache.get(modelId);
  if (existing) return existing;

  const info = getModelInfo(modelId);

  // Self-reference holder so the IIFE below can compare its own
  // promise against whatever's currently in `_pipelineCache`. By the
  // time the IIFE's first `await` lands, `handle.promise` is already
  // assigned (the IIFE expression evaluates synchronously through its
  // first await, then the assignment statement runs, then the IIFE
  // resumes). TypeScript can't reason about that ordering on a bare
  // `let promise: Promise<...>` declaration, so we wrap in an object
  // whose field is optional.
  const handle: { promise?: Promise<AiPipeline> } = {};
  handle.promise = (async () => {
    const t = await getTransformers();
    const useWebGpu = await detectWebGpu();

    // Track per-file bytes so a model with N weight shards reports a
    // single rolled-up progress to the UI.
    const fileBytes = new Map<string, { loaded: number; total: number }>();
    // Files marked "done". Subsequent stale "progress" events from
    // Transformers.js are ignored — without this, late progress events
    // can briefly drag the aggregated total backwards once a file has
    // already been finalised.
    const fileDone = new Set<string>();
    let currentFile = "";

    const progressCallback = (e: unknown) => {
      const event = e as {
        status?: string;
        file?: string;
        name?: string;
        progress?: number;
        loaded?: number;
        total?: number;
      };
      if (!event || typeof event !== "object") return;
      const file = event.file ?? event.name ?? "";

      switch (event.status) {
        case "initiate":
          if (file && !fileBytes.has(file)) {
            fileBytes.set(file, { loaded: 0, total: 0 });
          }
          currentFile = file || currentFile;
          break;
        case "download":
          currentFile = file || currentFile;
          break;
        case "progress": {
          if (!file || fileDone.has(file)) break;
          fileBytes.set(file, {
            loaded: Math.max(0, event.loaded ?? 0),
            total: Math.max(0, event.total ?? 0),
          });
          currentFile = file;
          break;
        }
        case "done": {
          if (file) {
            const prev = fileBytes.get(file);
            // Mark this file as fully downloaded (loaded == total).
            const total = prev?.total ?? event.total ?? 0;
            fileBytes.set(file, { loaded: total, total });
            fileDone.add(file);
          }
          break;
        }
        default:
          return;
      }

      let loaded = 0;
      let total = 0;
      for (const v of fileBytes.values()) {
        loaded += v.loaded;
        total += v.total;
      }

      onProgress?.({
        loaded,
        total,
        file: currentFile,
        status: event.status === "done" ? "Verifying…" : "Downloading model",
      });
    };

    try {
      const pipe = await t.pipeline(info.task, info.repo, {
        progress_callback: progressCallback,
        ...(useWebGpu ? { device: "webgpu" } : {}),
        ...info.pipelineOptions,
      });

      // Late-arrival check. If our promise was evicted from the cache
      // while `t.pipeline(...)` was in flight, the original consumer
      // is gone (user cancelled the consent dialog, switched chat
      // tier, or navigated away long enough for `scheduleDispose` to
      // fire). Without this check we'd still:
      //   - Mark the model ready in localStorage — but the bytes the
      //     user *intentionally* abandoned would silently get treated
      //     as a successful download. Next visit auto-loads against
      //     a half-finished CacheStorage entry, fails mid-construct,
      //     and the user is stuck in error state without realising
      //     the prior cancel caused it.
      //   - Re-populate `_resolvedPipelines`, defeating the dispose
      //     that just freed ~2 GB of WebGPU/WASM RAM. The orphan
      //     pipeline sits resident with no consumer.
      // Discard the pipe instead (best-effort dispose to free GPU
      // resources synchronously where possible), and reject the
      // promise — consumers were already gone, so the rejection is
      // a no-op for them.
      if (_pipelineCache.get(modelId) !== handle.promise) {
        const disposable = pipe as { dispose?: () => Promise<void> | void };
        if (typeof disposable.dispose === "function") {
          try {
            await disposable.dispose();
          } catch {
            // best-effort
          }
        }
        throw new Error("load-cancelled");
      }

      // Final "ready" tick so the UI can close the dialog confidently.
      let total = 0;
      let loaded = 0;
      for (const v of fileBytes.values()) {
        total += v.total;
        loaded += v.loaded;
      }
      onProgress?.({
        loaded: Math.max(loaded, total),
        total,
        file: currentFile,
        status: "Ready",
      });

      // Persist a flag so future visits can skip the consent prompt when
      // the model is (overwhelmingly likely to be) still in CacheStorage.
      markModelReady(modelId);
      // Make the in-memory pipeline synchronously discoverable on the
      // next hook mount (see {@link getResolvedPipeline}).
      _resolvedPipelines.set(modelId, pipe as AiPipeline);

      return pipe as AiPipeline;
    } catch (err) {
      // On failure, drop the cached promise so the next attempt re-runs
      // the whole pipeline factory rather than re-resolving the failed one.
      // `delete(...)` is a no-op if a later writer already replaced our
      // entry (in which case the late-arrival check above tripped and
      // we're not the cache's owner anyway).
      if (_pipelineCache.get(modelId) === handle.promise) {
        _pipelineCache.delete(modelId);
      }
      throw err;
    }
  })();

  _pipelineCache.set(modelId, handle.promise);
  return handle.promise;
}

/**
 * `true` when the pipeline for `modelId` is already resolved in this
 * tab — i.e. a previous call to {@link loadPipeline} succeeded and the
 * weights are in memory. We can't cheaply check whether the *browser
 * cache* has the weights without kicking off a fetch, so this only
 * detects the in-memory case; first-time loads still go through the
 * full consent flow.
 */
export function isPipelineReady(modelId: AiModelId): boolean {
  return _pipelineCache.has(modelId);
}
