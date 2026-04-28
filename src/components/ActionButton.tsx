import { ArrowRight } from "lucide-react";
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
  // step — visually reinforce that with a trailing arrow. The final
  // step (and standalone use) keeps the plain label since it terminates
  // in a download, not a hand-off.
  const slot = useWorkflowSlot();
  const showContinueArrow = slot !== null && !slot.isLastStep && !processing;

  return (
    <div className="sm:flex sm:justify-center">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled ?? processing}
        className={`inline-flex items-center justify-center gap-1.5 w-full sm:w-auto sm:min-w-55 ${color} text-white py-3 px-8 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
      >
        <span>{processing ? processingLabel : label}</span>
        {showContinueArrow && <ArrowRight className="w-4 h-4" />}
      </button>
    </div>
  );
}
