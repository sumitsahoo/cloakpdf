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
            <div className="w-11 h-11 flex items-center justify-center">
              <svg className="w-10 h-10 drop-shadow-md" viewBox="0 0 48 48" fill="none">
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
          <div className="ml-auto flex items-center gap-1.5 text-xs bg-primary-50 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 px-2.5 py-1 rounded-full">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                clipRule="evenodd"
              />
            </svg>
            100% Private
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
