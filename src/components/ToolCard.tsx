/**
 * Clickable card displayed on the home screen for each available tool.
 *
 * Shows the tool's icon, title, and a short description. Hover state
 * adds a subtle border highlight, lift, and a cursor-tracking spotlight
 * glow effect. A small chevron slides in at the bottom-right on hover.
 *
 * On touch devices the same spotlight glow is triggered via
 * `onTouchStart`/`onTouchMove`, and CSS `active:`/`group-active:`
 * variants replicate the hover animations.
 *
 * Wrapped in `React.memo` — the parent passes a single stable
 * `onSelect` callback (via `useCallback`) and each `tool` reference
 * comes from a module-level constant array, so cards skip re-renders
 * when unrelated state (e.g. the search query) changes.
 */

import { ArrowRight } from "lucide-react";
import { memo, useCallback, useRef, useState } from "react";
import type { Tool, ToolId } from "../types.ts";

/**
 * Single primary-tinted spotlight glow shared across every card.
 * Per-category coloring was retired — a unified accent reads as more
 * modern and keeps the home screen visually calm.
 */
const SPOTLIGHT_GLOW = "rgba(37,99,235,0.16)";

interface ToolCardProps {
  /** Tool metadata (id, title, description, icon). */
  tool: Tool;
  /** Stable callback invoked with the tool's ID when the card is clicked. */
  onSelect: (id: ToolId) => void;
}

export const ToolCard = memo(function ToolCard({ tool, onSelect }: ToolCardProps) {
  const cardRef = useRef<HTMLButtonElement>(null);
  const [glowStyle, setGlowStyle] = useState<React.CSSProperties>({ opacity: 0 });

  const setGlowAt = useCallback((clientX: number, clientY: number) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    setGlowStyle({
      opacity: 1,
      background: `radial-gradient(320px circle at ${clientX - rect.left}px ${clientY - rect.top}px, ${SPOTLIGHT_GLOW}, transparent 70%)`,
    });
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => setGlowAt(e.clientX, e.clientY),
    [setGlowAt],
  );

  const handleMouseLeave = useCallback(() => {
    setGlowStyle({ opacity: 0 });
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLButtonElement>) => {
      const t = e.touches[0];
      setGlowAt(t.clientX, t.clientY);
    },
    [setGlowAt],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLButtonElement>) => {
      const t = e.touches[0];
      setGlowAt(t.clientX, t.clientY);
    },
    [setGlowAt],
  );

  const handleTouchEnd = useCallback(() => {
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
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className="group relative overflow-hidden bg-white dark:bg-dark-surface rounded-2xl border border-slate-200 dark:border-dark-border px-5 py-6 sm:p-6 text-left cursor-pointer transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-md active:-translate-y-0.5 active:border-primary-300 dark:active:border-primary-600 active:shadow-md"
    >
      {/* Cursor / touch spotlight glow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
        aria-hidden="true"
        style={glowStyle}
      />

      <div className="relative z-10 flex flex-col gap-2">
        <span className="w-11 h-11 rounded-xl grid place-items-center bg-slate-100 dark:bg-dark-surface-alt text-slate-700 dark:text-dark-text mb-2 transition-[transform,background-color,color] duration-200 group-hover:-translate-y-px group-hover:scale-105 group-hover:bg-primary-50 dark:group-hover:bg-primary-900/30 group-hover:text-primary-600 dark:group-hover:text-primary-400 group-active:bg-primary-50 dark:group-active:bg-primary-900/30 group-active:text-primary-600 dark:group-active:text-primary-400">
          <Icon className="w-5 h-5" />
        </span>

        <h3 className="text-[15px] font-semibold tracking-[-0.005em] text-slate-800 dark:text-dark-text">
          {tool.title}
        </h3>
        <p className="text-[13px] leading-normal text-slate-500 dark:text-dark-text-muted">
          {tool.description}
        </p>

        <ArrowRight
          className="absolute bottom-1 right-1 sm:bottom-0 sm:right-0 w-4 h-4 text-slate-400 dark:text-dark-text-muted opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-primary-600 dark:group-hover:text-primary-400 group-active:opacity-100 group-active:translate-x-0 group-active:text-primary-600 dark:group-active:text-primary-400"
          aria-hidden="true"
        />
      </div>
    </button>
  );
});
