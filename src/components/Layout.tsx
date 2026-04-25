/**
 * Root layout shell for the application.
 *
 * Provides a sticky header (logo, privacy badge, optional back button),
 * a centred content area, an animated aurora backdrop, and a rich
 * footer that mirrors the Cloakyard family sites. All pages/tools are
 * rendered inside `children`.
 */

import { ChevronLeft, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { AuroraBackground } from "./AuroraBackground";

declare const __APP_VERSION__: string;

const REPO_URL = "https://github.com/sumitsahoo/cloakpdf";
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
    <div className="relative min-h-screen bg-linear-to-br from-slate-50 via-white to-primary-50/40 dark:from-dark-bg dark:via-dark-bg dark:to-dark-surface/60 flex flex-col">
      {/* Aurora backdrop — self-contained component. mix-blend-mode is
          themed via the surrounding `--aurora-blend` token (light:
          multiply, dark: screen) defined in index.css. */}
      <AuroraBackground />

      <header className="relative z-50 bg-white/85 dark:bg-dark-surface/85 backdrop-blur-md border-b border-slate-200/80 dark:border-dark-border sticky top-0 shadow-sm shadow-slate-100/50 dark:shadow-black/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          {showBack && (
            <button
              type="button"
              onClick={onHome}
              className="p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-surface-alt transition-colors text-slate-600 dark:text-dark-text-muted"
              aria-label="Back to home"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          <button
            type="button"
            onClick={onHome}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <div className="w-10 h-10 flex items-center justify-center">
              <img src="/icons/logo.svg" alt="CloakPDF logo" className="w-10 h-10 drop-shadow-md" />
            </div>
            <span className="text-lg font-semibold tracking-[-0.015em] text-slate-800 dark:text-dark-text">
              Cloak<span className="text-primary-600 dark:text-primary-400">PDF</span>
            </span>
          </button>

          <div className="ml-auto flex items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-1.5 select-none">
              <ShieldCheck className="w-4 h-4 text-primary-600 dark:text-primary-400" />
              <span className="text-xs font-medium text-slate-500 dark:text-dark-text-muted whitespace-nowrap">
                <span className="sm:hidden">Private</span>
                <span className="hidden sm:inline lg:hidden">100% Private</span>
                <span className="hidden lg:inline">100% Private · Open Source</span>
              </span>
            </div>

            <div className="w-px h-4 bg-slate-200 dark:bg-dark-border" />

            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text transition-colors duration-200"
              aria-label="View source on GitHub"
            >
              <GithubMark className="w-5 h-5" />
              <span className="sr-only">GitHub</span>
            </a>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-8 w-full">
        {children}
      </main>

      {/* Footer bg bumped to ~92% opaque (was 55%) so the orange aurora
          blob anchored at the bottom-left can't bleed through into iOS
          Safari's bottom-toolbar tint sampling. `safe-area-inset-bottom`
          extends the painted area into the home-indicator zone so the
          toolbar always samples the footer's surface color. */}
      <footer
        className="relative z-10 border-t border-slate-200/60 dark:border-dark-border bg-[color-mix(in_oklab,white_92%,transparent)] dark:bg-[color-mix(in_oklab,var(--color-dark-surface)_92%,transparent)] backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-7 sm:pt-12 sm:pb-8">
          {/* Top row: brand + privacy link */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-6 sm:gap-10">
            <div className="flex items-start gap-3 min-w-0 sm:max-w-sm">
              <img src="/icons/logo.svg" alt="" aria-hidden="true" className="w-9 h-9 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-800 dark:text-dark-text tracking-[-0.01em]">
                    Cloak<span className="text-primary-600 dark:text-primary-400">PDF</span>
                  </span>
                  <a
                    href={`${REPO_URL}/releases`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-mono tabular-nums tracking-tight text-slate-500 dark:text-dark-text-muted bg-slate-100 dark:bg-dark-surface-alt hover:text-primary-600 dark:hover:text-primary-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50"
                    aria-label={`Version ${__APP_VERSION__} — view release notes on GitHub`}
                  >
                    v{__APP_VERSION__}
                  </a>
                </div>
                <p className="text-[13px] text-slate-500 dark:text-dark-text-muted leading-[1.55] mt-1.5">
                  All-in-one PDF tools that respect your privacy. Your files never leave your
                  browser.
                </p>
              </div>
            </div>

            <nav
              aria-label="Footer"
              className="hidden sm:flex flex-wrap items-center gap-x-5 gap-y-2 sm:ml-auto text-[13px]"
            >
              <button
                type="button"
                onClick={onPrivacy}
                className="inline-flex items-center gap-1.5 text-slate-500 dark:text-dark-text-muted hover:text-slate-800 dark:hover:text-dark-text bg-transparent cursor-pointer transition-colors duration-150 font-medium"
              >
                <ShieldCheck
                  className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400"
                  aria-hidden="true"
                />
                Privacy Policy
              </button>
            </nav>
          </div>

          {/* Divider */}
          <div className="h-px bg-slate-200/60 dark:bg-dark-border my-6 sm:my-7" />

          {/* Bottom row: attribution + cloakyard pitch */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 text-[12.5px] text-slate-500 dark:text-dark-text-muted">
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
              <span aria-hidden="true">·</span>
              <a
                href={`${REPO_URL}/blob/main/LICENSE`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors duration-150"
              >
                <span className="text-slate-400 dark:text-slate-500">MIT</span> licensed
              </a>
              <span aria-hidden="true" className="sm:hidden">
                ·
              </span>
              <button
                type="button"
                onClick={onPrivacy}
                className="sm:hidden text-slate-700 dark:text-dark-text hover:text-primary-600 dark:hover:text-primary-400 bg-transparent cursor-pointer transition-colors duration-150 font-medium"
              >
                Privacy
              </button>
            </div>

            <div className="sm:ml-auto flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span>Part of</span>
              <a
                href={CLOAKYARD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-slate-700 dark:text-dark-text hover:text-primary-600 dark:hover:text-primary-400 no-underline font-medium transition-colors duration-150"
              >
                <img
                  src="/icons/cloakyard.svg"
                  alt=""
                  aria-hidden="true"
                  className="w-3.5 h-3.5 shrink-0"
                />
                Cloakyard
              </a>
              <span className="hidden sm:inline text-slate-400 dark:text-slate-500">
                — a collection of privacy-focused tools.
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
