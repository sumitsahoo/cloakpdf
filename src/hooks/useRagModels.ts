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
import {
  type ChatVariantId,
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
  isModelMarkedReady,
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
   * `error` > `downloading` > `awaiting-consent` > `idle` > `ready`.
   * "Ready" only when *all three* models are loaded.
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
}

/**
 * Combine three model statuses into one. The rules below are picked
 * so the UI surfaces the *most informative* state to the user — they
 * don't need to know there are three models behind the scenes until
 * something goes wrong.
 */
function rollupStatus(...statuses: AiModelStatus[]): AiModelStatus {
  if (statuses.includes("error")) return "error";
  if (statuses.includes("downloading")) return "downloading";
  if (statuses.includes("awaiting-consent")) return "awaiting-consent";
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

  const status = rollupStatus(chat.status, embed.status, rerank.status);
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
    if (chat.status !== "idle" || embed.status !== "idle" || rerank.status !== "idle") return;
    if (
      !isModelMarkedReady(chatModelId) ||
      !isModelMarkedReady("embed") ||
      !isModelMarkedReady("rerank")
    ) {
      return;
    }
    attemptedRef.current = chatVariant;
    void Promise.all([chat.ensureReady(), embed.ensureReady(), rerank.ensureReady()]).catch(() => {
      // Each `useAiModel` already routes failures into its own `error`
      // state — the rollup surfaces them.
    });
  }, [chat, embed, rerank, chatVariant, chatModelId]);

  // Combined progress: sum the loaded/total bytes when at least one
  // model is downloading. Keeps the consent dialog showing a single
  // bar that tracks the *whole* download, not three leapfrogging ones.
  const progress: AiProgress | null = useMemo(() => {
    const sources = [chat.progress, embed.progress, rerank.progress];
    if (sources.every((p) => !p)) return null;
    let loaded = 0;
    let total = 0;
    let file = "";
    let statusText = "Downloading";
    for (const s of sources) {
      if (!s) continue;
      loaded += s.loaded;
      total += s.total;
      file ||= s.file;
      statusText = s.status ?? statusText;
    }
    return { loaded, total, file, status: statusText };
  }, [chat.progress, embed.progress, rerank.progress]);

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
  }, []);

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
  };
}
