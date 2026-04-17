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
      <p>{message}</p>
    </div>
  );
}
