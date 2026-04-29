/**
 * Translucent tool-picker modal used by the workflow builder.
 *
 * Structure mirrors cloakresume's `TemplateModal` exactly because that
 * shape is known to scroll cleanly inside iOS Safari, where small
 * deviations (body scroll-lock, extra animation wrappers, pointer
 * events instead of touch, `flex-1 min-h-0`, explicit heights) all
 * silently break native scroll until a pinch-zoom forces a reflow.
 *
 * Concretely, the layout is:
 *  - A single `fixed inset-0` wrapper that paints the dim+blur
 *    backdrop *itself* — no nested backdrop layer. The backdrop
 *    snaps in (no animation) so its edges don't fade visibly from
 *    the sides; only the inner sheet animates with
 *    `animate-slide-up-in`, rising into view from below. Pairs
 *    naturally with the mobile bottom-sheet layout.
 *  - A transparent close-button covering `inset-0`; the sheet sits
 *    above it by source order alone.
 *  - The sheet is plain `flex flex-col + max-h-[92svh]`. The body is
 *    just `overflow-y-auto`. No `flex-1`, no `min-h-0`, no `h-[...svh]`,
 *    no grid template, no `touch-action`. iOS scrolls it natively.
 *  - Drag-to-dismiss uses `onTouch{Start,Move,End}` (not pointer
 *    events) and never calls `setPointerCapture`.
 *
 * Only tools that have been migrated into the workflow system (see
 * `registry.ts`) appear here. Picking a tool calls `onPick` and closes
 * the modal.
 */

import { Search, X, Workflow as WorkflowIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { categories, findTool } from "../config/tool-registry.ts";
import type { ToolId } from "../types.ts";
import { eligibleToolIds } from "./registry.ts";

interface ToolPickerModalProps {
  onPick: (id: ToolId) => void;
  onClose: () => void;
  /** Tool ids already added to the workflow — shown as "Added". */
  alreadyAdded?: ReadonlySet<string>;
}

export function ToolPickerModal({ onPick, onClose, alreadyAdded }: ToolPickerModalProps) {
  const touchStartY = useRef<number | null>(null);
  const dragDeltaRef = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  // Build an eligible-tool-by-category map once per mount; the static
  // list of eligible ids never changes during the modal's lifetime.
  const eligibleByCategory = useMemo(() => {
    const map = new Map<string, NonNullable<ReturnType<typeof findTool>>[]>();
    for (const id of eligibleToolIds()) {
      const tool = findTool(id);
      if (!tool?.category) continue;
      const list = map.get(tool.category) ?? [];
      list.push(tool);
      map.set(tool.category, list);
    }
    return map;
  }, []);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories
      .map((category) => {
        const tools = (eligibleByCategory.get(category.key) ?? []).filter((t) => {
          if (!q) return true;
          return (
            t.title.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q) ||
            category.label.toLowerCase().includes(q)
          );
        });
        return { category, tools };
      })
      .filter((g) => g.tools.length > 0);
  }, [query, eligibleByCategory]);

  const totalShown = grouped.reduce((sum, g) => sum + g.tools.length, 0);

  // Drag-to-dismiss on mobile. Touch events specifically — pointer
  // events with `setPointerCapture` introduce iOS-Safari layout quirks
  // (the same ones that break scroll until pinch-zoom). The handler
  // only translates the sheet downward; releasing past 120 px closes.
  const onHandleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    dragDeltaRef.current = 0;
    // `animate-slide-up-in` uses `animation-fill-mode: both`, which holds
    // the final keyframe (`translateY(0)`) and overrides inline transforms.
    // Clear it so the drag's `style.transform` actually moves the sheet.
    if (sheetRef.current) {
      sheetRef.current.style.animation = "none";
    }
  }, []);

  const onHandleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current == null) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0 && sheetRef.current) {
      dragDeltaRef.current = delta;
      sheetRef.current.style.transform = `translateY(${delta}px)`;
      sheetRef.current.style.transition = "none";
    }
  }, []);

  const onHandleTouchEnd = useCallback(() => {
    touchStartY.current = null;
    if (!sheetRef.current) return;
    sheetRef.current.style.transition = "";
    if (dragDeltaRef.current > 120) {
      onClose();
    } else {
      sheetRef.current.style.transform = "";
    }
    dragDeltaRef.current = 0;
  }, [onClose]);

  // Close on Escape; auto-focus the search field shortly after open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => searchInputRef.current?.focus(), 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-200 flex items-end sm:items-center justify-center sm:px-3 md:px-6"
      role="presentation"
      style={{
        // Backdrop dim + blur applied directly on the wrapper, the same
        // way `TemplateModal` uses its `backdrop` utility class. One
        // painting layer, one stacking context — no separate sibling
        // div with absolute positioning that previously confused iOS
        // Safari's hit-testing on the scrolling body underneath.
        background: "color-mix(in oklab, rgb(15 23 42) 30%, transparent)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close tool picker"
        className="absolute inset-0"
        style={{ background: "transparent" }}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Pick a tool"
        className="relative flex flex-col w-full sm:w-[min(720px,100%)] lg:w-[min(820px,100%)] max-h-[82svh] sm:max-h-[min(720px,calc(100svh-64px))] overflow-hidden rounded-t-2xl sm:rounded-2xl border border-slate-200/80 dark:border-dark-border bg-white/85 dark:bg-dark-surface/85 backdrop-blur-xl shadow-2xl animate-slide-up-in"
      >
        <div
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          className="grid place-items-center pt-2.5 pb-1 cursor-grab touch-none sm:hidden"
        >
          <span
            aria-hidden="true"
            className="w-11 h-1 rounded-full bg-slate-300 dark:bg-dark-border"
          />
        </div>

        <div className="flex flex-col gap-3 px-4 md:px-7 pt-2 sm:pt-5 md:pt-5 pb-3.5 border-b border-slate-200/70 dark:border-dark-border/70">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[15px] sm:text-base font-semibold tracking-[-0.01em] text-slate-800 dark:text-dark-text">
                Pick a tool
              </div>
              <div className="text-[13px] text-slate-500 dark:text-dark-text-muted mt-0.5">
                Workflow-eligible tools — search by name or category.
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-lg grid place-items-center text-slate-400 dark:text-dark-text-muted hover:bg-slate-100 dark:hover:bg-dark-surface-alt hover:text-slate-700 dark:hover:text-dark-text transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-dark-text-muted pointer-events-none"
              aria-hidden="true"
            />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tools…"
              aria-label="Search tools"
              className="w-full h-10 pl-9 pr-9 rounded-lg border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface text-[13.5px] text-slate-800 dark:text-dark-text placeholder:text-slate-400 dark:placeholder:text-dark-text-muted outline-none transition-[border-color,box-shadow] duration-150 focus:border-primary-300 dark:focus:border-primary-600 focus:ring-2 focus:ring-primary-400/30"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  searchInputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded grid place-items-center text-slate-400 dark:text-dark-text-muted hover:bg-slate-100 dark:hover:bg-dark-surface-alt hover:text-slate-700 dark:hover:text-dark-text transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="overflow-y-auto px-4 md:px-7 py-4 md:py-5 thin-scrollbar">
          {totalShown === 0 ? (
            <div className="py-10 text-center">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 dark:bg-dark-surface-alt grid place-items-center mb-3">
                {query ? (
                  <Search className="w-5 h-5 text-slate-400 dark:text-dark-text-muted" />
                ) : (
                  <WorkflowIcon className="w-5 h-5 text-slate-400 dark:text-dark-text-muted" />
                )}
              </div>
              <div className="text-[14px] font-medium text-slate-700 dark:text-dark-text">
                {query ? `No tools match “${query}”` : "No workflow-eligible tools yet"}
              </div>
              <div className="text-[13px] text-slate-500 dark:text-dark-text-muted mt-1">
                {query
                  ? "Try a different name or category."
                  : "Migrate a tool to the workflow system to add it here."}
              </div>
            </div>
          ) : (
            grouped.map(({ category, tools }) => (
              <section key={category.key} className="mb-6 last:mb-0">
                <div className="flex items-baseline gap-3 mb-3 pb-2 border-b border-slate-200/60 dark:border-dark-border/60">
                  <h3 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-primary-600 dark:text-primary-400">
                    {category.label}
                  </h3>
                  <span className="ml-auto text-[11px] font-mono text-slate-400 dark:text-dark-text-muted tabular-nums">
                    {String(tools.length).padStart(2, "0")}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {tools.map((tool) => {
                    const Icon = tool.icon;
                    const added = alreadyAdded?.has(tool.id) ?? false;
                    return (
                      <button
                        key={tool.id}
                        type="button"
                        onClick={() => onPick(tool.id as ToolId)}
                        className="group flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface hover:border-primary-300 dark:hover:border-primary-600 hover:bg-primary-50/40 dark:hover:bg-primary-900/20 hover:-translate-y-0.5 hover:shadow-sm transition-[border-color,background-color,box-shadow,transform] duration-150 text-left"
                      >
                        <span className="shrink-0 w-9 h-9 rounded-lg bg-slate-100 dark:bg-dark-surface-alt text-slate-700 dark:text-dark-text grid place-items-center group-hover:bg-primary-100 dark:group-hover:bg-primary-900/40 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                          <Icon className="w-4 h-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="text-[14px] font-semibold tracking-[-0.005em] text-slate-800 dark:text-dark-text truncate">
                              {tool.title}
                            </div>
                            {added && (
                              <span className="text-[10px] font-semibold tracking-[0.08em] uppercase px-1.5 py-0.5 rounded-md bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300">
                                Added
                              </span>
                            )}
                          </div>
                          <div className="text-[12.5px] text-slate-500 dark:text-dark-text-muted leading-snug mt-0.5">
                            {tool.description}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
