interface AlertBoxProps {
  message: string;
  variant: "error" | "success";
}

const styles = {
  error:
    "bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-300",
  success:
    "bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 text-sm text-emerald-700 dark:text-emerald-300",
};

export function AlertBox({ message, variant }: AlertBoxProps) {
  return (
    <div className={styles[variant]}>
      <p>{message}</p>
    </div>
  );
}
