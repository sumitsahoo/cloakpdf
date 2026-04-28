import { useWorkflowSlot } from "../workflow/WorkflowContext.tsx";

interface FileInfoBarProps {
  fileName: string;
  details: string;
  /**
   * Click handler for the "Change file" link. When omitted the link is
   * hidden — useful for read-only / mid-workflow contexts where the
   * displayed file is an intermediate result rather than a user choice.
   */
  onChangeFile?: () => void;
  extra?: React.ReactNode;
}

/**
 * Standard "selected file" header shown by every tool.
 *
 * When the tool is rendered as a workflow step (i.e. wrapped in
 * `WorkflowContext`), this component renders nothing — the
 * `WorkflowRunner` already displays the file name, size and current
 * step above the inflated tool, so a second copy here would just be a
 * visually noisy duplicate. Tools that need to surface step-specific
 * status (e.g. "3 blank pages detected") can do so via their own
 * elements; the headline file metadata lives one place.
 */
export function FileInfoBar({ fileName, details, onChangeFile, extra }: FileInfoBarProps) {
  if (useWorkflowSlot() !== null) return null;
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <p className="text-sm text-slate-600 dark:text-dark-text-muted break-all sm:break-normal">
        <span className="font-medium">{fileName}</span> — {details}
        {extra}
      </p>
      {onChangeFile && (
        <button
          type="button"
          onClick={onChangeFile}
          className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 transition-colors"
        >
          Change file
        </button>
      )}
    </div>
  );
}
