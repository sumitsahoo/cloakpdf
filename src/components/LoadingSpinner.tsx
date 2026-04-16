interface LoadingSpinnerProps {
  /** Tailwind border color classes, e.g. "border-primary-200 border-t-primary-600" */
  color?: string;
  size?: "sm" | "md";
  className?: string;
}

export function LoadingSpinner({
  color = "border-primary-200 border-t-primary-600",
  size = "md",
  className = "flex items-center justify-center py-12",
}: LoadingSpinnerProps) {
  const sizeClass = size === "sm" ? "w-6 h-6 border-2" : "w-8 h-8 border-3";
  return (
    <div className={className}>
      <div className={`${sizeClass} ${color} rounded-full animate-spin`} />
    </div>
  );
}
