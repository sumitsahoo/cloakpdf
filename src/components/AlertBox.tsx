/**
 * Red error banner for inline failure messages.
 *
 * Errors are the only message type handled here — warnings, info, and success
 * all go through {@link InfoCallout} so their colour harmonises with the
 * surrounding tool category.
 *
 * A continuous soft-ring attention pulse (`.error-pulse` in index.css) keeps
 * failures from being missed. The pulse respects `prefers-reduced-motion`.
 */

interface AlertBoxProps {
  /** Text displayed inside the alert. */
  message: string;
}

export function AlertBox({ message }: AlertBoxProps) {
  return (
    <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-300 error-pulse">
      {/* `overflow-wrap: anywhere` (vs the gentler `break-words`) so
          long unbreakable tokens in surfaced runtime errors —
          `onnxruntime::webgpu::BufferManager::Download(void *, size_t)`,
          file paths with no spaces, stack-trace lines — wrap at the
          container edge instead of spilling past it on narrow viewports. */}
      <p className="wrap-anywhere">{message}</p>
    </div>
  );
}
