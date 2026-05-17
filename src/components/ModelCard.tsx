/**
 * Read-only metadata card for a single AI model: name, role badge,
 * one-paragraph description, then a dl of repo / size / licence /
 * "used for" / Hugging Face source link.
 *
 * Shared between {@link AiModelDetailsModal} (purely informational,
 * reachable from a "View details" link) and {@link AiConsentModal}
 * (the consent + download flow). Keeping a single card definition
 * means the two modals read as one system instead of two
 * gently-diverging variants of the same content.
 */
import { ExternalLink } from "lucide-react";
import type { AiModelInfo } from "../utils/ai-models.ts";
import { formatFileSize } from "../utils/file-helpers.ts";

interface ModelCardProps {
  info: AiModelInfo;
  /**
   * Optional role label rendered as a pill in the top-right of the
   * card — e.g. `"chat"` / `"retrieval"`. Use when the surrounding
   * context shows multiple models and the user needs to tell them
   * apart quickly.
   */
  role?: string;
}

export function ModelCard({ info, role }: ModelCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-dark-border bg-slate-50/60 dark:bg-dark-surface-alt/60 p-4 text-sm">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="font-semibold text-slate-800 dark:text-dark-text wrap-anywhere">
          {info.displayName}
        </span>
        {role && (
          <span className="shrink-0 text-xxs uppercase tracking-wider text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 rounded px-1.5 py-0.5 font-medium">
            {role}
          </span>
        )}
      </div>

      {/* Plain-prose lead so users see *why* this model is loaded before
          they scan the technical metadata table below. */}
      <p className="text-xs text-slate-600 dark:text-dark-text-muted leading-relaxed mb-3">
        {info.description}
      </p>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-slate-600 dark:text-dark-text-muted text-xs">
        {info.bestFor && (
          <>
            <dt className="font-medium text-slate-500 dark:text-dark-text-muted">Used for</dt>
            <dd className="text-slate-800 dark:text-dark-text leading-relaxed">{info.bestFor}</dd>
          </>
        )}
        <dt className="font-medium text-slate-500 dark:text-dark-text-muted">Repo</dt>
        <dd className="text-slate-800 dark:text-dark-text font-mono wrap-anywhere">{info.repo}</dd>
        <dt className="font-medium text-slate-500 dark:text-dark-text-muted">Size</dt>
        <dd className="text-slate-800 dark:text-dark-text tabular-nums">
          {formatFileSize(info.approxSizeBytes)}
        </dd>
        <dt className="font-medium text-slate-500 dark:text-dark-text-muted">Licence</dt>
        <dd className="text-slate-800 dark:text-dark-text">{info.license}</dd>
        <dt className="font-medium text-slate-500 dark:text-dark-text-muted">Source</dt>
        <dd>
          <a
            href={info.modelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 transition-colors"
          >
            View full disclosure on Hugging Face
            <ExternalLink className="w-3 h-3" />
          </a>
        </dd>
      </dl>
    </div>
  );
}
