/**
 * Clickable card displayed on the home screen for each available tool.
 *
 * Shows the tool's emoji icon, title, and a short description. Hover
 * state adds a subtle border highlight and shadow.
 *
 * Wrapped in `React.memo` — the parent passes a single stable
 * `onSelect` callback (via `useCallback`) and each `tool` reference
 * comes from a module-level constant array, so cards skip re-renders
 * when unrelated state (e.g. the search query) changes.
 */

import { memo } from "react";
import type { Tool, ToolId } from "../types.ts";

interface ToolCardProps {
  /** Tool metadata (id, title, description, icon). */
  tool: Tool;
  /** Stable callback invoked with the tool's ID when the card is clicked. */
  onSelect: (id: ToolId) => void;
}

export const ToolCard = memo(function ToolCard({ tool, onSelect }: ToolCardProps) {
  return (
    <button
      onClick={() => onSelect(tool.id as ToolId)}
      className="group bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border p-6 text-left hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-lg hover:shadow-primary-100/50 dark:hover:shadow-primary-900/30 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
    >
      <div className="w-12 h-12 bg-primary-50 dark:bg-primary-900/40 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/60 group-hover:scale-110 group-hover:-translate-y-0.5 rounded-xl flex items-center justify-center mb-4 transition-all duration-200 text-2xl">
        {tool.icon}
      </div>
      <h3 className="font-semibold text-slate-800 dark:text-dark-text mb-1">{tool.title}</h3>
      <p className="text-sm text-slate-500 dark:text-dark-text-muted leading-relaxed">
        {tool.description}
      </p>
    </button>
  );
});
