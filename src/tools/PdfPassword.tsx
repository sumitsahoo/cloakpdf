/**
 * PDF Password tool.
 *
 * Uploads a PDF, auto-detects whether it is encrypted, then shows the
 * appropriate form:
 *   - Unencrypted PDF → Add Password (protects with AES-256) with optional
 *     permission restrictions (print, copy, modify, annotate, fill forms).
 *   - Encrypted PDF   → Remove Password (decrypts using the supplied password)
 *
 * All processing happens entirely in the browser — no files are uploaded.
 */

import { useState, useCallback } from "react";
import { Eye, EyeOff, ChevronRight, AlertTriangle } from "lucide-react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { isPdfEncrypted, protectPdf, unlockPdf } from "../utils/pdf-security.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";

type PdfState = "idle" | "detecting" | "unencrypted" | "encrypted";

// PDF permission bit masks (§7.6.3.2 Table 22)
const PERM_PRINT = 0x004;
const PERM_MODIFY = 0x008;
const PERM_COPY = 0x010;
const PERM_ANNOTATE = 0x020;
const PERM_FILL_FORMS = 0x100;
const PERM_PRINT_HQ = 0x800;

interface Permissions {
  print: boolean;
  printHighQuality: boolean;
  modify: boolean;
  copy: boolean;
  annotate: boolean;
  fillForms: boolean;
}

function buildPermissionsMask(p: Permissions): number {
  let mask = -4; // ALL_PERMS = 0xFFFFFFFC
  if (!p.print) mask &= ~PERM_PRINT;
  if (!p.printHighQuality) mask &= ~PERM_PRINT_HQ;
  if (!p.modify) mask &= ~PERM_MODIFY;
  if (!p.copy) mask &= ~PERM_COPY;
  if (!p.annotate) mask &= ~PERM_ANNOTATE;
  if (!p.fillForms) mask &= ~PERM_FILL_FORMS;
  return mask;
}

const PERMISSION_ROWS: { key: keyof Permissions; label: string; description: string }[] = [
  { key: "print", label: "Print", description: "Allow printing the document" },
  {
    key: "printHighQuality",
    label: "Print (high quality)",
    description: "Allow high-resolution printing",
  },
  { key: "copy", label: "Copy text & images", description: "Allow selecting and copying content" },
  { key: "modify", label: "Modify content", description: "Allow editing document content" },
  {
    key: "annotate",
    label: "Add / edit annotations",
    description: "Allow adding comments and annotations",
  },
  {
    key: "fillForms",
    label: "Fill form fields",
    description: "Allow filling interactive form fields",
  },
];

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
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

export default function PdfPassword() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfState, setPdfState] = useState<PdfState>("idle");

  // Add-password state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // Remove-password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);

  // Permissions state (only used when adding a password)
  const [showPerms, setShowPerms] = useState(false);
  const [permissions, setPermissions] = useState<Permissions>({
    print: true,
    printHighQuality: true,
    modify: false,
    copy: false,
    annotate: false,
    fillForms: true,
  });

  // Shared operation state
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleFile = useCallback(async (files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setError(null);
    setSuccess(false);
    setNewPassword("");
    setConfirmPassword("");
    setCurrentPassword("");
    setPdfState("detecting");
    try {
      const encrypted = await isPdfEncrypted(pdf);
      setPdfState(encrypted ? "encrypted" : "unencrypted");
    } catch {
      setPdfState("unencrypted"); // fallback: let the operation surface the real error
    }
  }, []);

  const reset = useCallback(() => {
    setFile(null);
    setPdfState("idle");
    setError(null);
    setSuccess(false);
    setNewPassword("");
    setConfirmPassword("");
    setCurrentPassword("");
    setShowPerms(false);
  }, []);

  const togglePermission = useCallback((key: keyof Permissions) => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
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
      const permMask = showPerms ? buildPermissionsMask(permissions) : undefined;
      const bytes = await protectPdf(file, newPassword, undefined, permMask);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(bytes, `${baseName}_protected.pdf`);
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add password.");
    } finally {
      setProcessing(false);
    }
  }, [file, newPassword, confirmPassword, showPerms, permissions]);

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
      {/* File picker */}
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Select a PDF to add or remove a password"
        />
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted">
              <span className="font-medium">{file.name}</span> — {formatFileSize(file.size)}
            </p>
            {pdfState === "detecting" && (
              <span className="text-xs text-slate-400 dark:text-dark-text-muted animate-pulse">
                Detecting…
              </span>
            )}
            {pdfState === "encrypted" && (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-full px-2 py-0.5">
                Password protected
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={reset}
            className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
          >
            Change file
          </button>
        </div>
      )}

      {/* Panel: Add Password (unencrypted PDF) */}
      {pdfState === "unencrypted" && (
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

      {/* Collapsible permissions section (only for Add Password) */}
      {pdfState === "unencrypted" && (
        <>
          <button
            type="button"
            onClick={() => setShowPerms((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-dark-text-muted hover:text-slate-800 dark:hover:text-dark-text transition-colors"
          >
            <ChevronRight
              className={`w-4 h-4 transition-transform ${showPerms ? "rotate-90" : ""}`}
            />
            Restrict permissions
          </button>

          {showPerms && (
            <>
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border divide-y divide-slate-100 dark:divide-dark-border">
                <div className="px-4 py-2.5 bg-slate-50 dark:bg-dark-surface-alt rounded-t-xl">
                  <p className="text-xs font-semibold text-slate-500 dark:text-dark-text-muted uppercase tracking-wide">
                    Allowed Operations
                  </p>
                </div>
                {PERMISSION_ROWS.map(({ key, label, description }) => (
                  <label
                    key={key}
                    className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-dark-surface-alt transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                        {label}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-dark-text-muted">
                        {description}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={permissions[key]}
                      onChange={() => togglePermission(key)}
                      className="accent-primary-600 w-4 h-4 rounded shrink-0"
                    />
                  </label>
                ))}
              </div>

              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Permission restrictions are enforced by Adobe Acrobat/Reader. Other viewers such
                  as macOS Preview and Chrome may ignore them and allow all operations regardless.
                </p>
              </div>
            </>
          )}
        </>
      )}

      {/* Panel: Remove Password (encrypted PDF) */}
      {pdfState === "encrypted" && (
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
      {(pdfState === "unencrypted" || pdfState === "encrypted") && (
        <button
          type="button"
          onClick={pdfState === "unencrypted" ? handleAddPassword : handleRemovePassword}
          disabled={pdfState === "unencrypted" ? !canSubmitAdd : !canSubmitRemove}
          className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {processing
            ? pdfState === "unencrypted"
              ? "Protecting…"
              : "Unlocking…"
            : pdfState === "unencrypted"
              ? "Protect PDF & Download"
              : "Remove Password & Download"}
        </button>
      )}

      {/* Success */}
      {success && (
        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            {pdfState === "unencrypted"
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
