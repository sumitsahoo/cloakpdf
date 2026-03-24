/**
 * Root layout shell for the application.
 *
 * Provides a sticky header (logo, privacy badge, optional back button),
 * a centred content area, and a footer reinforcing the privacy message.
 * All pages/tools are rendered inside `children`.
 */

import type { ReactNode } from "react";

interface LayoutProps {
  /** Content to render in the main area. */
  children: ReactNode;
  /** Callback fired when the user navigates back to the home screen. */
  onHome: () => void;
  /** When true, displays a back-arrow button in the header. */
  showBack?: boolean;
}

export function Layout({ children, onHome, showBack }: LayoutProps) {
  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 to-primary-50/30 dark:from-dark-bg dark:to-dark-bg flex flex-col">
      <header className="bg-white/80 dark:bg-dark-surface/80 backdrop-blur-sm border-b border-slate-200 dark:border-dark-border sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          {showBack && (
            <button
              onClick={onHome}
              className="p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-surface-alt transition-colors text-slate-600 dark:text-dark-text-muted"
              aria-label="Back to home"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
          )}
          <button
            onClick={onHome}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <div className="w-12 h-12 flex items-center justify-center">
              <svg className="w-12 h-12 drop-shadow-md" viewBox="0 0 48 48" fill="none">
                <defs>
                  <linearGradient
                    id="shld"
                    x1="0"
                    y1="0"
                    x2="48"
                    y2="48"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0%" stopColor="#60A5FA" />
                    <stop offset="100%" stopColor="#1D4ED8" />
                  </linearGradient>
                </defs>
                <path d="M24 2 L44 12 L44 28 Q44 42 24 47 Q4 42 4 28 L4 12 Z" fill="url(#shld)" />
                <text
                  x="24"
                  y="18"
                  fontFamily="ui-monospace,monospace"
                  fontWeight="700"
                  fontSize="8"
                  fill="white"
                  opacity="0.9"
                  textAnchor="middle"
                >
                  1 0 1
                </text>
                <text
                  x="24"
                  y="28"
                  fontFamily="ui-monospace,monospace"
                  fontWeight="700"
                  fontSize="8"
                  fill="white"
                  opacity="0.7"
                  textAnchor="middle"
                >
                  0 1 0
                </text>
                <text
                  x="24"
                  y="38"
                  fontFamily="ui-monospace,monospace"
                  fontWeight="700"
                  fontSize="8"
                  fill="white"
                  opacity="0.5"
                  textAnchor="middle"
                >
                  1 0 1
                </text>
              </svg>
            </div>
            <span className="text-lg font-semibold text-slate-800 dark:text-dark-text">
              BytePDF
            </span>
          </button>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-1.5 text-xs bg-primary-50 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 px-1.5 sm:px-2.5 py-1 rounded-full">
              <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="hidden sm:inline whitespace-nowrap">100% Private</span>
              <span className="hidden sm:inline text-primary-400 dark:text-primary-500">&</span>
              <span className="hidden sm:inline whitespace-nowrap">Open Source</span>
            </div>
            <a
              href="https://github.com/sumitsahoo/bytepdf"
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-dark-surface-alt transition-colors text-slate-600 dark:text-dark-text-muted hover:text-slate-900 dark:hover:text-dark-text"
              aria-label="View source on GitHub"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
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
