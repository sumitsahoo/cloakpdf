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

import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Copy,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  type LucideIcon,
  MessageSquare,
  Pencil,
  Printer,
} from "lucide-react";
import { useCallback, useState } from "react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { InfoCallout } from "../components/InfoCallout.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { useAsyncProcess } from "../hooks/useAsyncProcess.ts";
import { downloadPdf, errorMessage, formatFileSize, pdfFilename } from "../utils/file-helpers.ts";
import { isPdfEncrypted, protectPdf, unlockPdf } from "../utils/pdf-security.ts";

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

const PERMISSION_ROWS: {
  key: keyof Permissions;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  { key: "print", icon: Printer, label: "Print", description: "Allow printing the document" },
  {
    key: "printHighQuality",
    icon: Printer,
    label: "Print (high quality)",
    description: "Allow high-resolution printing",
  },
  {
    key: "copy",
    icon: Copy,
    label: "Copy text & images",
    description: "Allow selecting and copying content",
  },
  {
    key: "modify",
    icon: Pencil,
    label: "Modify content",
    description: "Allow editing document content",
  },
  {
    key: "annotate",
    icon: MessageSquare,
    label: "Add / edit annotations",
    description: "Allow adding comments and annotations",
  },
  {
    key: "fillForms",
    icon: ClipboardList,
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

  // Shared operation state — uses useAsyncProcess for the processing/error
  // machine. `success` stays local because it's a boolean, not a message.
  const task = useAsyncProcess();
  const processing = task.processing;
  const error = task.error;
  const setError = task.setError;
  const [success, setSuccess] = useState(false);

  const handleFile = useCallback(
    async (files: File[]) => {
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
    },
    [setError],
  );

  const reset = useCallback(() => {
    setFile(null);
    setPdfState("idle");
    setError(null);
    setSuccess(false);
    setNewPassword("");
    setConfirmPassword("");
    setCurrentPassword("");
    setShowPerms(false);
  }, [setError]);

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
    setSuccess(false);
    const ok = await task.run(async () => {
      const permMask = showPerms ? buildPermissionsMask(permissions) : undefined;
      const bytes = await protectPdf(file, newPassword, undefined, permMask);
      downloadPdf(bytes, pdfFilename(file, "_protected"));
    }, "Failed to add password.");
    if (ok) setSuccess(true);
  }, [file, newPassword, confirmPassword, showPerms, permissions, task, setError]);

  const handleRemovePassword = useCallback(async () => {
    if (!file) return;
    setSuccess(false);
    // Don't use task.run here — this handler needs to rewrite the error
    // message based on the failure mode (incorrect password vs. missing
    // password vs. generic), which run()'s fallback-string contract can't
    // express. Fall back to manual try/catch wiring through `task.setError`.
    try {
      const bytes = await unlockPdf(file, currentPassword);
      downloadPdf(bytes, pdfFilename(file, "_unlocked"));
      setSuccess(true);
      setError(null);
    } catch (e) {
      const msg = errorMessage(e, "Failed to unlock PDF.");
      if (msg.toLowerCase().includes("incorrect") || msg.toLowerCase().includes("invalid")) {
        setError("Incorrect password. Please check and try again.");
      } else if (msg.toLowerCase().includes("password") || msg.toLowerCase().includes("encrypt")) {
        setError("A password is required to open this PDF. Please enter the current password.");
      } else {
        setError(msg);
      }
    }
  }, [file, currentPassword, setError]);

  const passwordsMatch = newPassword === confirmPassword;
  const canSubmitAdd = !!file && !!newPassword && passwordsMatch && !processing;
  const canSubmitRemove = !!file && !processing;

  return (
    <div className="space-y-6">
      {/* File picker */}
      {!file ? (
        <FileDropZone
          glowColor={categoryGlow.security}
          iconColor={categoryAccent.security}
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
              <span className="text-xs font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800 rounded-full px-2 py-0.5">
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
          <div className="flex items-center gap-3 px-4 py-3 bg-primary-50 dark:bg-primary-900/20 rounded-t-xl">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary-100 dark:bg-primary-900/40">
              <Lock className="w-4 h-4 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-primary-800 dark:text-primary-300">
                Add Password
              </p>
              <p className="text-xs text-primary-600/80 dark:text-primary-400/70">
                Encrypt with AES-256
              </p>
            </div>
          </div>
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
                {PERMISSION_ROWS.map(({ key, icon: Icon, label, description }) => (
                  <label
                    key={key}
                    className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-dark-surface-alt transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary-50 dark:bg-primary-900/20 shrink-0">
                        <Icon className="w-3.5 h-3.5 text-primary-500 dark:text-primary-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-dark-text">
                          {label}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-dark-text-muted">
                          {description}
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={permissions[key]}
                      onChange={() => togglePermission(key)}
                      className="accent-primary-500 w-4 h-4 rounded shrink-0"
                    />
                  </label>
                ))}
              </div>

              <InfoCallout icon={AlertTriangle} title="Viewer compatibility" accent="warning">
                Permission restrictions are enforced by Adobe Acrobat/Reader. Other viewers such as
                macOS Preview and Chrome may ignore them and allow all operations regardless.
              </InfoCallout>
            </>
          )}
        </>
      )}

      {/* Panel: Remove Password (encrypted PDF) */}
      {pdfState === "encrypted" && (
        <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border divide-y divide-slate-100 dark:divide-dark-border">
          <div className="flex items-center gap-3 px-4 py-3 bg-primary-50 dark:bg-primary-900/20 rounded-t-xl">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary-100 dark:bg-primary-900/40">
              <LockOpen className="w-4 h-4 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-primary-800 dark:text-primary-300">
                Remove Password
              </p>
              <p className="text-xs text-primary-600/80 dark:text-primary-400/70">
                Decrypt and save an unlocked copy
              </p>
            </div>
          </div>
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
        <ActionButton
          onClick={pdfState === "unencrypted" ? handleAddPassword : handleRemovePassword}
          processing={processing}
          disabled={pdfState === "unencrypted" ? !canSubmitAdd : !canSubmitRemove}
          label={
            pdfState === "unencrypted" ? "Protect PDF & Download" : "Remove Password & Download"
          }
          processingLabel={pdfState === "unencrypted" ? "Protecting…" : "Unlocking…"}
        />
      )}

      {/* Success */}
      {success && (
        <InfoCallout icon={CheckCircle2} accent="security">
          {pdfState === "unencrypted"
            ? "Password added successfully. The protected PDF has been downloaded."
            : "Password removed successfully. The unlocked PDF has been downloaded."}
        </InfoCallout>
      )}

      {/* Error */}
      {error && <AlertBox message={error} />}
    </div>
  );
}
