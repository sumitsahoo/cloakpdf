/**
 * Joint lifecycle for the two models Ask PDF needs: the chat LLM and
 * the sentence-embedding model. Both are downloaded together on first
 * use so the gate UX is "Download AI" → ready, not two sequential
 * consent dialogs.
 *
 * Returns:
 *
 *   - `chat`   — `useAiModel` state for SmolLM2.
 *   - `embed`  — `useAiModel` state for MiniLM.
 *   - `status` — coarse rollup ("idle" / "downloading" / "ready" /
 *     "error" / "awaiting-consent") so consumers don't have to combine
 *     the two state machines themselves.
 *   - `progress` — merged byte-count progress across both downloads.
 *   - `ensureReady()` — kicks off both downloads and resolves with the
 *     two pipelines once both are loaded. Rejects on cancel/error.
 *   - `cancel()` — dismisses both consent dialogs in lockstep.
 */
import { useCallback, useMemo } from "react";
import type { AiProgress } from "../utils/ai-runtime.ts";
import { type AiModelStatus, useAiModel, type UseAiModelReturn } from "./useAiModel.ts";

export interface UseRagModelsReturn {
  chat: UseAiModelReturn;
  embed: UseAiModelReturn;
  /**
   * Coarse rollup of the two models' state machines. Priority is:
   * `error` > `downloading` > `awaiting-consent` > `idle` > `ready`.
   * "Ready" only when *both* models are loaded.
   */
  status: AiModelStatus;
  /** Combined byte progress when at least one model is downloading. */
  progress: AiProgress | null;
  /** Combined error (chat first, then embed) or `null`. */
  error: string | null;
  /** Trigger consent + download for both models. */
  ensureReady: () => Promise<{ chat: object; embed: object }>;
  /** Approve both downloads from the consent dialog. */
  confirm: () => void;
  /** Retry both downloads after an error. */
  retry: () => void;
  /** Cancel both consent / downloads. */
  cancel: () => void;
}

/**
 * Combine two model statuses into one. The rules above are picked so
 * the UI surfaces the *most informative* state to the user — they don't
 * need to know there are two models behind the scenes until something
 * goes wrong.
 */
function rollupStatus(a: AiModelStatus, b: AiModelStatus): AiModelStatus {
  if (a === "error" || b === "error") return "error";
  if (a === "downloading" || b === "downloading") return "downloading";
  if (a === "awaiting-consent" || b === "awaiting-consent") return "awaiting-consent";
  if (a === "ready" && b === "ready") return "ready";
  return "idle";
}

export function useRagModels(): UseRagModelsReturn {
  const chat = useAiModel("chat");
  const embed = useAiModel("embed");

  const status = rollupStatus(chat.status, embed.status);
  const error = chat.error ?? embed.error;

  // Combined progress: sum the loaded/total bytes when at least one
  // model is downloading. Keeps the consent dialog showing a single
  // bar that tracks the *whole* download, not two leapfrogging ones.
  const progress: AiProgress | null = useMemo(() => {
    const a = chat.progress;
    const b = embed.progress;
    if (!a && !b) return null;
    const loaded = (a?.loaded ?? 0) + (b?.loaded ?? 0);
    const total = (a?.total ?? 0) + (b?.total ?? 0);
    // Prefer the file label from whichever model is actively downloading.
    const file = a?.file || b?.file || "";
    const statusText = a?.status ?? b?.status ?? "Downloading";
    return { loaded, total, file, status: statusText };
  }, [chat.progress, embed.progress]);

  const ensureReady = useCallback(async () => {
    const [chatPipe, embedPipe] = await Promise.all([chat.ensureReady(), embed.ensureReady()]);
    return { chat: chatPipe, embed: embedPipe };
  }, [chat, embed]);

  const confirm = useCallback(() => {
    chat.confirm();
    embed.confirm();
  }, [chat, embed]);

  const retry = useCallback(() => {
    chat.retry();
    embed.retry();
  }, [chat, embed]);

  const cancel = useCallback(() => {
    chat.cancel();
    embed.cancel();
  }, [chat, embed]);

  return { chat, embed, status, progress, error, ensureReady, confirm, retry, cancel };
}
