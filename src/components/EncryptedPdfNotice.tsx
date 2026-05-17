/**
 * Inline notice shown when a tool that requires an unencrypted PDF is
 * fed a password-protected one.
 *
 * Replaces the file dropzone (and any error alert) so the user lands on
 * actionable copy instead of a raw "No password given" / "EncryptedPDFError"
 * line. The primary CTA deep-links into the PDF Password tool — that's the
 * one tool in the app that can strip the password — and a secondary
 * "Choose another file" returns the user to the dropzone.
 */
import { Lock } from "lucide-react";
import { formatFileSize } from "../utils/file-helpers.ts";
import { navigateToTool } from "../utils/nav.ts";

interface EncryptedPdfNoticeProps {
  /** The encrypted PDF the user just tried to upload. */
  file: File;
  /** Clear the encrypted-file state and return the dropzone. */
  onChangeFile: () => void;
}

export function EncryptedPdfNotice({ file, onChangeFile }: EncryptedPdfNoticeProps) {
  return (
    <div className="flex items-start gap-3 border rounded-xl p-4 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/60">
      <Lock
        className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0 text-sm leading-relaxed">
        <p className="font-semibold mb-0.5 text-amber-800 dark:text-amber-200">
          This PDF is password-protected
        </p>
        <p className="text-amber-700/90 dark:text-amber-300/90">
          <span className="font-medium">{file.name}</span> ({formatFileSize(file.size)}) is
          encrypted and can't be processed by this tool. Remove the password first with{" "}
          <span className="font-medium">PDF Password</span>, then come back and upload the unlocked
          copy.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigateToTool("pdf-password")}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2"
          >
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            Open PDF Password
          </button>
          <button
            type="button"
            onClick={onChangeFile}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
          >
            Choose another file
          </button>
        </div>
      </div>
    </div>
  );
}
