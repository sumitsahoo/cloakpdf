/**
 * Root layout shell for the application.
 *
 * Provides a sticky header (logo, privacy badge, optional back button),
 * a centred content area, and a footer reinforcing the privacy message.
 * All pages/tools are rendered inside `children`.
 */

import { ChevronLeft, Lock } from "lucide-react";
import type { ReactNode } from "react";

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

export function Layout({ children, onHome, showBack, onPrivacy }: LayoutProps) {
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
              <img src="/icons/logo.svg" alt="CloakPDF logo" className="w-10 h-10 drop-shadow-md" />
            </div>
            <span className="text-lg font-semibold text-slate-800 dark:text-dark-text">
              CloakPDF
            </span>
          </button>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-2">
            {/* Privacy badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700/60 text-primary-700 dark:text-primary-300 select-none">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs font-semibold whitespace-nowrap">
                <span className="sm:hidden">Private</span>
                <span className="hidden sm:inline lg:hidden">100% Private</span>
                <span className="hidden lg:inline">100% Private · Open Source</span>
              </span>
            </div>

            {/* GitHub link */}
            <a
              href="https://github.com/sumitsahoo/cloakpdf"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-slate-200 dark:border-dark-border hover:bg-slate-100 dark:hover:bg-dark-surface-alt hover:border-slate-300 dark:hover:border-dark-border transition-all duration-200 text-slate-600 dark:text-dark-text-muted hover:text-slate-900 dark:hover:text-dark-text"
              aria-label="View source on GitHub"
            >
              <svg
                className="w-4 h-4 shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              <span className="hidden sm:inline text-xs font-medium">GitHub</span>
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-8 w-full">{children}</main>

      <footer className="border-t border-slate-200 dark:border-dark-border bg-white/50 dark:bg-dark-surface/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Brand + copyright */}
          <div className="flex items-center gap-2">
            <img src="/icons/logo.svg" alt="" aria-hidden="true" className="w-5 h-5 opacity-60" />
            <span className="text-xs font-medium text-slate-500 dark:text-dark-text-muted">
              CloakPDF
            </span>
            <span className="text-slate-300 dark:text-dark-border text-xs" aria-hidden="true">
              ·
            </span>
            <span className="text-xs text-slate-400 dark:text-dark-text-muted">
              © {new Date().getFullYear()} Sumit Sahoo
            </span>
          </div>

          {/* Right side: privacy note + privacy policy link */}
          <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-dark-text-muted">
            <Lock className="w-3.5 h-3.5 shrink-0 hidden sm:block" aria-hidden="true" />
            <span className="hidden sm:inline">Files never leave your device</span>
            <span
              className="text-slate-300 dark:text-dark-border hidden sm:inline"
              aria-hidden="true"
            >
              ·
            </span>
            <button
              type="button"
              onClick={onPrivacy}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-200 dark:border-dark-border hover:bg-slate-100 dark:hover:bg-dark-surface-alt hover:border-slate-300 dark:hover:border-dark-border transition-all duration-200 text-xs font-medium text-slate-500 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50"
            >
              Privacy Policy
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
