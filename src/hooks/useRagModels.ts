/**
 * Joint lifecycle for the three models Ask PDF needs: the chat LLM,
 * the sentence-embedding model, and the cross-encoder reranker.
 * All three are downloaded together on first use so the gate UX is
 * "Download AI" → ready, not three sequential consent dialogs.
 *
 * The chat slot has two picker tiers (Compact / Quality — see
 * `src/utils/ai-models.ts`). The active tier is held in React state
 * here so changing it re-renders downstream components with the new
 * `chat.info` and triggers a fresh consent / load for the new
 * variant. The embedder and reranker are shared across tiers —
 * swapping chat models does NOT invalidate the IndexedDB-cached
 * vector index or unload the reranker.
 *
 * Returns:
 *
 *   - `chat`        — `useAiModel` state for the active chat variant.
 *   - `embed`       — `useAiModel` state for the embedding model.
 *   - `rerank`      — `useAiModel` state for the cross-encoder reranker.
 *   - `status`      — coarse rollup ("idle" / "downloading" / "ready" /
 *     "error" / "awaiting-consent") so consumers don't have to combine
 *     the three state machines themselves.
 *   - `progress`    — merged byte-count progress across all downloads.
 *   - `chatVariant` — currently-selected tier id; drives picker UI.
 *   - `setChatVariant` — swap tiers; unloads the previous chat
 *     pipeline and resets `chat.status` to `idle` so the user re-
 *     consents (or auto-loads if the new tier is already cached).
 *   - `ensureReady()` — kicks off all three downloads and resolves
 *     with the three pipelines once they're all loaded.
 *   - `cancel()`    — dismisses all consent dialogs in lockstep.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearAllCachedIndexes } from "../rag/index.ts";
import {
  type ChatVariantId,
  clearAllReadyFlags,
  getActiveChatModelId,
  getActiveChatVariant,
  getChatModelId,
  migrateLegacyChatReadyFlag,
  setActiveChatVariant,
} from "../utils/ai-models.ts";
import {
  type AiProgress,
  cancelScheduledDispose,
  disposeAllModels,
  evictModelCacheBytes,
  isModelMarkedReady,
  type ModelCacheEvictResult,
  registerPagehideCleanup,
  scheduleDispose,
  unloadModel,
} from "../utils/ai-runtime.ts";
import { type AiModelStatus, useAiModel, type UseAiModelReturn } from "./useAiModel.ts";

export interface UseRagModelsReturn {
  chat: UseAiModelReturn;
  embed: UseAiModelReturn;
  rerank: UseAiModelReturn;
  /**
   * Coarse rollup of the three models' state machines. Priority is:
   * `error` > `downloading` > `awaiting-consent` > `loading` > `ready` > `idle`.
   * "Ready" only when *all three* models are loaded. "Loading" is
   * also reported synchronously when every model is marked ready on
   * disk and the auto-load effect is about to fire — that's what
   * keeps the gate from flashing a "Download model" button on the
   * first paint of a returning visitor.
   */
  status: AiModelStatus;
  /** Combined byte progress when at least one model is downloading. */
  progress: AiProgress | null;
  /** Combined error (chat first, then embed, then rerank) or `null`. */
  error: string | null;
  /** Currently-selected chat tier — feed into the picker UI. */
  chatVariant: ChatVariantId;
  /**
   * Swap to a different chat tier. No-op when `next === chatVariant`.
   * Unloads the previous chat pipeline so its weights stop sitting
   * in RAM, persists the choice to localStorage, and lets the hook
   * re-render with the new `chat.info`.
   */
  setChatVariant: (next: ChatVariantId) => void;
  /** Trigger consent + download for all models. */
  ensureReady: () => Promise<{ chat: object; embed: object; rerank: object }>;
  /** Approve all downloads from the consent dialog. */
  confirm: () => void;
  /** Retry all downloads after an error. */
  retry: () => void;
  /** Cancel all consent / downloads. */
  cancel: () => void;
  /**
   * Release all pipelines from memory. The browser's CacheStorage
   * keeps the bytes so re-loading is fast. Use this when the user is
   * done with AI and wants to free RAM.
   */
  dispose: () => Promise<void>;
  /**
   * Full evict — releases RAM **and** deletes the model weights
   * from the browser's CacheStorage, then clears every
   * `cloakpdf:ai-model-ready:*` flag so the consent dialog re-
   * appears on next use. Frees ~1.5 GB of disk for the current AI
   * bundle; the user pays a full re-download next time they touch
   * the AI feature. Returns the cache-evict result so the caller
   * can tell the user how much was actually deleted (0 caches
   * means there was nothing cached to begin with).
   */
  evict: () => Promise<ModelCacheEvictResult>;
  /**
   * `true` when at least one pipeline is currently loaded in RAM —
   * i.e. there's something for {@link dispose} to free. Drives the
   * "Free memory" button's disabled state: after a successful
   * dispose this flips to `false` and the button hides until a
   * re-load.
   */
  canFreeMemory: boolean;
  /**
   * `true` when at least one model is loaded in RAM *or* known to
   * have weights cached on disk (`isModelMarkedReady` set). Drives
   * the "Delete cached models" button. After {@link evict} runs the
   * flags are cleared and statuses reset, so this flips to `false`
   * — preventing the user from clicking Delete on an already-empty
   * cache.
   */
  canDelete: boolean;
}

/**
 * Combine three model statuses into one. The rules below are picked
 * so the UI surfaces the *most informative* state to the user — they
 * don't need to know there are three models behind the scenes until
 * something goes wrong.
 *
 * "loading" sits below "awaiting-consent" so a mixed state where one
 * pipeline still needs consent doesn't get masked by another that's
 * warm-loading. It sits above "ready" so the rollup never reports
 * "idle" when any pipeline is mid-construct from cache — that was the
 * gap that flashed a "Download model" button while three cached
 * pipelines were silently warm-loading.
 */
function rollupStatus(...statuses: AiModelStatus[]): AiModelStatus {
  if (statuses.includes("error")) return "error";
  if (statuses.includes("downloading")) return "downloading";
  if (statuses.includes("awaiting-consent")) return "awaiting-consent";
  if (statuses.includes("loading")) return "loading";
  if (statuses.every((s) => s === "ready")) return "ready";
  return "idle";
}

export function useRagModels(): UseRagModelsReturn {
  // One-shot migration from the pre-tier `cloakpdf:ai-model-ready:chat`
  // localStorage flag so return visitors don't see a redundant consent
  // dialog when we changed the storage-key shape. Idempotent — safe to
  // call on every mount.
  useEffect(() => {
    migrateLegacyChatReadyFlag();
  }, []);

  // Belt-and-braces: register a `pagehide` listener once per page so
  // pipelines are disposed when the tab truly closes (not bfcache).
  // Idempotent — calling more than once is a no-op.
  useEffect(() => {
    registerPagehideCleanup();
  }, []);

  // Navigation-away cleanup: when the consumer (Ask PDF today) unmounts,
  // schedule a *deferred* dispose. A short grace window survives two
  // important races:
  //
  //   1. React 18 StrictMode (dev) — mount → cleanup → mount fires
  //      synchronously. A non-deferred dispose would tear down freshly
  //      loaded pipelines that the re-mount then has to rebuild.
  //   2. Quick "back" clicks — user navigates away then immediately
  //      back; we don't want them to pay the disk-load warmup again
  //      for what was effectively a misclick.
  useEffect(() => {
    cancelScheduledDispose();
    return () => {
      scheduleDispose();
    };
  }, []);

  // Active chat tier in React state so the picker can swap it and
  // downstream components re-render with the new `chat.info`.
  const [chatVariant, setChatVariantState] = useState<ChatVariantId>(() => getActiveChatVariant());
  const chatModelId = getChatModelId(chatVariant);

  const chat = useAiModel(chatModelId);
  const embed = useAiModel("embed");
  const rerank = useAiModel("rerank");

  // Sync flash-killer. We *promote* a rollup of "idle" to "loading"
  // whenever (a) every model is flagged ready in localStorage (so the
  // auto-load `useEffect` below is about to call `ensureReady` on
  // them all) and (b) at least one sub-hook is still in `idle` state
  // (so there's actually work the auto-load is about to do).
  //
  // Reporting "loading" *during this render* (instead of waiting for
  // the post-paint effect to set state) keeps the gate on "Loading
  // model…" from the very first paint — no "Download model" button
  // flashes while the warm-load is in flight.
  //
  // Why not "all three idle": React 18 StrictMode (dev) double-
  // invokes mount → cleanup → mount. By the time mount 2 runs, the
  // module-level pipeline cache may have already resolved chat from
  // mount 1's in-flight load. `useAiModel`'s initial-status check
  // picks that up and chat enters mount 2 with `status === "ready"`
  // while embed + rerank are still `idle`. An "all three idle" guard
  // misses that branch, the rollup returns "idle", and the gate
  // flashes Download for one paint — the bug the e2e regression
  // now pins.
  const rollup = rollupStatus(chat.status, embed.status, rerank.status);
  const canAutoLoad =
    isModelMarkedReady(chatModelId) && isModelMarkedReady("embed") && isModelMarkedReady("rerank");
  const hasIdleSubHook =
    chat.status === "idle" || embed.status === "idle" || rerank.status === "idle";
  const status: AiModelStatus =
    rollup === "idle" && canAutoLoad && hasIdleSubHook ? "loading" : rollup;
  const error = chat.error ?? embed.error ?? rerank.error;

  /**
   * Return-visitor auto-load.
   *
   * When ALL THREE models are flagged as previously downloaded in
   * localStorage, kick off `ensureReady()` without waiting on a UI
   * click. Without this, only `chat` auto-loads (the gate is bound
   * to `rag.chat` and its own auto-load effect doesn't know about
   * the embedder or reranker).
   *
   * The guard is rekeyed by `chatVariant` so swapping tiers re-arms
   * auto-load for the *new* tier — if the user picked something they
   * already cached, the warm-load fires automatically.
   */
  const attemptedRef = useRef<ChatVariantId | null>(null);
  useEffect(() => {
    if (attemptedRef.current === chatVariant) return;
    if (
      !isModelMarkedReady(chatModelId) ||
      !isModelMarkedReady("embed") ||
      !isModelMarkedReady("rerank")
    ) {
      return;
    }
    // Deliberately *not* gated on "all three sub-hooks still idle".
    // {@link AiModelGate} ships its own chat-only auto-load that
    // fires from a child useEffect — and child effects run *before*
    // this parent effect on the same render. By the time we get here
    // on first mount, `chat.status` has already flipped to "loading"
    // and an idle-only guard would (silently) skip the all-three
    // load; embed + rerank would stay idle forever, the rollup would
    // drop to "idle" once chat finished, and the gate would flash
    // "Download model" — exactly the bug the e2e regression now
    // pins. `ensureReady()` is idempotent on a loading/ready
    // pipeline (queues another consumer, no fresh fetch), so re-
    // calling it on chat is safe.
    attemptedRef.current = chatVariant;
    void Promise.all([chat.ensureReady(), embed.ensureReady(), rerank.ensureReady()]).catch(() => {
      // Each `useAiModel` already routes failures into its own `error`
      // state — the rollup surfaces them.
    });
  }, [chat, embed, rerank, chatVariant, chatModelId]);

  // Combined progress: a single bar that tracks the *whole* bundle,
  // not three leapfrogging ones.
  //
  // **Why this isn't just `sum(model.progress)`.** Two bugs an earlier
  // naive aggregator hit, both visible to the user:
  //
  //   1. When a model finishes, `useAiModel` clears its `progress` to
  //      null. A naive sum would then drop that model's bytes from
  //      both `loaded` and `total`, so the bar would either crash
  //      backwards (if `total` was the only term using the
  //      registry-estimate fallback) or stall at a fraction (if
  //      `total` kept the estimate but `loaded` lost the bytes).
  //   2. Transformers.js often reports a per-file `total` that's a
  //      few percent below the registry's `approxSizeBytes` estimate
  //      (different quant builds, packaging overhead). With the
  //      registry estimate as the denominator and reported bytes as
  //      the numerator, the percent caps below 100% — the canonical
  //      "stopped at 85%" symptom that triggered this rewrite.
  //
  // The fix: each model contributes max(reported, registry-estimate)
  // to `total` regardless of status, and contributes its **full**
  // expected size to `loaded` the moment its status flips to
  // "ready". Active downloads contribute their reported `loaded`.
  // Idle / awaiting-consent models contribute 0 to loaded but still
  // their full size to total — so the bar starts at a realistic
  // small percent and climbs smoothly to 100% as each model
  // completes, with no mid-stream resets.
  const progress: AiProgress | null = useMemo(() => {
    const items = [chat, embed, rerank];
    // Render the combined bar while anything is actively moving OR
    // anything has reported partial progress. Once *everything* is
    // ready/idle/error, return null so the dialog can close.
    const anyActive = items.some(
      (m) => m.progress != null || m.status === "downloading" || m.status === "loading",
    );
    if (!anyActive) return null;

    let loaded = 0;
    let total = 0;
    let file = "";
    let statusText = "Downloading";

    for (const m of items) {
      // Each model's expected contribution = max(reported-total, registry-estimate).
      // The max() protects against Transformers.js under-reporting; the registry
      // estimate is itself an approximation, so a slightly-high reported total
      // still wins.
      const expected = Math.max(m.progress?.total ?? 0, m.info.approxSizeBytes);
      total += expected;

      if (m.status === "ready") {
        // Done — count the full expected size as loaded so the percent
        // reaches 100% on the last model finishing, instead of capping
        // at whatever the reported sum was.
        loaded += expected;
      } else if (m.progress) {
        loaded += m.progress.loaded;
        file ||= m.progress.file;
        statusText = m.progress.status ?? statusText;
      }
      // idle / awaiting-consent / error: contribute 0 to `loaded`,
      // but their `expected` is already in `total` so the bar
      // accurately shows "this much of the whole still to go".
    }

    return { loaded, total, file, status: statusText };
  }, [chat, embed, rerank]);

  const ensureReady = useCallback(async () => {
    const [chatPipe, embedPipe, rerankPipe] = await Promise.all([
      chat.ensureReady(),
      embed.ensureReady(),
      rerank.ensureReady(),
    ]);
    return { chat: chatPipe, embed: embedPipe, rerank: rerankPipe };
  }, [chat, embed, rerank]);

  const confirm = useCallback(() => {
    chat.confirm();
    embed.confirm();
    rerank.confirm();
  }, [chat, embed, rerank]);

  const retry = useCallback(() => {
    chat.retry();
    embed.retry();
    rerank.retry();
  }, [chat, embed, rerank]);

  const cancel = useCallback(() => {
    chat.cancel();
    embed.cancel();
    rerank.cancel();
  }, [chat, embed, rerank]);

  /**
   * Swap chat tiers. We unload the previous chat pipeline so its
   * weights stop sitting in RAM; CacheStorage on disk is left intact
   * so re-selecting that tier later warm-loads in a second or two
   * rather than re-downloading. The embedder and reranker are shared
   * across tiers and stay resident.
   */
  const setChatVariant = useCallback(
    (next: ChatVariantId) => {
      if (next === chatVariant) return;
      const previousId = getActiveChatModelId();
      setActiveChatVariant(next);
      setChatVariantState(next);
      void unloadModel(previousId);
    },
    [chatVariant],
  );

  const dispose = useCallback(async () => {
    await disposeAllModels();
    // `disposeAllModels` only clears the runtime-level pipeline
    // cache; without these resets each sub-hook keeps its local
    // `status === "ready"` state forever even though the underlying
    // pipeline is gone. That's the bug that made the "Free memory"
    // button stay enabled after a successful click. Resetting each
    // hook drops them to "idle"; the rollup re-derives from there.
    chat.reset();
    embed.reset();
    rerank.reset();
    // Reset the auto-load guard so a fresh ensureReady() on a
    // post-dispose return-visitor re-fires correctly instead of
    // being skipped by the "I already tried this variant" check.
    attemptedRef.current = null;
  }, [chat, embed, rerank]);

  /**
   * Full evict path. Ordering matters: drop RAM first so no
   * pipeline is mid-init when we yank the bytes from underneath it,
   * then evict CacheStorage, then wipe the IndexedDB vector cache,
   * then clear the consent flags so the user re-experiences the
   * consent dialog (and the migration guard) on next use.
   *
   * The IndexedDB wipe ({@link clearAllCachedIndexes}) is *not*
   * optional. Without it, "Delete cached models" leaves every
   * previously-indexed PDF's embeddings sitting on disk; the user
   * re-uploads the same file expecting a clean slate and instead
   * gets a silent rehydrate (no re-extract, no re-embed) because
   * `getCachedIndex(sha256)` still hits. That's a surprise — Delete
   * is meant to mean *everything*, and the embeddings were produced
   * by models we just deleted, so they're stale-by-association even
   * if the bytes-on-disk match.
   *
   * Cache + flag + index clears are independent and best-effort — a
   * private-mode failure on any one shouldn't roll back the others.
   */
  const evict = useCallback(async (): Promise<ModelCacheEvictResult> => {
    await disposeAllModels();
    const result = await evictModelCacheBytes();
    await clearAllCachedIndexes();
    clearAllReadyFlags();
    // Same reasoning as `dispose`: tell each sub-hook the pipeline
    // is gone so the rollup status drops to "idle" and the UI re-
    // renders with the buttons disabled.
    chat.reset();
    embed.reset();
    rerank.reset();
    attemptedRef.current = null;
    return result;
  }, [chat, embed, rerank]);

  // Derived booleans for the storage-action buttons. Recomputed on
  // every render so flag clears + status resets propagate without
  // any extra subscription plumbing. `chatModelId` already keys off
  // the active chat variant, so a tier swap reads the right flag.
  const canFreeMemory =
    chat.status === "ready" || embed.status === "ready" || rerank.status === "ready";
  const canDelete =
    canFreeMemory ||
    isModelMarkedReady(chatModelId) ||
    isModelMarkedReady("embed") ||
    isModelMarkedReady("rerank");

  return {
    chat,
    embed,
    rerank,
    status,
    progress,
    error,
    chatVariant,
    setChatVariant,
    ensureReady,
    confirm,
    retry,
    cancel,
    dispose,
    evict,
    canFreeMemory,
    canDelete,
  };
}
