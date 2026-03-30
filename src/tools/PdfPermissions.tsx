/**
 * PDF Permissions tool.
 *
 * Encrypts a PDF with a password while restricting specific operations
 * (printing, copying, modifying, annotating, filling forms). Uses the same
 * AES-256 encryption pipeline as the PDF Password tool but exposes the
 * PDF /P permissions bitmask through a friendly checkbox UI.
 *
 * Permission bit values per PDF spec §7.6.3.2 Table 22:
 *   Bit 3  (0x004): Print (low quality)
 *   Bit 4  (0x008): Modify content
 *   Bit 5  (0x010): Copy / extract text
 *   Bit 6  (0x020): Add / modify annotations
 *   Bit 9  (0x100): Fill form fields
 *   Bit 12 (0x800): Print (high quality)
 */

import { useState, useCallback } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { protectPdf } from "../utils/pdf-security.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";

// PDF permission bit masks
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
  // Start with all permissions granted (ALL_PERMS = -4 = 0xFFFFFFFC)
  let mask = -4;
  if (!p.print) mask &= ~PERM_PRINT;
  if (!p.printHighQuality) mask &= ~PERM_PRINT_HQ;
  if (!p.modify) mask &= ~PERM_MODIFY;
  if (!p.copy) mask &= ~PERM_COPY;
  if (!p.annotate) mask &= ~PERM_ANNOTATE;
  if (!p.fillForms) mask &= ~PERM_FILL_FORMS;
  return mask;
}

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

const PERMISSION_ROWS: {
  key: keyof Permissions;
  label: string;
  description: string;
}[] = [
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

export default function PdfPermissions() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [permissions, setPermissions] = useState<Permissions>({
    print: true,
    printHighQuality: true,
    modify: false,
    copy: false,
    annotate: false,
    fillForms: true,
  });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleFile = useCallback((files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setDone(false);
    setError(null);
    setPassword("");
    setConfirmPassword("");
  }, []);

  const togglePermission = useCallback((key: keyof Permissions) => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleApply = useCallback(async () => {
    if (!file) return;
    if (!password) {
      setError("Please enter a password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setProcessing(true);
    setError(null);
    setDone(false);
    try {
      const permMask = buildPermissionsMask(permissions);
      const bytes = await protectPdf(file, password, undefined, permMask);
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(bytes, `${baseName}_protected.pdf`);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply permissions.");
    } finally {
      setProcessing(false);
    }
  }, [file, password, confirmPassword, permissions]);

  const passwordsMatch = password === confirmPassword;

  return (
    <div className="space-y-6">
      {!file ? (
        <FileDropZone
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Set a password and control what recipients can do with the PDF"
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-dark-text-muted">
              <span className="font-medium">{file.name}</span> — {formatFileSize(file.size)}
            </p>
            <button
              onClick={() => {
                setFile(null);
                setDone(false);
                setPassword("");
                setConfirmPassword("");
              }}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              Change file
            </button>
          </div>

          {/* Password fields */}
          <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border divide-y divide-slate-100 dark:divide-dark-border">
            <div className="p-4 space-y-2">
              <label
                htmlFor="perm-password"
                className="block text-sm font-medium text-slate-700 dark:text-dark-text"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="perm-password"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="new-password"
                  className="w-full px-3 py-2 pr-10 rounded-lg border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-bg text-sm text-slate-800 dark:text-dark-text placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-dark-text transition-colors"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <IconEyeOff /> : <IconEyeOpen />}
                </button>
              </div>
            </div>
            <div className="p-4 space-y-2">
              <label
                htmlFor="perm-confirm"
                className="block text-sm font-medium text-slate-700 dark:text-dark-text"
              >
                Confirm password
                {confirmPassword && !passwordsMatch && (
                  <span className="text-red-500 ml-2 font-normal text-xs">
                    Passwords do not match
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  id="perm-confirm"
                  type={showConfirmPw ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  className="w-full px-3 py-2 pr-10 rounded-lg border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-bg text-sm text-slate-800 dark:text-dark-text placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPw((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-dark-text transition-colors"
                  aria-label={showConfirmPw ? "Hide password" : "Show password"}
                >
                  {showConfirmPw ? <IconEyeOff /> : <IconEyeOpen />}
                </button>
              </div>
            </div>
          </div>

          {/* Permissions */}
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
                  <p className="text-sm font-medium text-slate-700 dark:text-dark-text">{label}</p>
                  <p className="text-xs text-slate-400 dark:text-dark-text-muted">{description}</p>
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
            <svg
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Permission restrictions are enforced by Adobe Acrobat/Reader. Other viewers such as
              macOS Preview and Chrome may ignore them and allow all operations regardless.
            </p>
          </div>

          <button
            type="button"
            onClick={handleApply}
            disabled={!password || !passwordsMatch || processing}
            className="w-full bg-primary-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? "Protecting…" : "Apply Permissions & Download"}
          </button>

          {done && (
            <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                PDF protected with permissions applied. The file has been downloaded.
              </p>
            </div>
          )}
        </>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}
    </div>
  );
}
