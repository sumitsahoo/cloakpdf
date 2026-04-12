import { RefreshCw, X } from "lucide-react";
import { useCallback, useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000; // Check every 10 minutes

export function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      // Periodically check for new service worker updates
      setInterval(async () => {
        if (registration.installing || !navigator) return;
        if ("connection" in navigator && !navigator.onLine) return;
        const resp = await fetch(swUrl, {
          cache: "no-store",
          headers: { cache: "no-store" },
        });
        if (resp.status === 200) await registration.update();
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  const close = useCallback(() => {
    setOfflineReady(false);
    setNeedRefresh(false);
  }, [setOfflineReady, setNeedRefresh]);

  // Auto-dismiss the "offline ready" toast after 4 seconds
  useEffect(() => {
    if (!offlineReady) return;
    const id = setTimeout(close, 4000);
    return () => clearTimeout(id);
  }, [offlineReady, close]);

  if (!offlineReady && !needRefresh) return null;

  return (
    <div className="fixed bottom-6 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50 animate-fade-in-up">
      <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 px-4 sm:px-5 py-3 rounded-2xl bg-white dark:bg-dark-surface backdrop-blur-md text-slate-700 dark:text-dark-text shadow-xl border border-slate-200 dark:border-dark-border">
        <button
          type="button"
          onClick={close}
          className="absolute top-2.5 right-2.5 sm:static p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-surface-alt text-slate-400 dark:text-dark-text-muted hover:text-slate-600 dark:hover:text-dark-text transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
        <span className="text-sm font-medium pr-8 sm:pr-0">
          {needRefresh ? "A new version is available." : "App ready to work offline."}
        </span>
        {needRefresh && (
          <button
            type="button"
            onClick={() => updateServiceWorker(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-full bg-primary-600 hover:bg-primary-700 text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Update
          </button>
        )}
      </div>
    </div>
  );
}
