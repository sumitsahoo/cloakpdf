/**
 * PDF digital signing utility.
 *
 * Creates a PKCS#7 detached signature and embeds it into a PDF's
 * signature dictionary. Supports both uploaded PKCS#12 (.p12/.pfx)
 * certificates and self-signed certificate generation.
 *
 * Runs entirely in the browser using node-forge for cryptographic
 * operations and @pdfme/pdf-lib for PDF structure manipulation.
 */

import {
  PDFDocument,
  PDFDict,
  PDFArray,
  PDFName,
  PDFHexString,
  PDFRef,
  PDFString,
  PDFNumber,
} from "@pdfme/pdf-lib";
import forge from "node-forge";

/** Options passed to the signing function. */
export interface SigningOptions {
  /** Reason for signing (appears in signature details). */
  reason?: string;
  /** Location of signing (appears in signature details). */
  location?: string;
  /** Contact information (appears in signature details). */
  contactInfo?: string;
}

/** Result of parsing a PKCS#12 file. */
export interface CertificateInfo {
  /** Common Name from the certificate subject. */
  commonName: string;
  /** Organisation from the certificate subject. */
  organisation: string;
  /** Certificate validity start. */
  validFrom: Date;
  /** Certificate validity end. */
  validTo: Date;
  /** Issuer Common Name. */
  issuer: string;
}

/** Details extracted from an existing PDF digital signature. */
export interface ExistingSignature {
  /** Signer name from the certificate, or the /Name field. */
  signerName: string;
  /** Reason for signing. */
  reason: string;
  /** Location of signing. */
  location: string;
  /** Contact information. */
  contactInfo: string;
  /** Signing date. */
  date: string;
  /** Signature filter (e.g. Adobe.PPKLite). */
  filter: string;
  /** Sub-filter (e.g. adbe.pkcs7.detached). */
  subFilter: string;
  /** Certificate details extracted from the PKCS#7 signature, if parseable. */
  certDetails?: {
    commonName: string;
    organisation: string;
    email: string;
    country: string;
    state: string;
    locality: string;
    issuer: string;
    issuerOrganisation: string;
    serialNumber: string;
    validFrom: string;
    validTo: string;
    signatureAlgorithm: string;
    isSelfSigned: boolean;
  };
}

/**
 * Helper to read a PDF string value from a dictionary entry.
 */
function readStringValue(dict: PDFDict, key: string): string {
  const val = dict.lookup(PDFName.of(key));
  if (!val) return "";
  if (val instanceof PDFString) return val.decodeText();
  if (val instanceof PDFHexString) return val.decodeText();
  return val.toString();
}

/**
 * Parse a PDF date string like "D:20260416120000+05'30'" into a readable format.
 */
function parsePdfDate(dateStr: string): string {
  if (!dateStr) return "";
  // Remove the "D:" prefix and quotes
  const s = dateStr.replace(/^D:/, "").replace(/'/g, "");
  // Format: YYYYMMDDHHmmSS[+/-]HHMM
  if (s.length >= 14) {
    const year = s.slice(0, 4);
    const month = s.slice(4, 6);
    const day = s.slice(6, 8);
    const hour = s.slice(8, 10);
    const min = s.slice(10, 12);
    const sec = s.slice(12, 14);
    const tz = s.slice(14) || "Z";
    try {
      const date = new Date(
        `${year}-${month}-${day}T${hour}:${min}:${sec}${tz.replace(/(\d{2})(\d{2})$/, "$1:$2")}`,
      );
      if (!Number.isNaN(date.getTime())) return date.toLocaleString();
    } catch {
      // fall through
    }
    return `${year}-${month}-${day} ${hour}:${min}:${sec}`;
  }
  return dateStr;
}

/**
 * Map a forge signature algorithm OID to a human-readable name.
 */
function getSignatureAlgorithmName(cert: forge.pki.Certificate): string {
  const oid = cert.siginfo?.algorithmOid ?? "";
  const oidMap: Record<string, string> = {
    "1.2.840.113549.1.1.11": "SHA-256 with RSA",
    "1.2.840.113549.1.1.12": "SHA-384 with RSA",
    "1.2.840.113549.1.1.13": "SHA-512 with RSA",
    "1.2.840.113549.1.1.5": "SHA-1 with RSA",
    "1.2.840.113549.1.1.4": "MD5 with RSA",
    "1.2.840.10045.4.3.2": "ECDSA with SHA-256",
    "1.2.840.10045.4.3.3": "ECDSA with SHA-384",
  };
  return oidMap[oid] ?? (oid || "Unknown");
}

/**
 * Extract detailed certificate information from a forge certificate.
 */
function extractCertDetails(cert: forge.pki.Certificate): ExistingSignature["certDetails"] {
  const subject = cert.subject;
  const issuer = cert.issuer;

  const subjectCN = subject.getField("CN")?.value ?? "Unknown";
  const issuerCN = issuer.getField("CN")?.value ?? "Unknown";

  return {
    commonName: subjectCN,
    organisation: subject.getField("O")?.value ?? "",
    email: subject.getField("E")?.value ?? subject.getField("emailAddress")?.value ?? "",
    country: subject.getField("C")?.value ?? "",
    state: subject.getField("ST")?.value ?? "",
    locality: subject.getField("L")?.value ?? "",
    issuer: issuerCN,
    issuerOrganisation: issuer.getField("O")?.value ?? "",
    serialNumber:
      cert.serialNumber
        ?.match(/.{1,2}/g)
        ?.join(":")
        .toUpperCase() ?? "",
    validFrom: cert.validity.notBefore.toLocaleDateString(),
    validTo: cert.validity.notAfter.toLocaleDateString(),
    signatureAlgorithm: getSignatureAlgorithmName(cert),
    isSelfSigned:
      subjectCN === issuerCN && subject.getField("O")?.value === issuer.getField("O")?.value,
  };
}

/**
 * Detect and extract existing digital signatures from a PDF file.
 */
export async function detectSignatures(file: File): Promise<ExistingSignature[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfBytes = new Uint8Array(arrayBuffer);
  const pdf = await PDFDocument.load(arrayBuffer, {
    updateMetadata: false,
    throwOnInvalidObject: false,
  });

  const signatures: ExistingSignature[] = [];
  const catalog = pdf.catalog;
  const acroForm = catalog.lookup(PDFName.of("AcroForm"));
  if (!acroForm || !(acroForm instanceof PDFDict)) return signatures;

  const fields = acroForm.lookup(PDFName.of("Fields"));
  if (!fields || !(fields instanceof PDFArray)) return signatures;

  for (let i = 0; i < fields.size(); i++) {
    const fieldRef = fields.get(i);
    const field = fieldRef instanceof PDFRef ? pdf.context.lookup(fieldRef) : fieldRef;
    if (!(field instanceof PDFDict)) continue;

    const ft = field.lookup(PDFName.of("FT"));
    if (!ft || ft.toString() !== "/Sig") continue;

    const sigVal = field.lookup(PDFName.of("V"));
    if (!sigVal) continue;

    const sigDict = sigVal instanceof PDFRef ? (pdf.context.lookup(sigVal) as PDFDict) : sigVal;
    if (!(sigDict instanceof PDFDict)) continue;

    const sig: ExistingSignature = {
      signerName: readStringValue(sigDict, "Name"),
      reason: readStringValue(sigDict, "Reason"),
      location: readStringValue(sigDict, "Location"),
      contactInfo: readStringValue(sigDict, "ContactInfo"),
      date: parsePdfDate(readStringValue(sigDict, "M")),
      filter: sigDict.lookup(PDFName.of("Filter"))?.toString().replace(/^\//, "") ?? "",
      subFilter: sigDict.lookup(PDFName.of("SubFilter"))?.toString().replace(/^\//, "") ?? "",
    };

    // Try to extract certificate details from the /Contents (PKCS#7 blob)
    const contentsVal = sigDict.lookup(PDFName.of("Contents"));
    if (contentsVal instanceof PDFHexString) {
      try {
        const hexStr = contentsVal.toString().replace(/[<>]/g, "");
        const derBytes = forge.util.hexToBytes(hexStr);
        const asn1 = forge.asn1.fromDer(derBytes);
        const p7 = forge.pkcs7.messageFromAsn1(asn1);

        const certs = (p7 as forge.pkcs7.PkcsSignedData).certificates;
        if (certs && certs.length > 0) {
          const cert = certs[0];
          sig.signerName = sig.signerName || cert.subject.getField("CN")?.value || "";
          sig.certDetails = extractCertDetails(cert);
        }
      } catch {
        // PKCS#7 parsing can fail for non-standard signatures — that's fine,
        // we still have the basic signature dictionary info.
      }
    } else {
      // Try raw bytes search for /Contents as raw hex in the PDF
      try {
        const byteRangeVal = sigDict.lookup(PDFName.of("ByteRange"));
        if (byteRangeVal instanceof PDFArray && byteRangeVal.size() === 4) {
          const br0 = (byteRangeVal.get(0) as PDFNumber).value();
          const br1 = (byteRangeVal.get(1) as PDFNumber).value();
          // The signature contents start at br0+br1 and end at br2
          const contentsStart = br0 + br1;
          // Find the < and > delimiters
          let hexStart = contentsStart;
          while (hexStart < pdfBytes.length && pdfBytes[hexStart] !== 0x3c) hexStart++;
          let hexEnd = hexStart + 1;
          while (hexEnd < pdfBytes.length && pdfBytes[hexEnd] !== 0x3e) hexEnd++;

          if (hexStart < pdfBytes.length && hexEnd < pdfBytes.length) {
            const rawHex = new TextDecoder()
              .decode(pdfBytes.slice(hexStart + 1, hexEnd))
              .replace(/\s/g, "")
              .replace(/0+$/, "");
            if (rawHex.length > 0) {
              const derBytes = forge.util.hexToBytes(rawHex);
              const asn1 = forge.asn1.fromDer(derBytes);
              const p7 = forge.pkcs7.messageFromAsn1(asn1);
              const certs = (p7 as forge.pkcs7.PkcsSignedData).certificates;
              if (certs && certs.length > 0) {
                const cert = certs[0];
                sig.signerName = sig.signerName || cert.subject.getField("CN")?.value || "";
                sig.certDetails = extractCertDetails(cert);
              }
            }
          }
        }
      } catch {
        // Fallback parsing failed — still return basic info
      }
    }

    signatures.push(sig);
  }

  return signatures;
}

/** Maximum byte length reserved for the PKCS#7 signature in the PDF. */
const SIGNATURE_MAX_LENGTH = 8192;

/**
 * Parse a PKCS#12 (.p12 / .pfx) file and return the private key,
 * certificate, and chain.
 */
export function parsePkcs12(
  p12Bytes: ArrayBuffer,
  password: string,
): {
  key: forge.pki.PrivateKey;
  cert: forge.pki.Certificate;
  chain: forge.pki.Certificate[];
  info: CertificateInfo;
} {
  const p12Der = forge.util.binary.raw.encode(new Uint8Array(p12Bytes));
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

  // Extract private key
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag =
    keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
  if (!keyBag?.key) throw new Error("No private key found in the certificate file.");

  // Extract certificate
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const allCerts = certBags[forge.pki.oids.certBag] ?? [];
  if (allCerts.length === 0) throw new Error("No certificate found in the certificate file.");

  const cert = allCerts[0].cert!;
  const chain = allCerts
    .slice(1)
    .filter((b) => b.cert)
    .map((b) => b.cert!);

  const subject = cert.subject;
  const issuer = cert.issuer;

  return {
    key: keyBag.key,
    cert,
    chain,
    info: {
      commonName: subject.getField("CN")?.value ?? "Unknown",
      organisation: subject.getField("O")?.value ?? "",
      validFrom: cert.validity.notBefore,
      validTo: cert.validity.notAfter,
      issuer: issuer.getField("CN")?.value ?? "Unknown",
    },
  };
}

/**
 * Generate a self-signed certificate for personal/testing use.
 */
export function generateSelfSignedCert(commonName: string): {
  key: forge.pki.PrivateKey;
  cert: forge.pki.Certificate;
  info: CertificateInfo;
} {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01" + forge.util.bytesToHex(forge.random.getBytesSync(8));
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);

  const attrs: forge.pki.CertificateField[] = [
    { name: "commonName", value: commonName },
    { name: "organizationName", value: "Self-Signed (CloakPDF)" },
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  cert.setExtensions([
    { name: "basicConstraints", cA: false },
    {
      name: "keyUsage",
      digitalSignature: true,
      nonRepudiation: true,
    },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    key: keys.privateKey,
    cert,
    info: {
      commonName,
      organisation: "Self-Signed (CloakPDF)",
      validFrom: cert.validity.notBefore,
      validTo: cert.validity.notAfter,
      issuer: commonName,
    },
  };
}

/**
 * Create a PKCS#7 detached signature over the given data.
 */
function createPkcs7Signature(
  data: Uint8Array,
  key: forge.pki.PrivateKey,
  cert: forge.pki.Certificate,
  chain: forge.pki.Certificate[] = [],
): Uint8Array {
  const p7 = forge.pkcs7.createSignedData();

  // Convert Uint8Array to a binary string for forge's buffer API
  p7.content = forge.util.createBuffer(forge.util.binary.raw.encode(data));
  p7.addCertificate(cert);
  for (const c of chain) p7.addCertificate(c);

  p7.addSigner({
    // @types/node-forge declares key as string but forge accepts PrivateKey at runtime
    key: key as unknown as string,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date().toISOString() },
    ],
  });

  p7.sign({ detached: true });

  const asn1 = p7.toAsn1();
  const derBuffer = forge.asn1.toDer(asn1);
  const derBinaryString = derBuffer.getBytes();
  const bytes = new Uint8Array(derBinaryString.length);
  for (let i = 0; i < derBinaryString.length; i++) {
    bytes[i] = derBinaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Digitally sign a PDF file with the given certificate and key.
 *
 * The process:
 * 1. Add a Signature dictionary with a hex placeholder for /Contents
 * 2. Save the PDF, recording the byte offsets of the placeholder
 * 3. Compute the hash over the PDF bytes (excluding the placeholder)
 * 4. Create a PKCS#7 detached signature
 * 5. Insert the signature into the placeholder
 */
export async function signPdf(
  file: File,
  key: forge.pki.PrivateKey,
  cert: forge.pki.Certificate,
  chain: forge.pki.Certificate[] = [],
  options: SigningOptions = {},
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer, { updateMetadata: false });

  const pages = pdf.getPages();
  if (pages.length === 0) throw new Error("PDF has no pages.");
  const page = pages[0];

  // Build the hex placeholder string for /Contents
  const placeholderHex = "0".repeat(SIGNATURE_MAX_LENGTH * 2);
  const contentsPlaceholder = PDFHexString.of(placeholderHex);

  // Create the signature dictionary
  const sigDict = pdf.context.obj({});
  sigDict.set(PDFName.of("Type"), PDFName.of("Sig"));
  sigDict.set(PDFName.of("Filter"), PDFName.of("Adobe.PPKLite"));
  sigDict.set(PDFName.of("SubFilter"), PDFName.of("adbe.pkcs7.detached"));
  sigDict.set(PDFName.of("Contents"), contentsPlaceholder);
  // ByteRange placeholder — use large numbers so the serialised array
  // `[0 9999999999 9999999999 9999999999]` reserves enough bytes for
  // the real values that will be patched in after the first save.
  const byteRangePlaceholder = pdf.context.obj([
    PDFNumber.of(0),
    PDFNumber.of(9999999999),
    PDFNumber.of(9999999999),
    PDFNumber.of(9999999999),
  ]);
  sigDict.set(PDFName.of("ByteRange"), byteRangePlaceholder);
  sigDict.set(PDFName.of("M"), PDFString.fromDate(new Date()));

  if (options.reason) {
    sigDict.set(PDFName.of("Reason"), PDFString.of(options.reason));
  }
  if (options.location) {
    sigDict.set(PDFName.of("Location"), PDFString.of(options.location));
  }
  if (options.contactInfo) {
    sigDict.set(PDFName.of("ContactInfo"), PDFString.of(options.contactInfo));
  }

  // Register the signature dict as an indirect object
  const sigDictRef = pdf.context.register(sigDict);

  // Create the signature field in AcroForm
  const fieldDict = pdf.context.obj({});
  fieldDict.set(PDFName.of("Type"), PDFName.of("Annot"));
  fieldDict.set(PDFName.of("Subtype"), PDFName.of("Widget"));
  fieldDict.set(PDFName.of("FT"), PDFName.of("Sig"));
  fieldDict.set(PDFName.of("T"), PDFString.of("CloakPDF-Signature"));
  fieldDict.set(PDFName.of("V"), sigDictRef);
  fieldDict.set(PDFName.of("F"), PDFNumber.of(132)); // Hidden + Print
  fieldDict.set(
    PDFName.of("Rect"),
    pdf.context.obj([PDFNumber.of(0), PDFNumber.of(0), PDFNumber.of(0), PDFNumber.of(0)]),
  );
  fieldDict.set(PDFName.of("P"), page.ref);

  const fieldRef = pdf.context.register(fieldDict);

  // Add to page annotations
  const pageDict = page.node;
  let annots = pageDict.lookup(PDFName.of("Annots")) as PDFArray | undefined;
  if (!annots) {
    annots = pdf.context.obj([]) as unknown as PDFArray;
    pageDict.set(PDFName.of("Annots"), annots);
  }
  annots.push(fieldRef);

  // Add/update AcroForm
  const catalog = pdf.catalog;
  let acroForm = catalog.lookup(PDFName.of("AcroForm")) as PDFDict | undefined;
  if (!acroForm) {
    acroForm = pdf.context.obj({}) as unknown as PDFDict;
    catalog.set(PDFName.of("AcroForm"), acroForm);
  }

  let fields = acroForm.lookup(PDFName.of("Fields")) as PDFArray | undefined;
  if (!fields) {
    fields = pdf.context.obj([]) as unknown as PDFArray;
    acroForm.set(PDFName.of("Fields"), fields);
  }
  fields.push(fieldRef);

  // Set SigFlags: SignaturesExist (1) | AppendOnly (2)
  acroForm.set(PDFName.of("SigFlags"), PDFNumber.of(3));

  // Save PDF to get bytes with placeholder
  const pdfBytes = await pdf.save({ useObjectStreams: false });

  // Find the /Contents placeholder in the saved bytes
  const contentsTag = findContentsPlaceholder(pdfBytes, placeholderHex);
  if (!contentsTag) {
    throw new Error("Could not locate signature placeholder in PDF output.");
  }

  const { start: contentsStart, end: contentsEnd } = contentsTag;

  // Calculate ByteRange
  const byteRange = [0, contentsStart, contentsEnd, pdfBytes.length - contentsEnd];

  // Update ByteRange in the PDF bytes
  updateByteRange(pdfBytes, byteRange);

  // Extract the bytes to sign (everything except the /Contents value)
  const signedData = new Uint8Array(byteRange[1] + byteRange[3]);
  signedData.set(pdfBytes.subarray(byteRange[0], byteRange[0] + byteRange[1]), 0);
  signedData.set(pdfBytes.subarray(byteRange[2], byteRange[2] + byteRange[3]), byteRange[1]);

  // Create PKCS#7 signature
  const signature = createPkcs7Signature(signedData, key, cert, chain);

  if (signature.length > SIGNATURE_MAX_LENGTH) {
    throw new Error("Signature exceeds maximum allocated size. Please report this issue.");
  }

  // Convert signature to hex and pad
  let sigHex = "";
  for (let i = 0; i < signature.length; i++) {
    sigHex += signature[i].toString(16).padStart(2, "0");
  }
  sigHex = sigHex.padEnd(SIGNATURE_MAX_LENGTH * 2, "0");

  // Write signature hex into the placeholder (inside the angle brackets)
  const result = new Uint8Array(pdfBytes);
  for (let i = 0; i < sigHex.length; i++) {
    result[contentsStart + 1 + i] = sigHex.charCodeAt(i);
  }

  return result;
}

/**
 * Locate the /Contents hex string placeholder in the PDF bytes.
 * Returns the byte offset of the opening `<` and closing `>`.
 */
function findContentsPlaceholder(
  pdfBytes: Uint8Array,
  placeholderHex: string,
): { start: number; end: number } | null {
  // Search for the hex string pattern: <0000...0000>
  const searchStr = `<${placeholderHex}>`;
  const searchBytes = new TextEncoder().encode(searchStr);

  // Search backwards from the end (signature dict is typically near the end)
  for (let i = pdfBytes.length - searchBytes.length; i >= 0; i--) {
    let found = true;
    for (let j = 0; j < searchBytes.length; j++) {
      if (pdfBytes[i + j] !== searchBytes[j]) {
        found = false;
        break;
      }
    }
    if (found) {
      return { start: i, end: i + searchBytes.length };
    }
  }

  return null;
}

/**
 * Find and update the /ByteRange placeholder in the PDF bytes.
 */
function updateByteRange(pdfBytes: Uint8Array, byteRange: number[]): void {
  // Find "/ByteRange" followed by an array
  const tag = new TextEncoder().encode("/ByteRange");
  let pos = -1;

  for (let i = pdfBytes.length - 1; i >= tag.length; i--) {
    let found = true;
    for (let j = 0; j < tag.length; j++) {
      if (pdfBytes[i - tag.length + 1 + j] !== tag[j]) {
        found = false;
        break;
      }
    }
    if (found) {
      pos = i - tag.length + 1;
      break;
    }
  }

  if (pos === -1) return;

  // Find the array brackets after /ByteRange
  let arrayStart = -1;
  let arrayEnd = -1;
  for (let i = pos + tag.length; i < pdfBytes.length; i++) {
    if (pdfBytes[i] === 0x5b) {
      // [
      arrayStart = i;
      break;
    }
  }
  if (arrayStart === -1) return;

  for (let i = arrayStart + 1; i < pdfBytes.length; i++) {
    if (pdfBytes[i] === 0x5d) {
      // ]
      arrayEnd = i;
      break;
    }
  }
  if (arrayEnd === -1) return;

  // Build the new ByteRange value with same total length (padded with spaces)
  const newValue = `${byteRange[0]} ${byteRange[1]} ${byteRange[2]} ${byteRange[3]}`;
  const totalLength = arrayEnd - arrayStart - 1; // length inside brackets
  const paddedValue = newValue.padEnd(totalLength, " ");

  for (let i = 0; i < paddedValue.length; i++) {
    pdfBytes[arrayStart + 1 + i] = paddedValue.charCodeAt(i);
  }
}
