interface FileInfoBarProps {
  fileName: string;
  details: string;
  onChangeFile: () => void;
  extra?: React.ReactNode;
}

export function FileInfoBar({ fileName, details, onChangeFile, extra }: FileInfoBarProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <p className="text-sm text-slate-600 dark:text-dark-text-muted break-all sm:break-normal">
        <span className="font-medium">{fileName}</span> — {details}
        {extra}
      </p>
      <button
        type="button"
        onClick={onChangeFile}
        className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 transition-colors"
      >
        Change file
      </button>
    </div>
  );
}
