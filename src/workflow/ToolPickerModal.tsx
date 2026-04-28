/**
 * Translucent tool-picker modal used by the workflow builder.
 *
 * Visual language adapted from cloakresume's TemplateModal: a glass-
 * blur backdrop, top-docked dialog on tablet+, bottom-sheet with a
 * drag handle on mobile, and a leading search field that filters the
 * categorised grid in real time.
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
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Mobile drag-to-dismiss. Pointer events (instead of touch) because
  // they unify mouse + touch + pen and play nicer with iOS Safari when
  // the modal sits above a fixed-position parent. `setPointerCapture`
  // pins the event stream to the handle even when the finger leaves
  // the small drag bar — without it, dragging fast often loses contact
  // with the handle and the move events stop firing mid-gesture.
  const dragStartY = useRef<number | null>(null);
  const dragDeltaRef = useRef(0);

  const onHandlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Mouse drags on desktop are pointless here (desktop has X/Esc),
    // so only respond to touch + pen pointers.
    if (e.pointerType === "mouse") return;
    dragStartY.current = e.clientY;
    dragDeltaRef.current = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onHandlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current == null) return;
    const delta = e.clientY - dragStartY.current;
    if (delta > 0 && sheetRef.current) {
      dragDeltaRef.current = delta;
      sheetRef.current.style.transform = `translateY(${delta}px)`;
      sheetRef.current.style.transition = "none";
    }
  }, []);

  const onHandlePointerEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (dragStartY.current == null) return;
      dragStartY.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (!sheetRef.current) return;
      sheetRef.current.style.transition = "";
      if (dragDeltaRef.current > 120) onClose();
      else sheetRef.current.style.transform = "";
      dragDeltaRef.current = 0;
    },
    [onClose],
  );

  // Close on Escape; auto-focus the search field on open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Focus on next tick so the input is mounted.
    const t = setTimeout(() => searchInputRef.current?.focus(), 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [onClose]);

  // Lock body scroll while the modal is open. Avoids the awkward case
  // where the user's wheel scrolls the page behind the dialog instead
  // of scrolling the modal contents.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Built once per mount — `eligibleToolIds()` is a static list, so
  // grouping by category doesn't depend on `query`. The query-aware
  // memo below just narrows each bucket.
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

  return (
    <div
      className="fixed inset-0 z-200 flex items-end sm:items-center justify-center sm:px-4 md:px-6 sm:py-6"
      role="presentation"
    >
      {/* Backdrop dim + blur — fades in quickly on its own so the
          background fills *before* the sheet animates in. Inline
          backdrop-filter for the `-webkit-` prefix (Safari). */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-slate-900/30 dark:bg-black/50 animate-fade-in"
        style={{
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
      />

      {/* Backdrop click target — transparent; the layer above owns the
          dim + blur. Keyboard users can also close via Escape or the
          explicit close button. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close tool picker"
        className="absolute inset-0 cursor-default bg-transparent"
      />

      {/* Animation wrapper — owns the scale-in so the sheet itself
          stays free for the drag handler's inline `transform:
          translateY(...)`. An animation's end state would otherwise
          beat inline styles in the cascade. The small delay lets the
          backdrop finish filling before the sheet appears. */}
      <div
        className="relative w-full sm:w-[min(720px,100%)] lg:w-[min(820px,100%)] animate-scale-in"
        style={{
          transformOrigin: "center bottom",
          animationDelay: "0.08s",
        }}
      >
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label="Pick a tool"
          className="flex flex-col w-full max-h-[92svh] sm:max-h-[min(720px,calc(100svh-64px))] overflow-hidden rounded-t-2xl sm:rounded-2xl border border-slate-200/80 dark:border-dark-border bg-white/85 dark:bg-dark-surface/85 backdrop-blur-xl shadow-2xl"
        >
          {/* Mobile drag-handle. The hit area is intentionally taller than
            the visible bar (py-3) so a finger doesn't have to land on
            the 4 px pill exactly. `touch-none` tells the browser not to
            interpret the gesture as a scroll. */}
          <div
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerEnd}
            onPointerCancel={onHandlePointerEnd}
            className="grid place-items-center py-3 cursor-grab active:cursor-grabbing touch-none select-none sm:hidden"
          >
            <span
              aria-hidden="true"
              className="w-11 h-1.5 rounded-full bg-slate-300 dark:bg-dark-border"
            />
          </div>

          {/* Header — title, close, search */}
          <div className="flex flex-col gap-3 px-5 sm:px-6 pt-2 sm:pt-5 pb-4 border-b border-slate-200/70 dark:border-dark-border/70">
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

          {/* Body */}
          <div className="overflow-y-auto px-5 sm:px-6 py-4 sm:py-5 thin-scrollbar">
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
              grouped.map(({ category, tools }, idx) => (
                <section key={category.key} className={idx === 0 ? "" : "mt-5"}>
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
    </div>
  );
}
