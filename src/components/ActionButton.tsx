import { ArrowRight, Download } from "lucide-react";
import { useWorkflowSlot } from "../workflow/WorkflowContext.tsx";

interface ActionButtonProps {
  onClick: () => void;
  processing: boolean;
  label: string;
  processingLabel: string;
  disabled?: boolean;
  color?: string;
}

export function ActionButton({
  onClick,
  processing,
  label,
  processingLabel,
  disabled,
  color = "bg-primary-600 hover:bg-primary-700",
}: ActionButtonProps) {
  // In an intermediate workflow step the button delivers to the next
  // step — visually reinforce that with a trailing arrow. On the final
  // step (last in a workflow) the button triggers a download, so swap
  // the arrow for a download glyph. Standalone tools whose label
  // explicitly says "Download" (e.g. "Apply Signature & Download")
  // also get the download glyph; tools that show a result panel first
  // (e.g. CompressPdf) use a different label and stay icon-less.
  const slot = useWorkflowSlot();
  const trailingIcon = processing
    ? null
    : slot === null
      ? /download/i.test(label)
        ? "download"
        : null
      : slot.isLastStep
        ? "download"
        : "continue";

  return (
    <div className="pt-6 sm:flex sm:justify-center sm:pt-8">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled ?? processing}
        className={`inline-flex items-center justify-center gap-1.5 w-full sm:w-auto sm:min-w-55 ${color} text-white py-3 px-8 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
      >
        <span>{processing ? processingLabel : label}</span>
        {trailingIcon === "continue" && <ArrowRight className="w-4 h-4" />}
        {trailingIcon === "download" && <Download className="w-4 h-4" />}
      </button>
    </div>
  );
}
