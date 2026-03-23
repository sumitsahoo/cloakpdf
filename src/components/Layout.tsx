import type { ReactNode } from "react";

interface LayoutProps {
  children: ReactNode;
  onHome: () => void;
  showBack?: boolean;
}

export function Layout({ children, onHome, showBack }: LayoutProps) {
  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 to-primary-50/30 flex flex-col">
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          {showBack && (
            <button
              onClick={onHome}
              className="p-2 -ml-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-600"
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
            <div className="w-10 h-10 bg-linear-to-br from-primary-400 to-accent rounded-xl flex items-center justify-center shadow-sm">
              <svg className="w-6 h-6" viewBox="0 0 48 48" fill="none">
                <path
                  d="M13 7h15l9 9v24a3 3 0 01-3 3H13a3 3 0 01-3-3V10a3 3 0 013-3z"
                  fill="white"
                  opacity="0.95"
                />
                <path d="M28 7v6a3 3 0 003 3h6l-9-9z" fill="#d5f2ec" />
                <text
                  x="23.5"
                  y="22"
                  fontFamily="ui-monospace,monospace"
                  fontWeight="700"
                  fontSize="5.5"
                  fill="#3da396"
                  opacity="0.85"
                  textAnchor="middle"
                >
                  1 0 1 1
                </text>
                <text
                  x="23.5"
                  y="28.5"
                  fontFamily="ui-monospace,monospace"
                  fontWeight="700"
                  fontSize="5.5"
                  fill="#4db8a8"
                  opacity="0.65"
                  textAnchor="middle"
                >
                  0 1 0 0
                </text>
                <text
                  x="23.5"
                  y="35"
                  fontFamily="ui-monospace,monospace"
                  fontWeight="700"
                  fontSize="5.5"
                  fill="#3da396"
                  opacity="0.45"
                  textAnchor="middle"
                >
                  1 1 0 1
                </text>
              </svg>
            </div>
            <span className="text-lg font-semibold text-slate-800">BytePDF</span>
          </button>
          <div className="ml-auto flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full">
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

      <footer className="border-t border-slate-200 bg-white/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 text-center text-sm text-slate-400">
          All processing happens in your browser. No files are uploaded to any server.
        </div>
      </footer>
    </div>
  );
}
