/**
 * Root layout shell for the application.
 *
 * Provides a sticky header (logo, privacy badge, optional back button),
 * a centred content area, and a footer reinforcing the privacy message.
 * All pages/tools are rendered inside `children`.
 */

import { ChevronLeft, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

declare const __APP_VERSION__: string;

const REPO_URL = "https://github.com/sumitsahoo/cloakpdf";

interface LayoutProps {
  /** Content to render in the main area. */
  children: ReactNode;
  /** Callback fired when the user navigates back to the home screen. */
  onHome: () => void;
  /** When true, displays a back-arrow button in the header. */
  showBack?: boolean;
  /** Callback fired when the user clicks the Privacy Policy link. */
  onPrivacy: () => void;
  /** Optional accent colours for the privacy badge (matches active tool category). */
  badgeAccent?: { bg: string; border: string; text: string; logoFilter?: string };
  /** Active tool category key — drives footer hover accent. */
  activeCategory?: string;
}

const footerHover: Record<string, { btn: string; icon: string; link: string }> = {
  organise: {
    btn: "hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-700/60",
    icon: "group-hover:text-blue-500 dark:group-hover:text-blue-400",
    link: "hover:text-blue-600 dark:hover:text-blue-400",
  },
  transform: {
    btn: "hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50/50 dark:hover:bg-violet-900/20 hover:border-violet-200 dark:hover:border-violet-700/60",
    icon: "group-hover:text-violet-500 dark:group-hover:text-violet-400",
    link: "hover:text-violet-600 dark:hover:text-violet-400",
  },
  annotate: {
    btn: "hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 hover:border-emerald-200 dark:hover:border-emerald-700/60",
    icon: "group-hover:text-emerald-500 dark:group-hover:text-emerald-400",
    link: "hover:text-emerald-600 dark:hover:text-emerald-400",
  },
  security: {
    btn: "hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50/50 dark:hover:bg-amber-900/20 hover:border-amber-200 dark:hover:border-amber-700/60",
    icon: "group-hover:text-amber-500 dark:group-hover:text-amber-400",
    link: "hover:text-amber-600 dark:hover:text-amber-400",
  },
};

const defaultFooterHover = {
  btn: "hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50/50 dark:hover:bg-primary-900/20 hover:border-primary-200 dark:hover:border-primary-700/60",
  icon: "group-hover:text-primary-500 dark:group-hover:text-primary-400",
  link: "hover:text-primary-600 dark:hover:text-primary-400",
};

export function Layout({
  children,
  onHome,
  showBack,
  onPrivacy,
  badgeAccent,
  activeCategory,
}: LayoutProps) {
  const badgeText = badgeAccent?.text ?? "text-primary-700 dark:text-primary-300";
  const fh = (activeCategory && footerHover[activeCategory]) || defaultFooterHover;
  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-primary-50/40 dark:from-dark-bg dark:via-dark-bg dark:to-dark-surface/60 flex flex-col">
      <header className="bg-white/85 dark:bg-dark-surface/85 backdrop-blur-md border-b border-slate-200/80 dark:border-dark-border sticky top-0 z-50 shadow-sm shadow-slate-100/50 dark:shadow-black/20">
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

          {/* Logo */}
          <button
            type="button"
            onClick={onHome}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <div className="w-10 h-10 flex items-center justify-center">
              <img
                src="/icons/logo.svg"
                alt="CloakPDF logo"
                className="w-10 h-10 drop-shadow-md transition-[filter] duration-300"
                style={badgeAccent?.logoFilter ? { filter: badgeAccent.logoFilter } : undefined}
              />
            </div>
            <span className="text-lg font-semibold text-slate-800 dark:text-dark-text">
              CloakPDF
            </span>
          </button>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-3 sm:gap-4">
            {/* Privacy indicator */}
            <div className="flex items-center gap-1.5 select-none">
              <ShieldCheck className={`w-4 h-4 ${badgeText} transition-colors duration-300`} />
              <span className="text-xs font-medium text-slate-500 dark:text-dark-text-muted whitespace-nowrap">
                <span className="sm:hidden">Private</span>
                <span className="hidden sm:inline lg:hidden">100% Private</span>
                <span className="hidden lg:inline">100% Private · Open Source</span>
              </span>
            </div>

            <div className="w-px h-4 bg-slate-200 dark:bg-dark-border" />

            {/* GitHub */}
            <a
              href="https://github.com/sumitsahoo/cloakpdf"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text transition-colors duration-200"
              aria-label="View source on GitHub"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              <span className="sr-only">GitHub</span>
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-8 w-full">{children}</main>

      <footer className="border-t border-slate-200/60 dark:border-dark-border bg-linear-to-b from-white/60 to-slate-50/80 dark:from-dark-surface/60 dark:to-dark-bg/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
          {/* Brand · version · license */}
          <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start text-[11px] text-slate-400 dark:text-dark-text-muted">
            <span>© {new Date().getFullYear()} CloakPDF by Sumit Sahoo</span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
              ·
            </span>
            <a
              href={`${REPO_URL}/releases`}
              target="_blank"
              rel="noopener noreferrer"
              className={`font-mono font-medium text-slate-500 dark:text-slate-400 ${fh.link} transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 rounded`}
              aria-label={`Version ${__APP_VERSION__} — view release notes on GitHub`}
            >
              v{__APP_VERSION__}
            </a>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
              ·
            </span>
            <a
              href={`${REPO_URL}/blob/main/LICENSE`}
              target="_blank"
              rel="noopener noreferrer"
              className={`${fh.link} transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 rounded`}
            >
              MIT License
            </a>
          </div>

          {/* Privacy link */}
          <button
            type="button"
            onClick={onPrivacy}
            className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200/80 dark:border-dark-border text-[11px] font-medium text-slate-400 dark:text-dark-text-muted transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 ${fh.btn}`}
          >
            <ShieldCheck
              className={`w-3.5 h-3.5 shrink-0 text-slate-300 dark:text-dark-border transition-colors duration-200 ${fh.icon}`}
              aria-hidden="true"
            />
            Privacy Policy
          </button>
        </div>
      </footer>
    </div>
  );
}
