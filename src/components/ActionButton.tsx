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
  return (
    <div className="sm:flex sm:justify-center">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled ?? processing}
        className={`w-full sm:w-auto sm:min-w-55 ${color} text-white py-3 px-8 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
      >
        {processing ? processingLabel : label}
      </button>
    </div>
  );
}
