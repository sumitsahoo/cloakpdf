/**
 * Root layout shell for the application.
 *
 * Provides a fixed top header bar (logo, privacy chip, GitHub link,
 * optional back button), a centred content area, an animated aurora
 * backdrop, and a footer. The footer shows compact bento cards (How it
 * works + Cloakyard family promo) on the home screen only; on tool
 * pages (`showBack=true`) the bento collapses to a slim attribution
 * row to keep tool chrome minimal. All pages/tools render inside
 * `children`.
 */

import { ArrowUpRight, ChevronLeft, Scale, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { AuroraBackground } from "./AuroraBackground";

declare const __APP_VERSION__: string;

const REPO_URL = "https://github.com/cloakyard/cloakpdf";
const CLOAKYARD_URL = "https://github.com/cloakyard";
const AUTHOR_URL = "https://github.com/sumitsahoo";

interface LayoutProps {
  /** Content to render in the main area. */
  children: ReactNode;
  /** Callback fired when the user navigates back to the home screen. */
  onHome: () => void;
  /** When true, displays a back-arrow button in the header. */
  showBack?: boolean;
  /** Callback fired when the user clicks the Privacy Policy link. */
  onPrivacy: () => void;
}

function GithubMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

export function Layout({ children, onHome, showBack, onPrivacy }: LayoutProps) {
  return (
    <div
      className="relative z-150 flex flex-col min-h-svh"
      style={{ background: "var(--page-bg)" }}
    >
      <AuroraBackground />

      <div className="relative flex flex-col flex-1 min-h-0">
        {/* Fixed top header bar — full-width glassy bar pinned to the top
            of the viewport, sitting above the aurora. The wrapping
            <header> owns the bar visuals; the inner container constrains
            content to the page max-width. */}
        <header className="sticky top-0 z-50 bg-white/80 dark:bg-dark-surface/80 backdrop-blur-xl border-b border-slate-200/70 dark:border-white/10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="py-2.5 flex items-center gap-2 sm:gap-3">
              {showBack && (
                <button
                  type="button"
                  onClick={onHome}
                  className="p-2 rounded-xl hover:bg-slate-900/4 dark:hover:bg-white/5 transition-colors text-slate-600 dark:text-dark-text-muted"
                  aria-label="Back to home"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}

              <button
                type="button"
                onClick={onHome}
                className="flex items-center gap-2.5 hover:opacity-90 transition-opacity"
              >
                {/* Circular favicon.svg (not the full-bleed logo.svg) so
                    the chip silhouette matches CloakIMG's top bar — the
                    Cloakyard family reads consistently across apps. */}
                <img
                  src="/icons/favicon.svg"
                  alt="CloakPDF logo"
                  className="w-10 h-10 drop-shadow-sm"
                />
                <span className="text-[19px] font-semibold tracking-[-0.025em] text-slate-900 dark:text-dark-text">
                  Cloak<span className="text-primary-600 dark:text-primary-400">PDF</span>
                </span>
              </button>

              <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
                <div className="flex items-center gap-1.5 px-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-500 dark:text-dark-text-muted" />
                  <span className="text-[12.5px] font-medium tracking-tight text-slate-600 dark:text-dark-text-muted whitespace-nowrap">
                    <span className="sm:hidden">Private</span>
                    <span className="hidden sm:inline lg:hidden">100% Private</span>
                    <span className="hidden lg:inline">100% Private · Open Source</span>
                  </span>
                </div>

                <span aria-hidden="true" className="w-px h-5 bg-slate-200 dark:bg-white/10" />

                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center w-9 h-9 rounded-xl text-slate-500 dark:text-dark-text-muted hover:text-slate-900 dark:hover:text-dark-text hover:bg-slate-900/4 dark:hover:bg-white/5 transition-colors"
                  aria-label="View source on GitHub"
                >
                  <GithubMark className="w-4.5 h-4.5" />
                  <span className="sr-only">GitHub</span>
                </a>
              </div>
            </div>
          </div>
        </header>

        <main className="relative z-10 flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-8 w-full">
          {children}
        </main>

        {/* Bento footer — How it works card paired with a Cloakyard
            family promo card. Each card carries its own glassy surface so
            the aurora reads through the gutter. A slim attribution row
            sits below the bento. */}
        <footer
          className="relative mt-auto"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-6 sm:pt-10 sm:pb-8">
            {/* Bento cards only render on the home screen. On tool pages
                (showBack=true) we collapse to a single attribution row. */}
            {!showBack && (
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mb-6 sm:mb-7">
                {/* How it works card */}
                <div className="sm:col-span-7 relative overflow-hidden rounded-2xl border border-slate-200/70 dark:border-dark-border bg-white/65 dark:bg-dark-surface/60 backdrop-blur-md p-5 flex flex-col">
                  <div
                    aria-hidden="true"
                    className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-primary-500/15 dark:bg-primary-400/10 blur-3xl pointer-events-none"
                  />
                  <div className="relative">
                    <div className="text-[10px] uppercase tracking-[0.16em] font-medium text-primary-600 dark:text-primary-400">
                      How it works
                    </div>
                    <h3 className="mt-2 text-lg sm:text-xl font-semibold tracking-tight text-slate-900 dark:text-dark-text leading-[1.2]">
                      From upload to download, in three steps.
                    </h3>
                  </div>
                  <ol className="relative mt-4 space-y-3 list-none p-0 m-0">
                    {[
                      {
                        n: 1,
                        title: "Pick a tool",
                        description:
                          "Browse 35+ PDF utilities organised by what you want to do — all in one place.",
                      },
                      {
                        n: 2,
                        title: "Drop your PDF",
                        description:
                          "Files are processed entirely in your browser. Nothing ever leaves your device.",
                      },
                      {
                        n: 3,
                        title: "Download the result",
                        description:
                          "Polished output with no watermarks, no sign-ups, no waiting in a queue.",
                      },
                    ].map((step) => (
                      <li key={step.n} className="flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className="shrink-0 w-7 h-7 rounded-full inline-flex items-center justify-center text-[12px] font-semibold leading-none tabular-nums text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/40 border border-primary-100 dark:border-primary-800/60"
                        >
                          {step.n}
                        </span>
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold tracking-[-0.005em] text-slate-800 dark:text-dark-text">
                            {step.title}
                          </div>
                          <div className="text-[12.5px] leading-[1.55] text-slate-500 dark:text-dark-text-muted">
                            {step.description}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Cloakyard family promo card */}
                <a
                  href={CLOAKYARD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sm:col-span-5 group relative overflow-hidden rounded-2xl border border-slate-200/70 dark:border-dark-border bg-white/65 dark:bg-dark-surface/60 backdrop-blur-md p-5 flex flex-col justify-between hover:border-primary-300/60 dark:hover:border-primary-400/30 transition-colors"
                >
                  <div
                    aria-hidden="true"
                    className="absolute -bottom-12 -left-12 w-40 h-40 rounded-full bg-primary-500/10 dark:bg-primary-400/5 blur-3xl pointer-events-none"
                  />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <img
                          src="/icons/cloakyard.svg"
                          alt=""
                          aria-hidden="true"
                          className="w-7 h-7 drop-shadow-sm"
                        />
                        <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-slate-400 dark:text-dark-text-muted">
                          Part of
                        </span>
                      </div>
                      <span className="shrink-0 inline-flex items-center rounded-full bg-slate-100/80 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 px-2 py-0.5 font-mono text-[10px] tabular-nums tracking-tight text-slate-500 dark:text-dark-text-muted">
                        CloakPDF v{__APP_VERSION__}
                      </span>
                    </div>
                    <h4 className="mt-2.5 text-lg font-semibold tracking-tight text-slate-900 dark:text-dark-text">
                      Cloakyard
                    </h4>
                    <p className="mt-1 text-[12.5px] text-slate-500 dark:text-dark-text-muted leading-[1.55]">
                      A family of privacy-focused tools that keep your data on your device.
                    </p>
                  </div>
                  <span className="relative mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-primary-600 dark:text-primary-400">
                    Explore
                    <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </span>
                </a>
              </div>
            )}

            <div className="border-t border-slate-200/60 dark:border-dark-border pt-5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-[12.5px] text-slate-500 dark:text-dark-text-muted">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span>Built with care by</span>
                <a
                  href={AUTHOR_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-700 dark:text-dark-text hover:text-primary-600 dark:hover:text-primary-400 no-underline font-medium transition-colors duration-150"
                >
                  Sumit Sahoo
                </a>
              </div>
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 sm:ml-auto">
                <button
                  type="button"
                  onClick={onPrivacy}
                  className="group inline-flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400 bg-transparent cursor-pointer transition-colors duration-150"
                >
                  <ShieldCheck
                    className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 transition-colors duration-150 group-hover:text-primary-600 dark:group-hover:text-primary-400"
                    aria-hidden="true"
                  />
                  Privacy
                </button>
                <span aria-hidden="true">·</span>
                <a
                  href={`${REPO_URL}/blob/main/LICENSE`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400 transition-colors duration-150"
                >
                  <Scale
                    className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 transition-colors duration-150 group-hover:text-primary-600 dark:group-hover:text-primary-400"
                    aria-hidden="true"
                  />
                  <span>
                    <span className="text-slate-400 dark:text-slate-500 transition-colors duration-150 group-hover:text-primary-600 dark:group-hover:text-primary-400">
                      MIT
                    </span>{" "}
                    licensed
                  </span>
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
