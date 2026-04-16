/**
 * Digital Signature tool.
 *
 * Allows users to digitally sign a PDF with a cryptographic certificate.
 * Supports uploading a PKCS#12 (.p12/.pfx) certificate file or generating
 * a self-signed certificate for personal use. The signed PDF embeds a
 * PKCS#7 detached signature that is verifiable by PDF readers.
 *
 * All processing happens entirely in the browser — no files are uploaded.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Award,
  BadgeCheck,
  Building2,
  Calendar,
  Clock,
  Eye,
  EyeOff,
  FileKey2,
  Globe,
  Hash,
  KeyRound,
  Lock,
  Mail,
  MapPin,
  MessageSquareText,
  ShieldCheck,
  ShieldQuestion,
  Upload,
  User,
} from "lucide-react";
import { ActionButton } from "../components/ActionButton.tsx";
import { AlertBox } from "../components/AlertBox.tsx";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { FileInfoBar } from "../components/FileInfoBar.tsx";
import { categoryAccent, categoryGlow } from "../config/theme.ts";
import { downloadPdf, formatFileSize } from "../utils/file-helpers.ts";
import {
  type CertificateInfo,
  type ExistingSignature,
  detectSignatures,
  generateSelfSignedCert,
  parsePkcs12,
  signPdf,
} from "../utils/pdf-signer.ts";
import type forge from "node-forge";

type CertSource = "upload" | "generate";

/** Map raw PDF signature filter/subFilter to a user-friendly label. */
function formatSignatureStandard(filter: string, subFilter: string): string {
  const subFilterMap: Record<string, string> = {
    "adbe.pkcs7.detached": "PKCS#7 Detached Signature",
    "adbe.pkcs7.sha1": "PKCS#7 SHA-1 Signature",
    "adbe.x509.rsa_sha1": "X.509 RSA SHA-1",
    "ETSI.CAdES.detached": "CAdES Advanced Signature",
    "ETSI.RFC3161": "RFC 3161 Timestamp",
  };

  const filterMap: Record<string, string> = {
    "Adobe.PPKLite": "Adobe Standard",
    "Adobe.PPKMS": "Adobe Windows Crypto",
    "Entrust.PPKEF": "Entrust",
  };

  const friendlyType = subFilterMap[subFilter] ?? subFilter;
  const friendlyProvider = filterMap[filter] ?? filter;

  if (friendlyType && friendlyProvider) return `${friendlyType} (${friendlyProvider})`;
  return friendlyType || friendlyProvider || "Unknown";
}

/**
 * Digital Signature tool component.
 *
 * Workflow:
 * 1. User drops a PDF — existing signatures are auto-detected and displayed.
 * 2. User provides a certificate (upload .p12/.pfx or generate self-signed).
 * 3. Optionally fills in reason, location, and contact metadata.
 * 4. Signs the PDF and downloads the result.
 */
export default function DigitalSignature() {
  // PDF state
  const [file, setFile] = useState<File | null>(null);
  const [existingSignatures, setExistingSignatures] = useState<ExistingSignature[]>([]);
  const [detectingSignatures, setDetectingSignatures] = useState(false);

  // Certificate state
  const [certSource, setCertSource] = useState<CertSource>("upload");
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [commonName, setCommonName] = useState("");

  // Parsed certificate
  const [certInfo, setCertInfo] = useState<CertificateInfo | null>(null);
  const [privateKey, setPrivateKey] = useState<forge.pki.PrivateKey | null>(null);
  const [certificate, setCertificate] = useState<forge.pki.Certificate | null>(null);
  const [certChain, setCertChain] = useState<forge.pki.Certificate[]>([]);

  // Signature metadata
  const [reason, setReason] = useState("");
  const [location, setLocation] = useState("");
  const [contactInfo, setContactInfo] = useState("");

  // Processing state
  const [processing, setProcessing] = useState(false);
  const [certLoading, setCertLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [certError, setCertError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleFile = useCallback((files: File[]) => {
    const pdf = files[0];
    if (!pdf) return;
    setFile(pdf);
    setExistingSignatures([]);
    setError(null);
    setSuccess(false);
  }, []);

  // Detect existing signatures when a file is loaded
  useEffect(() => {
    if (!file) return;
    const currentFile = file;
    let cancelled = false;

    async function detect() {
      setDetectingSignatures(true);
      try {
        const sigs = await detectSignatures(currentFile);
        if (!cancelled) setExistingSignatures(sigs);
      } catch {
        // Detection failure is non-critical — just skip
      } finally {
        if (!cancelled) setDetectingSignatures(false);
      }
    }

    void detect();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const resetAll = useCallback(() => {
    setFile(null);
    setExistingSignatures([]);
    setCertFile(null);
    setCertPassword("");
    setCertInfo(null);
    setPrivateKey(null);
    setCertificate(null);
    setCertChain([]);
    setCommonName("");
    setReason("");
    setLocation("");
    setContactInfo("");
    setError(null);
    setCertError(null);
    setSuccess(false);
  }, []);

  const handleCertFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      setCertFile(f);
      setCertInfo(null);
      setCertError(null);
      setPrivateKey(null);
      setCertificate(null);
      setCertChain([]);

      // Try to parse immediately if password is provided
      if (certPassword) {
        setCertLoading(true);
        try {
          const bytes = await f.arrayBuffer();
          const result = parsePkcs12(bytes, certPassword);
          setPrivateKey(result.key);
          setCertificate(result.cert);
          setCertChain(result.chain);
          setCertInfo(result.info);
        } catch (err) {
          setCertError(err instanceof Error ? err.message : "Failed to parse certificate.");
        } finally {
          setCertLoading(false);
        }
      }
    },
    [certPassword],
  );

  const handleLoadCert = useCallback(async () => {
    if (!certFile) return;
    setCertLoading(true);
    setCertError(null);
    setCertInfo(null);
    try {
      const bytes = await certFile.arrayBuffer();
      const result = parsePkcs12(bytes, certPassword);
      setPrivateKey(result.key);
      setCertificate(result.cert);
      setCertChain(result.chain);
      setCertInfo(result.info);
    } catch (err) {
      setCertError(
        err instanceof Error ? err.message : "Failed to parse certificate. Check the password.",
      );
    } finally {
      setCertLoading(false);
    }
  }, [certFile, certPassword]);

  const handleGenerateCert = useCallback(() => {
    if (!commonName.trim()) {
      setCertError("Please enter your name for the certificate.");
      return;
    }
    setCertLoading(true);
    setCertError(null);
    setCertInfo(null);

    // Use setTimeout to avoid blocking the UI during key generation
    setTimeout(() => {
      try {
        const result = generateSelfSignedCert(commonName.trim());
        setPrivateKey(result.key);
        setCertificate(result.cert);
        setCertChain([]);
        setCertInfo(result.info);
      } catch (err) {
        setCertError(err instanceof Error ? err.message : "Failed to generate certificate.");
      } finally {
        setCertLoading(false);
      }
    }, 50);
  }, [commonName]);

  const handleSign = useCallback(async () => {
    if (!file || !privateKey || !certificate) return;
    setProcessing(true);
    setError(null);
    setSuccess(false);
    try {
      const data = await signPdf(file, privateKey, certificate, certChain, {
        reason: reason || undefined,
        location: location || undefined,
        contactInfo: contactInfo || undefined,
      });
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadPdf(data, `${baseName}_signed.pdf`);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign PDF.");
    } finally {
      setProcessing(false);
    }
  }, [file, privateKey, certificate, certChain, reason, location, contactInfo]);

  const canSign = file && privateKey && certificate;

  return (
    <div className="space-y-6">
      {/* Step 1: PDF file */}
      {!file ? (
        <FileDropZone
          glowColor={categoryGlow.security}
          iconColor={categoryAccent.security}
          accept=".pdf,application/pdf"
          onFiles={handleFile}
          label="Drop a PDF file here"
          hint="Digitally sign with a cryptographic certificate"
        />
      ) : (
        <>
          <FileInfoBar
            fileName={file.name}
            details={formatFileSize(file.size)}
            onChangeFile={resetAll}
          />

          {/* Existing signatures */}
          {detectingSignatures && (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-dark-text-muted py-2">
              <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 dark:border-dark-border dark:border-t-dark-text-muted rounded-full animate-spin" />
              Checking for existing signatures...
            </div>
          )}

          {!detectingSignatures && existingSignatures.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-dark-text flex items-center gap-2">
                <BadgeCheck className="w-4 h-4 text-amber-500" />
                Existing Signatures ({existingSignatures.length})
              </h3>
              {existingSignatures.map((sig, idx) => (
                <div
                  key={`sig-${sig.signerName || "unknown"}-${sig.date || "nodate"}-${sig.filter}-${sig.subFilter}`}
                  className="bg-amber-50/60 dark:bg-amber-900/10 rounded-xl border border-amber-200 dark:border-amber-700/40 p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                      Signature {existingSignatures.length > 1 ? `#${idx + 1}` : ""}
                      {sig.signerName ? ` — ${sig.signerName}` : ""}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                    {sig.signerName && (
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-amber-400 dark:text-amber-500 shrink-0" />
                        <span className="text-slate-500 dark:text-dark-text-muted">Signer:</span>
                        <span className="text-slate-700 dark:text-dark-text font-medium">
                          {sig.signerName}
                        </span>
                      </div>
                    )}
                    {sig.date && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-400 dark:text-amber-500 shrink-0" />
                        <span className="text-slate-500 dark:text-dark-text-muted">Date:</span>
                        <span className="text-slate-700 dark:text-dark-text">{sig.date}</span>
                      </div>
                    )}
                    {sig.reason && (
                      <div className="flex items-center gap-1.5">
                        <MessageSquareText className="w-3.5 h-3.5 text-amber-400 dark:text-amber-500 shrink-0" />
                        <span className="text-slate-500 dark:text-dark-text-muted">Reason:</span>
                        <span className="text-slate-700 dark:text-dark-text">{sig.reason}</span>
                      </div>
                    )}
                    {sig.location && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-amber-400 dark:text-amber-500 shrink-0" />
                        <span className="text-slate-500 dark:text-dark-text-muted">Location:</span>
                        <span className="text-slate-700 dark:text-dark-text">{sig.location}</span>
                      </div>
                    )}
                    {sig.contactInfo && (
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-amber-400 dark:text-amber-500 shrink-0" />
                        <span className="text-slate-500 dark:text-dark-text-muted">Contact:</span>
                        <span className="text-slate-700 dark:text-dark-text">
                          {sig.contactInfo}
                        </span>
                      </div>
                    )}
                    {(sig.filter || sig.subFilter) && (
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-400 dark:text-amber-500 shrink-0" />
                        <span className="text-slate-500 dark:text-dark-text-muted">Standard:</span>
                        <span className="text-slate-700 dark:text-dark-text">
                          {formatSignatureStandard(sig.filter, sig.subFilter)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Certificate details */}
                  {sig.certDetails && (
                    <div className="mt-3 pt-3 border-t border-amber-200/60 dark:border-amber-700/30">
                      <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1.5">
                        Certificate Details
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-amber-400 dark:text-amber-500 shrink-0" />
                          <span className="text-slate-500 dark:text-dark-text-muted">Name:</span>
                          <span className="text-slate-700 dark:text-dark-text font-medium">
                            {sig.certDetails.commonName}
                          </span>
                        </div>
                        {sig.certDetails.organisation && (
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-amber-400 dark:text-amber-500 shrink-0" />
                            <span className="text-slate-500 dark:text-dark-text-muted">Org:</span>
                            <span className="text-slate-700 dark:text-dark-text">
                              {sig.certDetails.organisation}
                            </span>
                          </div>
                        )}
                        {sig.certDetails.email && (
                          <div className="flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-amber-400 dark:text-amber-500 shrink-0" />
                            <span className="text-slate-500 dark:text-dark-text-muted">Email:</span>
                            <span className="text-slate-700 dark:text-dark-text">
                              {sig.certDetails.email}
                            </span>
                          </div>
                        )}
                        {(sig.certDetails.country ||
                          sig.certDetails.state ||
                          sig.certDetails.locality) && (
                          <div className="flex items-center gap-1.5">
                            <Globe className="w-3.5 h-3.5 text-amber-400 dark:text-amber-500 shrink-0" />
                            <span className="text-slate-500 dark:text-dark-text-muted">
                              Location:
                            </span>
                            <span className="text-slate-700 dark:text-dark-text">
                              {[
                                sig.certDetails.locality,
                                sig.certDetails.state,
                                sig.certDetails.country,
                              ]
                                .filter(Boolean)
                                .join(", ")}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <ShieldQuestion className="w-3.5 h-3.5 text-amber-400 dark:text-amber-500 shrink-0" />
                          <span className="text-slate-500 dark:text-dark-text-muted">Issuer:</span>
                          <span className="text-slate-700 dark:text-dark-text">
                            {sig.certDetails.issuer}
                            {sig.certDetails.issuerOrganisation &&
                              sig.certDetails.issuerOrganisation !== sig.certDetails.organisation &&
                              ` (${sig.certDetails.issuerOrganisation})`}
                          </span>
                          {sig.certDetails.isSelfSigned && (
                            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                              Self-Signed
                            </span>
                          )}
                        </div>
                        {sig.certDetails.serialNumber && (
                          <div className="flex items-center gap-1.5">
                            <Hash className="w-3.5 h-3.5 text-amber-400 dark:text-amber-500 shrink-0" />
                            <span className="text-slate-500 dark:text-dark-text-muted">
                              Serial:
                            </span>
                            <span className="text-slate-700 dark:text-dark-text font-mono text-xs">
                              {sig.certDetails.serialNumber}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-amber-400 dark:text-amber-500 shrink-0" />
                          <span className="text-slate-500 dark:text-dark-text-muted">Valid:</span>
                          <span className="text-slate-700 dark:text-dark-text">
                            {sig.certDetails.validFrom} – {sig.certDetails.validTo}
                          </span>
                        </div>
                        {sig.certDetails.signatureAlgorithm && (
                          <div className="flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5 text-amber-400 dark:text-amber-500 shrink-0" />
                            <span className="text-slate-500 dark:text-dark-text-muted">
                              Algorithm:
                            </span>
                            <span className="text-slate-700 dark:text-dark-text">
                              {sig.certDetails.signatureAlgorithm}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Warning if already signed */}
          {!detectingSignatures && existingSignatures.length > 0 && (
            <div className="flex gap-3 rounded-xl border-2 border-amber-300 dark:border-amber-600 bg-amber-50/80 dark:bg-amber-900/20 p-4">
              <div className="shrink-0 mt-0.5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-800/40 flex items-center justify-center">
                  <ShieldCheck className="w-4.5 h-4.5 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                  This PDF is already signed
                </p>
                <p className="text-sm text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                  Adding another signature will invalidate the existing{" "}
                  {existingSignatures.length === 1 ? "signature" : "signatures"}. Use a different
                  file if you want to preserve {existingSignatures.length === 1 ? "it" : "them"}.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Certificate source */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-dark-text flex items-center gap-2">
              <FileKey2 className="w-4 h-4 text-amber-500" />
              Certificate
            </h3>

            {/* Tabs */}
            <div className="flex rounded-lg border border-slate-200 dark:border-dark-border overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  setCertSource("upload");
                  setCertFile(null);
                  setCertPassword("");
                  setShowPassword(false);
                  setCertInfo(null);
                  setCertError(null);
                  setPrivateKey(null);
                  setCertificate(null);
                  setCertChain([]);
                }}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  certSource === "upload"
                    ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
                    : "bg-white dark:bg-dark-surface text-slate-500 dark:text-dark-text-muted hover:bg-slate-50 dark:hover:bg-dark-surface-alt"
                }`}
              >
                <Upload className="w-4 h-4" />
                Upload Certificate
              </button>
              <button
                type="button"
                onClick={() => {
                  setCertSource("generate");
                  setCertFile(null);
                  setCertPassword("");
                  setShowPassword(false);
                  setCommonName("");
                  setCertInfo(null);
                  setCertError(null);
                  setPrivateKey(null);
                  setCertificate(null);
                  setCertChain([]);
                }}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-l border-slate-200 dark:border-dark-border ${
                  certSource === "generate"
                    ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
                    : "bg-white dark:bg-dark-surface text-slate-500 dark:text-dark-text-muted hover:bg-slate-50 dark:hover:bg-dark-surface-alt"
                }`}
              >
                <KeyRound className="w-4 h-4" />
                Self-Signed
              </button>
            </div>

            {/* Upload form */}
            {certSource === "upload" && (
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border p-4 space-y-4">
                <div>
                  <label
                    htmlFor="cert-file"
                    className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5"
                  >
                    Certificate file (.p12 / .pfx)
                  </label>
                  <input
                    id="cert-file"
                    type="file"
                    accept=".p12,.pfx,application/x-pkcs12"
                    onChange={handleCertFile}
                    className="block w-full text-sm text-slate-600 dark:text-dark-text-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border file:border-slate-200 dark:file:border-dark-border file:text-sm file:font-medium file:bg-slate-50 dark:file:bg-dark-surface-alt file:text-slate-700 dark:file:text-dark-text hover:file:bg-slate-100 dark:hover:file:bg-dark-border file:transition-colors file:cursor-pointer"
                  />
                </div>

                <div>
                  <label
                    htmlFor="cert-password"
                    className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5"
                  >
                    Certificate password
                  </label>
                  <div className="relative">
                    <input
                      id="cert-password"
                      type={showPassword ? "text" : "password"}
                      value={certPassword}
                      onChange={(e) => setCertPassword(e.target.value)}
                      placeholder="Enter certificate password"
                      className="w-full px-3 py-2 pr-10 rounded-lg border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-bg text-sm text-slate-800 dark:text-dark-text placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-transparent transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-dark-text-muted hover:text-slate-600 dark:hover:text-dark-text transition-colors"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {certFile && !certInfo && (
                  <button
                    type="button"
                    onClick={handleLoadCert}
                    disabled={certLoading || !certPassword}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {certLoading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" />
                    )}
                    {certLoading ? "Loading..." : "Load Certificate"}
                  </button>
                )}
              </div>
            )}

            {/* Generate form */}
            {certSource === "generate" && (
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border p-4 space-y-4">
                <AlertBox
                  variant="info"
                  message="Self-signed certificates are suitable for personal use. Recipients will see the signature is not from a trusted authority."
                />

                <div>
                  <label
                    htmlFor="common-name"
                    className="block text-sm font-medium text-slate-700 dark:text-dark-text mb-1.5"
                  >
                    Your name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-dark-text-muted" />
                    <input
                      id="common-name"
                      type="text"
                      value={commonName}
                      onChange={(e) => setCommonName(e.target.value)}
                      placeholder="e.g. Jane Doe"
                      className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-bg text-sm text-slate-800 dark:text-dark-text placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                {!certInfo && (
                  <button
                    type="button"
                    onClick={handleGenerateCert}
                    disabled={certLoading || !commonName.trim()}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {certLoading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <KeyRound className="w-4 h-4" />
                    )}
                    {certLoading ? "Generating..." : "Generate Certificate"}
                  </button>
                )}
              </div>
            )}

            {certError && <AlertBox variant="error" message={certError} />}

            {/* Certificate info display */}
            {certInfo && (
              <div className="bg-emerald-50/60 dark:bg-emerald-900/10 rounded-xl border border-emerald-200 dark:border-emerald-700/40 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Award className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    Certificate Loaded
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-slate-500 dark:text-dark-text-muted">Name: </span>
                    <span className="text-slate-700 dark:text-dark-text font-medium">
                      {certInfo.commonName}
                    </span>
                  </div>
                  {certInfo.organisation && (
                    <div>
                      <span className="text-slate-500 dark:text-dark-text-muted">Org: </span>
                      <span className="text-slate-700 dark:text-dark-text">
                        {certInfo.organisation}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-500 dark:text-dark-text-muted">Issuer: </span>
                    <span className="text-slate-700 dark:text-dark-text">{certInfo.issuer}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-dark-text-muted">Valid: </span>
                    <span className="text-slate-700 dark:text-dark-text">
                      {certInfo.validFrom.toLocaleDateString()} –{" "}
                      {certInfo.validTo.toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Step 3: Signature details (optional) */}
          {certInfo && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-dark-text flex items-center gap-2">
                <MessageSquareText className="w-4 h-4 text-amber-500" />
                Signature Details
                <span className="text-xs font-normal text-slate-400 dark:text-dark-text-muted">
                  (optional)
                </span>
              </h3>

              <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border divide-y divide-slate-100 dark:divide-dark-border">
                <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-2">
                  <label
                    htmlFor="sig-reason"
                    className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-dark-text sm:w-28 shrink-0"
                  >
                    <MessageSquareText className="w-4 h-4 text-amber-500" />
                    Reason
                  </label>
                  <input
                    id="sig-reason"
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. I approve this document"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-bg text-sm text-slate-800 dark:text-dark-text placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-transparent transition-all"
                  />
                </div>
                <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-2">
                  <label
                    htmlFor="sig-location"
                    className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-dark-text sm:w-28 shrink-0"
                  >
                    <MapPin className="w-4 h-4 text-amber-500" />
                    Location
                  </label>
                  <input
                    id="sig-location"
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. New York, NY"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-bg text-sm text-slate-800 dark:text-dark-text placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-transparent transition-all"
                  />
                </div>
                <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-2">
                  <label
                    htmlFor="sig-contact"
                    className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-dark-text sm:w-28 shrink-0"
                  >
                    <User className="w-4 h-4 text-amber-500" />
                    Contact
                  </label>
                  <input
                    id="sig-contact"
                    type="text"
                    value={contactInfo}
                    onChange={(e) => setContactInfo(e.target.value)}
                    placeholder="e.g. jane@example.com"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-bg text-sm text-slate-800 dark:text-dark-text placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-transparent transition-all"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Sign button */}
          <ActionButton
            onClick={handleSign}
            processing={processing}
            disabled={!canSign}
            label="Sign & Download PDF"
            processingLabel="Signing..."
            color="bg-amber-600 hover:bg-amber-700"
          />

          {success && (
            <AlertBox variant="success" message="PDF signed and downloaded successfully." />
          )}
        </>
      )}

      {error && <AlertBox variant="error" message={error} />}
    </div>
  );
}
