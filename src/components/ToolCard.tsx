/**
 * Clickable card displayed on the home screen for each available tool.
 *
 * Shows the tool's icon, title, and a short description. Hover state
 * adds a subtle border highlight, lift, and a cursor-tracking spotlight
 * glow effect. A small chevron slides in at the bottom-right on hover.
 *
 * Wrapped in `React.memo` — the parent passes a single stable
 * `onSelect` callback (via `useCallback`) and each `tool` reference
 * comes from a module-level constant array, so cards skip re-renders
 * when unrelated state (e.g. the search query) changes.
 */

import { ArrowRight, MemoryStick } from "lucide-react";
import { memo } from "react";
import { useSpotlightGlow } from "../hooks/useSpotlightGlow.ts";
import type { Tool, ToolId } from "../types.ts";

const SPOTLIGHT_GLOW = "rgba(37,99,235,0.16)";

interface ToolCardProps {
  tool: Tool;
  onSelect: (id: ToolId) => void;
}

export const ToolCard = memo(function ToolCard({ tool, onSelect }: ToolCardProps) {
  const { ref, glowStyle, handlers } = useSpotlightGlow({ color: SPOTLIGHT_GLOW });
  const Icon = tool.icon;

  return (
    <button
      type="button"
      ref={ref}
      onClick={() => onSelect(tool.id as ToolId)}
      {...handlers}
      className="group relative overflow-hidden bg-white dark:bg-dark-surface rounded-2xl border border-slate-200 dark:border-dark-border px-5 py-6 sm:p-6 text-left cursor-pointer transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-md active:-translate-y-0.5 active:border-primary-300 dark:active:border-primary-600 active:shadow-md"
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
        aria-hidden="true"
        style={glowStyle}
      />

      <div className="relative z-10 flex flex-col gap-2">
        <span className="w-11 h-11 rounded-xl grid place-items-center bg-slate-100 dark:bg-dark-surface-alt text-slate-700 dark:text-dark-text mb-2 transition-[transform,background-color,color] duration-200 group-hover:-translate-y-px group-hover:scale-105 group-hover:bg-primary-50 dark:group-hover:bg-primary-900/30 group-hover:text-primary-600 dark:group-hover:text-primary-400 group-active:bg-primary-50 dark:group-active:bg-primary-900/30 group-active:text-primary-600 dark:group-active:text-primary-400">
          <Icon className="w-5 h-5" />
        </span>

        <h3 className="text-card-title font-semibold tracking-[-0.005em] text-slate-800 dark:text-dark-text transition-transform duration-200 group-hover:translate-x-0.5 group-active:translate-x-0.5 inline-flex items-center gap-2 flex-wrap">
          {tool.title}
          {tool.beta && (
            // Small uppercase pill, surfaces as part of the title for
            // screen readers (the text "Beta" reads naturally after
            // the tool name). No `aria-label` here — a plain `<span>`
            // doesn't carry one, and the visible text is already
            // descriptive.
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-xxs font-semibold tracking-wide uppercase bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800">
              Beta
            </span>
          )}
        </h3>
        <p className="text-card-desc leading-normal text-slate-500 dark:text-dark-text-muted">
          {tool.description}
        </p>

        {tool.requirements && (
          // Subtle hint line — calmer than the description but still
          // visible. Same field drives the in-tool callout, so users
          // see the *same* number on the card as inside the tool.
          <p className="mt-0.5 inline-flex items-start gap-1.5 text-tag font-medium text-slate-400 dark:text-dark-text-muted leading-snug">
            <MemoryStick className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
            <span>{tool.requirements}</span>
          </p>
        )}

        <ArrowRight
          className="absolute bottom-1 right-1 sm:bottom-0 sm:right-0 w-4 h-4 text-slate-400 dark:text-dark-text-muted opacity-0 -translate-x-1 transition-[transform,opacity,color] duration-200 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-primary-600 dark:group-hover:text-primary-400 group-active:opacity-100 group-active:translate-x-0 group-active:text-primary-600 dark:group-active:text-primary-400"
          aria-hidden="true"
        />
      </div>
    </button>
  );
});
