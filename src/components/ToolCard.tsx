/**
 * Clickable card displayed on the home screen for each available tool.
 *
 * Shows the tool's emoji icon, title, and a short description. Hover
 * state adds a subtle border highlight, shadow, and a cursor-tracking
 * spotlight glow effect.
 *
 * Wrapped in `React.memo` — the parent passes a single stable
 * `onSelect` callback (via `useCallback`) and each `tool` reference
 * comes from a module-level constant array, so cards skip re-renders
 * when unrelated state (e.g. the search query) changes.
 */

import { ChevronRight } from "lucide-react";
import { memo, useCallback, useRef, useState } from "react";
import type { Tool, ToolId } from "../types.ts";

interface ToolCardProps {
  /** Tool metadata (id, title, description, icon). */
  tool: Tool;
  /** Stable callback invoked with the tool's ID when the card is clicked. */
  onSelect: (id: ToolId) => void;
}

const categoryTheme: Record<
  string,
  {
    iconBg: string;
    iconColor: string;
    hoverBg: string;
    glow: string;
    border: string;
    shadow: string;
  }
> = {
  organise: {
    iconBg: "bg-blue-50 dark:bg-blue-900/30",
    iconColor: "text-blue-600 dark:text-blue-400",
    hoverBg: "group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50",
    glow: "rgba(37,99,235,0.14)",
    border: "hover:border-blue-300 dark:hover:border-blue-600",
    shadow: "hover:shadow-blue-100/80 dark:hover:shadow-blue-900/40",
  },
  transform: {
    iconBg: "bg-violet-50 dark:bg-violet-900/30",
    iconColor: "text-violet-600 dark:text-violet-400",
    hoverBg: "group-hover:bg-violet-100 dark:group-hover:bg-violet-900/50",
    glow: "rgba(124,58,237,0.14)",
    border: "hover:border-violet-300 dark:hover:border-violet-600",
    shadow: "hover:shadow-violet-100/80 dark:hover:shadow-violet-900/40",
  },
  annotate: {
    iconBg: "bg-emerald-50 dark:bg-emerald-900/30",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    hoverBg: "group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/50",
    glow: "rgba(16,185,129,0.14)",
    border: "hover:border-emerald-300 dark:hover:border-emerald-600",
    shadow: "hover:shadow-emerald-100/80 dark:hover:shadow-emerald-900/40",
  },
  security: {
    iconBg: "bg-amber-50 dark:bg-amber-900/30",
    iconColor: "text-amber-600 dark:text-amber-400",
    hoverBg: "group-hover:bg-amber-100 dark:group-hover:bg-amber-900/50",
    glow: "rgba(245,158,11,0.14)",
    border: "hover:border-amber-300 dark:hover:border-amber-600",
    shadow: "hover:shadow-amber-100/80 dark:hover:shadow-amber-900/40",
  },
};

const fallbackTheme = categoryTheme.organise;

export const ToolCard = memo(function ToolCard({ tool, onSelect }: ToolCardProps) {
  const cardRef = useRef<HTMLButtonElement>(null);
  const [glowStyle, setGlowStyle] = useState<React.CSSProperties>({ opacity: 0 });

  const theme = categoryTheme[tool.category ?? ""] ?? fallbackTheme;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const card = cardRef.current;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setGlowStyle({
        opacity: 1,
        background: `radial-gradient(300px circle at ${x}px ${y}px, ${theme.glow}, transparent 70%)`,
      });
    },
    [theme.glow],
  );

  const handleMouseLeave = useCallback(() => {
    setGlowStyle({ opacity: 0 });
  }, []);

  const Icon = tool.icon;

  return (
    <button
      type="button"
      ref={cardRef}
      onClick={() => onSelect(tool.id as ToolId)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`group relative overflow-hidden bg-white dark:bg-dark-surface rounded-2xl border border-slate-200 dark:border-dark-border p-6 text-left hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer ${theme.border} ${theme.shadow}`}
    >
      {/* Cursor spotlight glow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300"
        style={glowStyle}
      />

      <div
        className={`relative z-10 w-12 h-12 ${theme.iconBg} ${theme.hoverBg} group-hover:scale-110 group-hover:-translate-y-0.5 rounded-xl flex items-center justify-center mb-4 transition-all duration-200`}
      >
        <Icon className={`w-6 h-6 ${theme.iconColor}`} />
      </div>

      <div className="relative z-10 flex items-start justify-between gap-2 mb-1">
        <h3 className="font-semibold text-slate-800 dark:text-dark-text">{tool.title}</h3>
        <ChevronRight
          className={`w-4 h-4 shrink-0 mt-0.5 ${theme.iconColor} opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200`}
        />
      </div>
      <p className="relative z-10 text-sm text-slate-500 dark:text-dark-text-muted leading-relaxed">
        {tool.description}
      </p>
    </button>
  );
});
