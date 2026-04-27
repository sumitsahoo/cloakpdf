/**
 * Root application module.
 *
 * Manages which view is active (home / tool / privacy / workflows-home /
 * workflow-builder / workflow-runner) and delegates rendering to the
 * matching child component.
 *
 * Tool metadata and lazy components live in `config/tool-registry.ts`
 * so that workflow code can render any tool by id without pulling
 * App.tsx into its dependency graph.
 */

import {
  ArrowRight,
  GitFork,
  Laptop,
  MonitorSmartphone,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  WifiOff,
  EyeOff,
  Workflow as WorkflowIcon,
  X,
} from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "./components/Layout.tsx";
import { PrivacyPolicy } from "./components/PrivacyPolicy.tsx";
import { ReloadPrompt } from "./components/ReloadPrompt.tsx";
import { ToolCard } from "./components/ToolCard.tsx";
import { categories, findTool, findToolComponent, tools } from "./config/tool-registry.ts";
import type { Tool, ToolId } from "./types.ts";
import { WorkflowBuilder } from "./workflow/WorkflowBuilder.tsx";
import { WorkflowRunner } from "./workflow/WorkflowRunner.tsx";
import { WorkflowsHome } from "./workflow/WorkflowsHome.tsx";

// ── Platform detection (module-level, computed once) ──────────────

/** `true` when the client runs on an Apple platform (used for ⌘ vs Ctrl hints). */
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

// ═══════════════════════════════════════════════════════════════════
//  Sub-components (defined at module level per rerender-no-inline-
//  components best practice)
// ═══════════════════════════════════════════════════════════════════

/** Full-screen centred spinner shown while a tool chunk is loading. */
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
    </div>
  );
}

// ── ToolView ─────────────────────────────────────────────────────

interface ToolViewProps {
  /** Metadata for the currently active tool. */
  tool: Tool;
  /** The lazy-loaded component to render. */
  Component: React.LazyExoticComponent<React.ComponentType>;
}

/**
 * Renders the active tool's header (title + description) and its
 * lazily-loaded component wrapped in a `Suspense` boundary.
 */
function ToolView({ tool, Component }: ToolViewProps) {
  const Icon = tool.icon;
  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 bg-slate-100 dark:bg-dark-surface-alt rounded-xl flex items-center justify-center shrink-0">
          <Icon className="w-6 h-6 text-slate-700 dark:text-dark-text" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.015em] text-slate-800 dark:text-dark-text">
            {tool.title}
          </h1>
          <p className="text-slate-500 dark:text-dark-text-muted mt-0.5">{tool.description}</p>
        </div>
      </div>
      <Suspense fallback={<LoadingSpinner />}>
        <Component />
      </Suspense>
    </div>
  );
}

// ── HomeScreen ───────────────────────────────────────────────────

interface HomeScreenProps {
  /** Stable callback invoked with a tool ID when the user picks a tool. */
  onSelectTool: (id: ToolId) => void;
  /** Open the workflows landing page. */
  onOpenWorkflows: () => void;
}

/**
 * Landing page showing the hero headline, the workflow hero card, a
 * live-search bar with ⌘K / Ctrl+K shortcut, and a categorised grid
 * of tool cards.
 *
 * Search state is local to this component so that typing never
 * re-renders the parent `App` or the `Layout` shell. When the user
 * navigates to a tool this component unmounts, naturally discarding
 * the query; returning to the home screen starts with a fresh search.
 */
function HomeScreen({ onSelectTool, onOpenWorkflows }: HomeScreenProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K → focus search; Escape → clear search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "Escape" && searchQuery) {
        setSearchQuery("");
        searchInputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [searchQuery]);

  /** Tools whose title or description matches the query (case-insensitive). */
  const filteredTools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter(
      (t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  return (
    <div>
      {/* ── Hero ────────────────────────────────────────── */}
      <section className="pt-6 sm:pt-10 md:pt-14 pb-8 sm:pb-10">
        <h1
          className="text-center text-[34px] sm:text-[46px] md:text-[60px] lg:text-[64px] font-semibold text-slate-900 dark:text-dark-text tracking-[-0.03em] leading-[1.05] m-0 max-w-225 mx-auto animate-fade-in-up"
          style={{ animationDelay: "0ms" }}
        >
          PDF tools that{" "}
          <em className="font-serif italic font-normal text-primary-600 dark:text-primary-400">
            stay on your device
          </em>
          .
        </h1>

        <p
          className="text-center text-slate-500 dark:text-dark-text-muted text-[15px] sm:text-[17px] md:text-[18px] leading-[1.55] max-w-160 mx-auto mt-5 sm:mt-6 animate-fade-in-up"
          style={{ animationDelay: "80ms" }}
        >
          Edit, merge, sign, secure, and convert PDFs entirely in your browser. No uploads, no
          accounts, no tracking.
        </p>
      </section>

      {/* ── Workflow Hero Card ──────────────────────────── */}
      {!searchQuery && (
        <div
          className="max-w-3xl mx-auto mb-8 sm:mb-10 animate-fade-in-up"
          style={{ animationDelay: "120ms" }}
        >
          <WorkflowHeroCard onOpen={onOpenWorkflows} />
        </div>
      )}

      {/* ── Search Bar ──────────────────────────────────── */}
      <div
        className="max-w-xl mx-auto mb-12 sm:mb-14 animate-fade-in-up"
        style={{ animationDelay: "160ms" }}
      >
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400 dark:text-dark-text-muted group-focus-within:text-primary-500 transition-colors duration-200" />

          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tools…"
            className="w-full pl-11 pr-24 py-3 rounded-xl bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border text-slate-800 dark:text-dark-text placeholder-slate-400 dark:placeholder-dark-text-muted shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-400/40 focus:border-primary-300 dark:focus:border-primary-600 transition-[border-color,box-shadow] duration-200 text-[15px]"
            aria-label="Search PDF tools"
          />

          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  searchInputRef.current?.focus();
                }}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-surface-alt text-slate-400 dark:text-dark-text-muted hover:text-slate-600 dark:hover:text-dark-text transition-colors"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-1 rounded-lg bg-slate-100 dark:bg-dark-surface-alt border border-slate-200 dark:border-dark-border text-xs text-slate-400 dark:text-dark-text-muted font-mono select-none">
                {isMac ? "⌘" : "Ctrl"}K
              </kbd>
            )}
          </div>
        </div>

        {searchQuery && (
          <p className="text-center text-sm text-slate-400 dark:text-dark-text-muted mt-2 animate-fade-in-up">
            {filteredTools.length} {filteredTools.length === 1 ? "tool" : "tools"} found
          </p>
        )}
      </div>

      {/* ── Tool Grid / Empty State ─────────────────────── */}
      {filteredTools.length === 0 ? (
        <div className="text-center py-16 animate-fade-in-up">
          <div className="w-16 h-16 bg-slate-100 dark:bg-dark-surface rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-slate-400 dark:text-dark-text-muted" />
          </div>
          <h3 className="text-lg font-semibold text-slate-600 dark:text-dark-text mb-2">
            No tools found
          </h3>
          <p className="text-sm text-slate-400 dark:text-dark-text-muted max-w-md mx-auto">
            Try a different search term like &ldquo;merge&rdquo;, &ldquo;sign&rdquo;, or
            &ldquo;compress&rdquo;
          </p>
        </div>
      ) : (
        <div className="space-y-12 sm:space-y-14">
          {categories.map((cat, catIdx) => {
            const catTools = filteredTools.filter((t) => t.category === cat.key);
            if (catTools.length === 0) return null;
            return (
              <section
                key={cat.key}
                className="animate-fade-in-up"
                style={{ animationDelay: `${catIdx * 80}ms` }}
              >
                <div className="mb-5 sm:mb-6">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-600 dark:text-primary-400 mb-2">
                    {cat.label}
                    <span className="ml-2 text-slate-400 dark:text-dark-text-muted font-medium tracking-normal normal-case">
                      · {catTools.length}
                    </span>
                  </div>
                  <h2 className="text-[22px] sm:text-[26px] font-semibold tracking-[-0.02em] leading-[1.2] text-slate-900 dark:text-dark-text m-0">
                    {cat.description}.
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {catTools.map((tool) => (
                    <ToolCard key={tool.id} tool={tool} onSelect={onSelectTool} />
                  ))}
                </div>
              </section>
            );
          })}

          {/* ── Why CloakPDF — multi-colored feature grid ── */}
          {!searchQuery && (
            <section
              className="pt-6 sm:pt-10 animate-fade-in-up"
              style={{ animationDelay: `${categories.length * 80}ms` }}
            >
              <div className="text-center mb-8 sm:mb-12">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-600 dark:text-primary-400 mb-2.5">
                  Why CloakPDF
                </div>
                <h2 className="text-[24px] sm:text-[30px] md:text-[36px] font-semibold tracking-[-0.02em] leading-[1.15] text-slate-900 dark:text-dark-text m-0">
                  Everything you need, nothing you don&rsquo;t.
                </h2>
                <p className="text-slate-500 dark:text-dark-text-muted text-[14px] sm:text-[15.5px] leading-[1.55] max-w-140 mx-auto mt-3">
                  A modern PDF toolkit that respects your privacy — built for people who care about
                  their data and their craft.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-7 sm:gap-y-8">
                <FeatureItem
                  icon={<UserRoundCheck className="w-5 h-5" />}
                  iconBg="bg-[color-mix(in_oklab,#059669_14%,transparent)]"
                  iconFg="text-[#059669] dark:text-[#34d399]"
                  title="No sign-up"
                  description="No accounts, no email, no passwords. Start using the moment the page loads."
                />
                <FeatureItem
                  icon={<EyeOff className="w-5 h-5" />}
                  iconBg="bg-[color-mix(in_oklab,#7c3aed_14%,transparent)]"
                  iconFg="text-[#7c3aed] dark:text-[#a78bfa]"
                  title="No tracking"
                  description="Zero analytics, zero telemetry, zero third-party scripts. You stay invisible."
                />
                <FeatureItem
                  icon={<ShieldCheck className="w-5 h-5" />}
                  iconBg="bg-[color-mix(in_oklab,#16a34a_14%,transparent)]"
                  iconFg="text-[#16a34a] dark:text-[#4ade80]"
                  title="Local-first"
                  description="Every byte stays in your browser. Nothing is ever uploaded to any server."
                />
                <FeatureItem
                  icon={<WifiOff className="w-5 h-5" />}
                  iconBg="bg-[color-mix(in_oklab,#0891b2_14%,transparent)]"
                  iconFg="text-[#0891b2] dark:text-[#22d3ee]"
                  title="Works offline"
                  description="Once cached, keep editing and exporting without a connection — flights, trains, anywhere."
                />
                <FeatureItem
                  icon={<Rocket className="w-5 h-5" />}
                  iconBg="bg-[color-mix(in_oklab,#8b5cf6_14%,transparent)]"
                  iconFg="text-[#8b5cf6] dark:text-[#c4b5fd]"
                  title="Installable as a PWA"
                  description="Add CloakPDF to your home screen for a full-screen, app-like experience that launches in one tap."
                />
                <FeatureItem
                  icon={<MonitorSmartphone className="w-5 h-5" />}
                  iconBg="bg-[color-mix(in_oklab,#eab308_14%,transparent)]"
                  iconFg="text-[#ca8a04] dark:text-[#facc15]"
                  title="Mobile, tablet & desktop"
                  description="Every tool adapts fluidly across screen sizes — edit on the go, finalise at your desk."
                />
                <FeatureItem
                  icon={<Sparkles className="w-5 h-5" />}
                  iconBg="bg-[color-mix(in_oklab,#db2777_14%,transparent)]"
                  iconFg="text-[#db2777] dark:text-[#f472b6]"
                  title="35+ PDF tools"
                  description="Merge, split, sign, redact, OCR, compress, convert — one workspace for every PDF chore."
                />
                <FeatureItem
                  icon={<Laptop className="w-5 h-5" />}
                  iconBg="bg-[color-mix(in_oklab,#0891b2_14%,transparent)]"
                  iconFg="text-[#0891b2] dark:text-[#67e8f9]"
                  title="Light & dark mode"
                  description="Thoughtful theming that follows your system preference automatically."
                />
                <FeatureItem
                  icon={<GitFork className="w-5 h-5" />}
                  iconBg="bg-[color-mix(in_oklab,#475569_14%,transparent)]"
                  iconFg="text-[#475569] dark:text-[#cbd5e1]"
                  title="Free & open source"
                  description="MIT-licensed and on GitHub. Fork it, self-host it, or audit every byte — nothing is hidden."
                />
              </div>
            </section>
          )}

          {/* ── How it works ──────────────────────────────── */}
          {!searchQuery && (
            <section
              className="pt-2 sm:pt-4 animate-fade-in-up"
              style={{ animationDelay: `${(categories.length + 1) * 80}ms` }}
            >
              <div className="border border-slate-200 dark:border-dark-border bg-white/70 dark:bg-dark-surface/70 backdrop-blur-sm rounded-2xl shadow-sm px-5 py-8 sm:px-10 sm:py-12">
                <div className="text-center mb-8 sm:mb-10">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-600 dark:text-primary-400 mb-2.5">
                    How it works
                  </div>
                  <h2 className="text-[22px] sm:text-[28px] md:text-[32px] font-semibold tracking-[-0.02em] leading-[1.2] text-slate-900 dark:text-dark-text m-0">
                    From upload to download, in three steps.
                  </h2>
                </div>

                <ol className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 list-none p-0 m-0">
                  <Step
                    n={1}
                    title="Pick a tool"
                    description="Browse 35+ PDF utilities organised by what you want to do — all in one place."
                  />
                  <Step
                    n={2}
                    title="Drop your PDF"
                    description="Files are processed entirely in your browser. Nothing ever leaves your device."
                  />
                  <Step
                    n={3}
                    title="Download the result"
                    description="Polished output with no watermarks, no sign-ups, no waiting in a queue."
                  />
                </ol>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// ── HomeScreen sub-components ────────────────────────────────────

interface FeatureItemProps {
  icon: React.ReactNode;
  iconBg: string;
  iconFg: string;
  title: string;
  description: string;
}

function FeatureItem({ icon, iconBg, iconFg, title, description }: FeatureItemProps) {
  return (
    <div className="flex items-start gap-3.5">
      <span
        className={`shrink-0 w-10 h-10 rounded-lg grid place-items-center ${iconBg} ${iconFg}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[14.5px] font-semibold tracking-[-0.005em] text-slate-800 dark:text-dark-text mb-1">
          {title}
        </div>
        <div className="text-[13.5px] leading-[1.55] text-slate-500 dark:text-dark-text-muted">
          {description}
        </div>
      </div>
    </div>
  );
}

interface StepProps {
  n: number;
  title: string;
  description: string;
}

function Step({ n, title, description }: StepProps) {
  return (
    <li className="flex items-start gap-4">
      <span
        className="shrink-0 w-9 h-9 rounded-full grid place-items-center font-serif italic text-[17px] font-semibold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/40 border border-primary-100 dark:border-primary-800/60"
        aria-hidden="true"
      >
        {n}
      </span>
      <div>
        <div className="text-[15px] font-semibold tracking-[-0.005em] text-slate-800 dark:text-dark-text mb-1">
          {title}
        </div>
        <div className="text-[13.5px] leading-[1.55] text-slate-500 dark:text-dark-text-muted">
          {description}
        </div>
      </div>
    </li>
  );
}

// ── WorkflowHeroCard ─────────────────────────────────────────────

interface WorkflowHeroCardProps {
  onOpen: () => void;
}

/**
 * A single prominent card on the home screen that introduces the
 * Workflows feature. Same design language as ToolCard: rounded-2xl,
 * subtle border, hover lift; visually amplified with a primary-tinted
 * gradient panel and an arrow CTA.
 */
function WorkflowHeroCard({ onOpen }: WorkflowHeroCardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative w-full overflow-hidden bg-gradient-to-br from-primary-50 via-white to-white dark:from-primary-900/30 dark:via-dark-surface dark:to-dark-surface border border-primary-200/70 dark:border-primary-800/60 rounded-2xl px-5 py-5 sm:px-6 sm:py-5 text-left cursor-pointer transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary-400 dark:hover:border-primary-600 hover:shadow-md flex items-center gap-4"
    >
      <span className="shrink-0 w-12 h-12 rounded-xl grid place-items-center bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 transition-[transform,background-color] duration-200 group-hover:-translate-y-px group-hover:scale-105">
        <WorkflowIcon className="w-6 h-6" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-700 dark:text-primary-300">
            New
          </span>
          <span className="h-1 w-1 rounded-full bg-primary-400 dark:bg-primary-500" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-dark-text-muted">
            Workflows
          </span>
        </div>
        <div className="text-[15px] sm:text-[16px] font-semibold tracking-[-0.005em] text-slate-800 dark:text-dark-text">
          Chain tools together and run them in one go.
        </div>
        <div className="text-[12.5px] sm:text-[13px] text-slate-500 dark:text-dark-text-muted mt-0.5">
          Save your favourite sequences as reusable workflows — clean, compress, and watermark in a
          single click.
        </div>
      </div>
      <ArrowRight className="hidden sm:block shrink-0 w-5 h-5 text-primary-600 dark:text-primary-400 transition-transform duration-200 group-hover:translate-x-0.5" />
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Root component
// ═══════════════════════════════════════════════════════════════════

/**
 * View state for the app — discriminated union so the active payload
 * (active tool id, edited workflow id) lives next to the view tag.
 *
 * Kept here at module scope rather than as a `type View = ...` inside
 * `App` so the union is easier to read in isolation.
 */
type View =
  | { kind: "home" }
  | { kind: "tool"; toolId: ToolId }
  | { kind: "privacy" }
  | { kind: "workflows-home" }
  | { kind: "workflow-builder"; workflowId: string | null }
  | { kind: "workflow-runner"; workflowId: string };

/**
 * Root application component.
 *
 * Manages which view is active and delegates rendering to the matching
 * child component. Keeps its own state minimal so that child-local
 * state (e.g. search) doesn't bubble up unnecessarily.
 */
export function App() {
  const [view, setView] = useState<View>({ kind: "home" });

  const goHome = useCallback(() => setView({ kind: "home" }), []);

  const handleSelectTool = useCallback((id: ToolId) => {
    setView({ kind: "tool", toolId: id });
  }, []);

  const handlePrivacy = useCallback(() => {
    setView({ kind: "privacy" });
  }, []);

  const openWorkflowsHome = useCallback(() => {
    setView({ kind: "workflows-home" });
  }, []);

  const openWorkflowBuilder = useCallback((workflowId: string | null) => {
    setView({ kind: "workflow-builder", workflowId });
  }, []);

  const openWorkflowRunner = useCallback((workflowId: string) => {
    setView({ kind: "workflow-runner", workflowId });
  }, []);

  /** Scroll to top whenever the view changes. */
  // eslint-disable-next-line react-hooks/exhaustive-deps -- view is intentionally the trigger; identity changes per setView call
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  const showBack = view.kind !== "home";

  return (
    <>
      <Layout onHome={goHome} showBack={showBack} onPrivacy={handlePrivacy}>
        <ViewContent
          view={view}
          onSelectTool={handleSelectTool}
          onOpenWorkflowsHome={openWorkflowsHome}
          onOpenWorkflowBuilder={openWorkflowBuilder}
          onOpenWorkflowRunner={openWorkflowRunner}
          onGoHome={goHome}
        />
      </Layout>
      <ReloadPrompt />
    </>
  );
}

interface ViewContentProps {
  view: View;
  onSelectTool: (id: ToolId) => void;
  onOpenWorkflowsHome: () => void;
  onOpenWorkflowBuilder: (workflowId: string | null) => void;
  onOpenWorkflowRunner: (workflowId: string) => void;
  onGoHome: () => void;
}

function ViewContent({
  view,
  onSelectTool,
  onOpenWorkflowsHome,
  onOpenWorkflowBuilder,
  onOpenWorkflowRunner,
  onGoHome,
}: ViewContentProps) {
  switch (view.kind) {
    case "home":
      return <HomeScreen onSelectTool={onSelectTool} onOpenWorkflows={onOpenWorkflowsHome} />;
    case "tool": {
      const meta = findTool(view.toolId);
      const Component = findToolComponent(view.toolId);
      if (!meta || !Component)
        return <HomeScreen onSelectTool={onSelectTool} onOpenWorkflows={onOpenWorkflowsHome} />;
      return <ToolView tool={meta} Component={Component} />;
    }
    case "privacy":
      return <PrivacyPolicy />;
    case "workflows-home":
      return (
        <WorkflowsHome
          onCreate={() => onOpenWorkflowBuilder(null)}
          onEdit={(id) => onOpenWorkflowBuilder(id)}
          onRun={(id) => onOpenWorkflowRunner(id)}
        />
      );
    case "workflow-builder":
      return (
        <WorkflowBuilder
          workflowId={view.workflowId}
          onCancel={onOpenWorkflowsHome}
          onSaved={onOpenWorkflowsHome}
        />
      );
    case "workflow-runner":
      return <WorkflowRunner workflowId={view.workflowId} onExit={onOpenWorkflowsHome} />;
    default: {
      // Exhaustiveness check — TypeScript will flag missing cases.
      const _exhaustive: never = view;
      void _exhaustive;
      void onGoHome;
      return null;
    }
  }
}
