import { AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[CloakPDF] Uncaught error:", error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const issueUrl = `https://github.com/sumitsahoo/cloakpdf/issues/new?title=${encodeURIComponent(
      `Crash: ${error.message}`,
    )}&body=${encodeURIComponent(
      `**Error:** ${error.message}\n\n**Stack:**\n\`\`\`\n${error.stack ?? "(no stack)"}\n\`\`\`\n\n**Browser:** ${navigator.userAgent}`,
    )}`;

    return (
      <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-primary-50/40 dark:from-dark-bg dark:via-dark-bg dark:to-dark-surface/60 flex flex-col">
        <header className="bg-white/85 dark:bg-dark-surface/85 backdrop-blur-md border-b border-slate-200/80 dark:border-dark-border shadow-sm shadow-slate-100/50 dark:shadow-black/20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-2.5">
            <div className="w-10 h-10 flex items-center justify-center">
              <img src="/icons/logo.svg" alt="CloakPDF logo" className="w-10 h-10 drop-shadow-md" />
            </div>
            <span className="text-lg font-semibold text-slate-800 dark:text-dark-text">
              CloakPDF
            </span>
          </div>
        </header>

        <main className="flex-1 max-w-2xl mx-auto px-4 sm:px-6 py-8 w-full">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 bg-red-50 dark:bg-red-900/30 rounded-xl flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 dark:text-dark-text">
                Something went wrong
              </h1>
              <p className="text-slate-500 dark:text-dark-text-muted mt-0.5">
                CloakPDF hit an unexpected error
              </p>
            </div>
          </div>

          <div className="space-y-8 text-sm text-slate-600 dark:text-dark-text-muted leading-relaxed">
            <section className="flex items-start gap-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-4">
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-emerald-800 dark:text-emerald-200">
                Your files were never uploaded — everything stays on your device.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-slate-800 dark:text-dark-text mb-2">
                Error details
              </h2>
              <pre className="whitespace-pre-wrap text-xs bg-slate-50 dark:bg-dark-bg border border-slate-200 dark:border-dark-border rounded-lg p-3 text-slate-700 dark:text-dark-text font-mono overflow-x-auto max-h-40">
                {error.message}
              </pre>
            </section>

            <section>
              <h2 className="text-base font-semibold text-slate-800 dark:text-dark-text mb-3">
                What you can do
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="inline-flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white py-3 px-6 rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50"
                >
                  <RefreshCw className="w-4 h-4" aria-hidden="true" />
                  Reload app
                </button>
                <button
                  type="button"
                  onClick={this.handleReset}
                  className="bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border text-slate-700 dark:text-dark-text py-3 px-6 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-dark-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50"
                >
                  Try again
                </button>
              </div>
              <p className="mt-4 text-xs">
                If this keeps happening, please{" "}
                <a
                  href={issueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 dark:text-primary-400 hover:underline"
                >
                  report this issue on GitHub
                </a>{" "}
                — the error details above will be pre-filled.
              </p>
            </section>
          </div>
        </main>
      </div>
    );
  }
}
