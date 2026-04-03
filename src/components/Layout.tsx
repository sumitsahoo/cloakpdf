/**
 * Root layout shell for the application.
 *
 * Provides a sticky header (logo, privacy badge, optional back button),
 * a centred content area, and a footer reinforcing the privacy message.
 * All pages/tools are rendered inside `children`.
 */

import { ChevronLeft, Lock } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

interface LayoutProps {
  /** Content to render in the main area. */
  children: ReactNode;
  /** Callback fired when the user navigates back to the home screen. */
  onHome: () => void;
  /** When true, displays a back-arrow button in the header. */
  showBack?: boolean;
}

export function Layout({ children, onHome, showBack }: LayoutProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showTooltip) return;
    const timer = setTimeout(() => setShowTooltip(false), 2000);
    const handleClickOutside = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setShowTooltip(false);
      }
    };
    document.addEventListener("click", handleClickOutside, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handleClickOutside, true);
    };
  }, [showTooltip]);

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-primary-50/40 dark:from-dark-bg dark:via-dark-bg dark:to-dark-surface/60 flex flex-col">
      <header className="bg-white/85 dark:bg-dark-surface/85 backdrop-blur-md border-b border-slate-200/80 dark:border-dark-border sticky top-0 z-50 shadow-sm shadow-slate-100/50 dark:shadow-black/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          {showBack && (
            <button
              onClick={onHome}
              className="p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-surface-alt transition-colors text-slate-600 dark:text-dark-text-muted"
              aria-label="Back to home"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={onHome}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <div className="w-12 h-12 flex items-center justify-center">
              <img src="/icons/logo.svg" alt="BytePDF logo" className="w-12 h-12 drop-shadow-md" />
            </div>
            <span className="text-lg font-semibold text-slate-800 dark:text-dark-text">
              BytePDF
            </span>
          </button>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <div ref={tooltipRef} className="relative">
              <button
                type="button"
                onClick={() => setShowTooltip((v) => !v)}
                className="flex items-center justify-center gap-1.5 text-xs bg-primary-50 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 p-1.5 sm:px-2.5 sm:py-1 rounded-full sm:cursor-default"
                aria-label="100% Private and Open Source"
              >
                <Lock className="w-4 h-4 sm:w-3 sm:h-3 shrink-0" />
                <span className="hidden sm:inline whitespace-nowrap">100% Private</span>
                <span className="hidden sm:inline text-primary-400 dark:text-primary-500">&</span>
                <span className="hidden sm:inline whitespace-nowrap">Open Source</span>
              </button>
              {showTooltip && (
                <div className="sm:hidden absolute top-full right-0 mt-2 px-3 py-1.5 rounded-lg bg-slate-800 dark:bg-slate-700 text-white text-xs whitespace-nowrap shadow-lg animate-fade-in z-50">
                  100% Private & Open Source
                  <div className="absolute -top-1 right-3 w-2 h-2 bg-slate-800 dark:bg-slate-700 rotate-45" />
                </div>
              )}
            </div>
            <a
              href="https://github.com/sumitsahoo/bytepdf"
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-dark-surface-alt transition-colors text-slate-600 dark:text-dark-text-muted hover:text-slate-900 dark:hover:text-dark-text"
              aria-label="View source on GitHub"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-8 w-full">{children}</main>

      <footer className="border-t border-slate-200 dark:border-dark-border bg-white/50 dark:bg-dark-surface/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 text-center text-sm text-slate-400 dark:text-dark-text-muted">
          All processing happens in your browser. No files are uploaded to any server.
        </div>
      </footer>
    </div>
  );
}
