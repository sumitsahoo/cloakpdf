/**
 * PDF Password tool.
 *
 * Combines two operations in a single UI:
 *   - Add Password  – encrypts the PDF with a user/owner password via
 *                     pdf-lib-with-encrypt. Text and structure are preserved.
 *   - Remove Password – decrypts a protected PDF using the supplied password
 *                     and saves an unencrypted copy. Text remains selectable.
 *
 * All processing happens entirely in the browser — no files are uploaded.
 */

import { useState, useCallback } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { protectPdf, unlockPdf } from "../utils/pdf-security.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";

type Mode = "add" | "remove";

// Eye icon (open)
function IconEyeOpen() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

// Eye icon (closed / slashed)
function IconEyeOff() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
      />
    </svg>
  );
}

interface PasswordFieldProps {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  show: boolean;
  onToggleShow: () => void;
}

function PasswordField({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder = "Enter password",
  autoComplete = "off",
  show,
  onToggleShow,
}: PasswordFieldProps) {
  return (
    <div className="p-4 space-y-2">
      <div>
        <label
          htmlFor={id}
          className="block text-sm font-medium text-slate-700 dark:text-dark-text"
        >
          {label}
        </label>
        {hint && <p className="text-xs text-slate-400 dark:text-dark-text-muted mt-0.5">{hint}</p>}
      </div>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="w-full px-3 py-2 pr-10 rounded-lg border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-bg text-sm text-slate-800 dark:text-dark-text placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-dark-text transition-colors"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <IconEyeOff /> : <IconEyeOpen />}
        </button>
      </div>
    </div>
  );
}

export default function PdfPassword() {
  const [mode, setMode] = useState<Mode>("add");

  const [file, setFile] = useState<File | null>(null);

  // Add-password state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // Remove-password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);

  // Shared operation state
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleFile = useCallback((files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setError(null);
    setSuccess(false);
  }, []);

  const reset = useCallback(() => {
    setFile(null);
    setError(null);
    setSuccess(false);
    setNewPassword("");
    setConfirmPassword("");
    setCurrentPassword("");
  }, []);

  const handleModeChange = useCallback((next: Mode) => {
    setMode(next);
    setError(null);
    setSuccess(false);
  }, []);

  const handleAddPassword = useCallback(async () => {
    if (!file) return;
    if (!newPassword) {
      setError("Please enter a password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setProcessing(true);
    setError(null);
    setSuccess(false);
    try {
      const bytes = await protectPdf(file, newPassword);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(bytes, `${baseName}_protected.pdf`);
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add password.");
    } finally {
      setProcessing(false);
    }
  }, [file, newPassword, confirmPassword]);

  const handleRemovePassword = useCallback(async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    setSuccess(false);
    try {
      const bytes = await unlockPdf(file, currentPassword);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(bytes, `${baseName}_unlocked.pdf`);
      setSuccess(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to unlock PDF.";
      if (msg.toLowerCase().includes("incorrect") || msg.toLowerCase().includes("invalid")) {
        setError("Incorrect password. Please check and try again.");
      } else if (msg.toLowerCase().includes("password") || msg.toLowerCase().includes("encrypt")) {
        setError("A password is required to open this PDF. Please enter the current password.");
      } else {
        setError(msg);
      }
    } finally {
      setProcessing(false);
    }
  }, [file, currentPassword]);

  const passwordsMatch = newPassword === confirmPassword;
  const canSubmitAdd = !!file && !!newPassword && passwordsMatch && !processing;
  const canSubmitRemove = !!file && !processing;

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="inline-flex rounded-xl border border-slate-200 dark:border-dark-border bg-slate-100 dark:bg-dark-surface p-1 gap-1">
        <button
          type="button"
          onClick={() => handleModeChange("add")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            mode === "add"
              ? "bg-white dark:bg-dark-bg text-slate-800 dark:text-dark-text shadow-sm"
              : "text-slate-500 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text"
          }`}
        >
          Add Password
        </button>
        <button
          type="button"
          onClick={() => handleModeChange("remove")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            mode === "remove"
              ? "bg-white dark:bg-dark-bg text-slate-800 dark:text-dark-text shadow-sm"
              : "text-slate-500 dark:text-dark-text-muted hover:text-slate-700 dark:hover:text-dark-text"
          }`}
        >
          Remove Password
        </button>
      </div>

      {/* File picker */}
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint={
            mode === "add"
              ? "Select a PDF to password-protect"
              : "Select a password-protected PDF to unlock"
          }
        />
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-600 dark:text-dark-text-muted">
            <span className="font-medium">{file.name}</span> — {formatFileSize(file.size)}
          </p>
          <button
            type="button"
            onClick={reset}
            className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
          >
            Change file
          </button>
        </div>
      )}

      {/* Panel: Add Password */}
      {mode === "add" && file && (
        <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border divide-y divide-slate-100 dark:divide-dark-border">
          <PasswordField
            id="new-password"
            label="New password"
            value={newPassword}
            onChange={setNewPassword}
            placeholder="Enter new password"
            autoComplete="new-password"
            show={showNewPw}
            onToggleShow={() => setShowNewPw((v) => !v)}
          />
          <PasswordField
            id="confirm-password"
            label="Confirm password"
            hint={confirmPassword && !passwordsMatch ? "Passwords do not match" : undefined}
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Re-enter new password"
            autoComplete="new-password"
            show={showConfirmPw}
            onToggleShow={() => setShowConfirmPw((v) => !v)}
          />
        </div>
      )}

      {/* Panel: Remove Password */}
      {mode === "remove" && file && (
        <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border divide-y divide-slate-100 dark:divide-dark-border">
          <PasswordField
            id="current-password"
            label="Current password"
            hint="Leave blank if the PDF uses an empty password."
            value={currentPassword}
            onChange={setCurrentPassword}
            placeholder="Enter current password"
            autoComplete="current-password"
            show={showCurrentPw}
            onToggleShow={() => setShowCurrentPw((v) => !v)}
          />
        </div>
      )}

      {/* Action button */}
      {file && (
        <button
          type="button"
          onClick={mode === "add" ? handleAddPassword : handleRemovePassword}
          disabled={mode === "add" ? !canSubmitAdd : !canSubmitRemove}
          className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {processing
            ? mode === "add"
              ? "Protecting…"
              : "Unlocking…"
            : mode === "add"
              ? "Protect PDF & Download"
              : "Remove Password & Download"}
        </button>
      )}

      {/* Success */}
      {success && (
        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            {mode === "add"
              ? "Password added successfully. The protected PDF has been downloaded."
              : "Password removed successfully. The unlocked PDF has been downloaded."}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}
    </div>
  );
}
