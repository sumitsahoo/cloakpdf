/**
 * PDF password security — encryption (AES-256/V5/R5) and decryption
 * (all standard versions: RC4-40/V1, RC4-128/V2, AES-128/V4, AES-256/V5).
 *
 * Uses only:
 *   - Web Crypto API (AES-CBC, SHA-256) — built into every modern browser
 *   - Compact pure-JS MD5 and RC4 (these are not in the Web Crypto API)
 *   - Standard pdf-lib low-level objects (PDFDict, PDFHexString, etc.)
 *
 * Replaces pdf-lib-with-encrypt, which is a fork of pdf-lib that hooks into
 * the writer at serialisation time. Our approach pre-processes stream content
 * before calling pdf-lib's save() and saves without object-streams so that no
 * additional streams are created during serialisation.
 */

import {
  PDFDocument,
  PDFDict,
  PDFArray,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFString,
} from "pdf-lib";

// ─── MD5 ─────────────────────────────────────────────────────────────────────
// RFC 1321. Required for file-ID generation and legacy (R2/R3/R4) key
// derivation — SHA families cover everything else via Web Crypto.

const MD5_SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
  20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
  10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const MD5_T = Array.from({ length: 64 }, (_, i) => (Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

function md5(input: Uint8Array): Uint8Array {
  const len = input.length;
  const blk = Math.ceil((len + 9) / 64) * 64;
  const buf = new Uint8Array(blk);
  buf.set(input);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(blk - 8, (len * 8) >>> 0, true);
  dv.setUint32(blk - 4, Math.floor(len / 0x20000000) >>> 0, true);

  let a0 = 0x67452301,
    b0 = 0xefcdab89,
    c0 = 0x98badcfe,
    d0 = 0x10325476;
  for (let i = 0; i < blk; i += 64) {
    const M = Array.from({ length: 16 }, (_, j) => dv.getUint32(i + j * 4, true));
    let [a, b, c, d] = [a0, b0, c0, d0];
    for (let j = 0; j < 64; j++) {
      let f: number, g: number;
      if (j < 16) {
        f = (b & c) | (~b & d);
        g = j;
      } else if (j < 32) {
        f = (d & b) | (~d & c);
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        f = b ^ c ^ d;
        g = (3 * j + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * j) % 16;
      }
      const t = (a + f + M[g] + MD5_T[j]) | 0;
      const s = MD5_SHIFTS[j];
      [a, d, c, b] = [d, c, b, (b + ((t << s) | (t >>> (32 - s)))) | 0];
    }
    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }
  const out = new Uint8Array(16);
  const rv = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((v, i) => rv.setUint32(i * 4, v, true));
  return out;
}

// ─── RC4 ─────────────────────────────────────────────────────────────────────
// Used for V=1 (RC4-40) and V=2 (RC4-128) encrypted PDFs.

function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const S = Uint8Array.from({ length: 256 }, (_, i) => i);
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 0xff;
    [S[i], S[j]] = [S[j], S[i]];
  }
  const out = new Uint8Array(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + S[i]) & 0xff;
    [S[i], S[j]] = [S[j], S[i]];
    out[k] = data[k] ^ S[(S[i] + S[j]) & 0xff];
  }
  return out;
}

// ─── Web Crypto helpers ───────────────────────────────────────────────────────

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", toU8(data)));
}

// Standard AES-CBC (with PKCS7 padding) — used for stream content
async function aesCbcEncrypt(
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", toU8(key), "AES-CBC", false, ["encrypt"]);
  return new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-CBC", iv: toU8(iv) }, k, toU8(data)),
  );
}
async function aesCbcDecrypt(
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", toU8(key), "AES-CBC", false, ["decrypt"]);
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-CBC", iv: toU8(iv) }, k, toU8(data)),
  );
}

// AES-ECB of a single 16-byte block via CBC-with-zero-IV trick
async function aesEcbEncrypt16(key: Uint8Array, block: Uint8Array): Promise<Uint8Array> {
  const enc = await aesCbcEncrypt(key, new Uint8Array(16), block);
  return enc.slice(0, 16); // strip PKCS7 padding block
}

// AES-CBC without padding for UE/OE key wrapping (data must be multiple of 16)
async function aesCbcNoPadEncrypt(
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  // Encrypting with PKCS7 and discarding the trailing padding block gives the
  // same ciphertext for the data blocks because CBC chains are independent of
  // what comes after.
  const enc = await aesCbcEncrypt(key, iv, data);
  return enc.slice(0, data.length);
}

async function aesCbcNoPadDecrypt(
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  // Append a dummy block whose decryption will produce valid PKCS7 padding
  // so that Web Crypto accepts the ciphertext.
  //   AES_CBC_dec(C_last) XOR C_prev = P_pad  → P_pad = 0x10 * 16
  //   → C_dummy = AES_ECB_enc(P_pad XOR C_last) = AES_ECB_enc([0x10…] XOR C_last)
  const lastBlock = data.slice(data.length - 16);
  const paddingTarget = new Uint8Array(16).fill(0x10);
  const dummy = await aesEcbEncrypt16(
    key,
    lastBlock.map((b, i) => b ^ paddingTarget[i]),
  );
  const k = await crypto.subtle.importKey("raw", toU8(key), "AES-CBC", false, ["decrypt"]);
  const dec = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv: toU8(iv) },
    k,
    concat(data, dummy),
  );
  return new Uint8Array(dec); // PKCS7 stripped → original data length
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Ensure we have a Uint8Array backed by a plain ArrayBuffer (required by Web Crypto). */
function toU8(data: Uint8Array): Uint8Array<ArrayBuffer> {
  return data.buffer instanceof ArrayBuffer
    ? (data as Uint8Array<ArrayBuffer>)
    : new Uint8Array(data);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function getBinaryBytes(obj: unknown): Uint8Array {
  if (obj instanceof PDFHexString) return obj.asBytes();
  if (obj instanceof PDFString) return obj.asBytes();
  throw new Error("Expected PDF binary string entry");
}

// ─── PDF password pre-processing ─────────────────────────────────────────────

// Standard 32-byte padding constant (PDF spec §7.6.3.3)
const PW_PADDING = new Uint8Array([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

/** Pad/truncate to exactly 32 bytes for legacy (R2/R3/R4) algorithms. */
function padPwLegacy(pw: string): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    if (i < pw.length) {
      const code = pw.charCodeAt(i);
      if (code > 0xff) throw new Error("Password contains non-Latin characters. Use ASCII.");
      out[i] = code;
    } else {
      out[i] = PW_PADDING[i - pw.length];
    }
  }
  return out;
}

/** NFKC-normalise, truncate to 127 bytes for R5. */
function normPwR5(pw: string): Uint8Array {
  const norm = unescape(encodeURIComponent(pw.normalize("NFKC")));
  const n = Math.min(127, norm.length);
  return Uint8Array.from({ length: n }, (_, i) => norm.charCodeAt(i));
}

// ─── Legacy (R2/R3/R4) key derivation ────────────────────────────────────────

function encKeyLegacy(
  r: number,
  keyBits: number,
  docId: Uint8Array,
  paddedUser: Uint8Array,
  O: Uint8Array,
  P: number,
): Uint8Array {
  const pb = new Uint8Array(4);
  new DataView(pb.buffer).setInt32(0, P, true);
  let hash = md5(concat(paddedUser, O, pb, docId));
  const rounds = r >= 3 ? 51 : 1;
  for (let i = 1; i < rounds; i++) hash = md5(hash.slice(0, keyBits / 8));
  return hash.slice(0, keyBits / 8);
}

function userEntryR2(encKey: Uint8Array): Uint8Array {
  return rc4(encKey, PW_PADDING);
}

function userEntryR3R4(docId: Uint8Array, encKey: Uint8Array): Uint8Array {
  let cipher = md5(concat(PW_PADDING, docId));
  for (let i = 0; i < 20; i++)
    cipher = rc4(
      encKey.map((b) => b ^ i),
      cipher,
    );
  return concat(cipher, new Uint8Array(16)); // 32 bytes
}

/** Recover the (padded) user password from the stored owner entry. */
function decryptOwnerEntry(
  r: number,
  keyBits: number,
  O: Uint8Array,
  paddedOwnerPw: Uint8Array,
): Uint8Array {
  let digest = paddedOwnerPw;
  for (let i = 0; i < (r >= 3 ? 51 : 1); i++) digest = md5(digest);
  const ownerKey = digest.slice(0, keyBits / 8);
  let plain = O;
  for (let i = r >= 3 ? 19 : 0; i >= 0; i--)
    plain = rc4(
      ownerKey.map((b) => b ^ i),
      plain,
    );
  return plain;
}

// ─── V5/R5 (AES-256) key setup ───────────────────────────────────────────────

interface EncDataV5 {
  keyBytes: Uint8Array;
  U: Uint8Array; // 48 bytes
  UE: Uint8Array; // 32 bytes
  O: Uint8Array; // 48 bytes
  OE: Uint8Array; // 32 bytes
  Perms: Uint8Array; // 16 bytes
}

async function buildEncDataV5(userPw: string, ownerPw: string, P: number): Promise<EncDataV5> {
  const up = normPwR5(userPw);
  const op = normPwR5(ownerPw);
  const key = crypto.getRandomValues(new Uint8Array(32)); // document encryption key

  // U = SHA256(up || uvs) || uvs || uks  (48 bytes)
  const uvs = crypto.getRandomValues(new Uint8Array(8)); // user validation salt
  const uks = crypto.getRandomValues(new Uint8Array(8)); // user key salt
  const U = concat(await sha256(concat(up, uvs)), uvs, uks);

  // UE = AES-CBC-NoPad(SHA256(up || uks), iv=0, key)  (32 bytes)
  const UE = await aesCbcNoPadEncrypt(await sha256(concat(up, uks)), new Uint8Array(16), key);

  // O = SHA256(op || ovs || U) || ovs || oks  (48 bytes)
  const ovs = crypto.getRandomValues(new Uint8Array(8)); // owner validation salt
  const oks = crypto.getRandomValues(new Uint8Array(8)); // owner key salt
  const O = concat(await sha256(concat(op, ovs, U)), ovs, oks);

  // OE = AES-CBC-NoPad(SHA256(op || oks || U), iv=0, key)  (32 bytes)
  const OE = await aesCbcNoPadEncrypt(await sha256(concat(op, oks, U)), new Uint8Array(16), key);

  // Perms = AES-ECB(key, P[4] || 0xFFFFFFFF[4] || 'Tadb'[4] || rand[4])  (16 bytes)
  const permsPlain = new Uint8Array(16);
  new DataView(permsPlain.buffer).setInt32(0, P, true);
  permsPlain.set([0xff, 0xff, 0xff, 0xff], 4);
  permsPlain.set([0x54, 0x61, 0x64, 0x62], 8); // ASCII 'Tadb'
  crypto.getRandomValues(permsPlain.subarray(12));
  const Perms = await aesEcbEncrypt16(key, permsPlain);

  return { keyBytes: key, U, UE, O, OE, Perms };
}

// ─── Stream encrypt / decrypt ─────────────────────────────────────────────────

/** Encrypt one stream body. For V5: IV||AES-CBC(key,IV,data). For V4: same with per-object key. For V1/V2: RC4. */
async function encryptStreamContent(
  content: Uint8Array,
  encKey: Uint8Array,
  V: number,
  objNum: number,
  genNum: number,
): Promise<Uint8Array> {
  if (V === 1 || V === 2) {
    const ext = new Uint8Array([
      objNum & 0xff,
      (objNum >> 8) & 0xff,
      (objNum >> 16) & 0xff,
      genNum & 0xff,
      (genNum >> 8) & 0xff,
    ]);
    const keyLen = Math.min(16, (V === 1 ? 40 : 128) / 8 + 5);
    return rc4(md5(concat(encKey, ext)).slice(0, keyLen), content);
  }
  const iv = crypto.getRandomValues(new Uint8Array(16));
  if (V === 4) {
    const ext = new Uint8Array([
      objNum & 0xff,
      (objNum >> 8) & 0xff,
      (objNum >> 16) & 0xff,
      genNum & 0xff,
      (genNum >> 8) & 0xff,
      0x73,
      0x41,
      0x6c,
      0x54, // 'sAlT'
    ]);
    const objKey = md5(concat(encKey, ext)).slice(0, 16);
    return concat(iv, await aesCbcEncrypt(objKey, iv, content));
  }
  // V=5: use document key directly
  return concat(iv, await aesCbcEncrypt(encKey, iv, content));
}

/** Decrypt one stream body (inverse of encryptStreamContent). */
async function decryptStreamContent(
  data: Uint8Array,
  encKey: Uint8Array,
  V: number,
  objNum: number,
  genNum: number,
): Promise<Uint8Array> {
  if (V === 1 || V === 2) {
    const ext = new Uint8Array([
      objNum & 0xff,
      (objNum >> 8) & 0xff,
      (objNum >> 16) & 0xff,
      genNum & 0xff,
      (genNum >> 8) & 0xff,
    ]);
    const keyLen = Math.min(16, (V === 1 ? 40 : 128) / 8 + 5);
    return rc4(md5(concat(encKey, ext)).slice(0, keyLen), data);
  }
  if (data.length < 16) throw new Error("Stream too short to be AES-encrypted");
  const iv = data.slice(0, 16);
  const ct = data.slice(16);
  if (V === 4) {
    const ext = new Uint8Array([
      objNum & 0xff,
      (objNum >> 8) & 0xff,
      (objNum >> 16) & 0xff,
      genNum & 0xff,
      (genNum >> 8) & 0xff,
      0x73,
      0x41,
      0x6c,
      0x54,
    ]);
    const objKey = md5(concat(encKey, ext)).slice(0, 16);
    return aesCbcDecrypt(objKey, iv, ct);
  }
  return aesCbcDecrypt(encKey, iv, ct);
}

// ─── Password verification ────────────────────────────────────────────────────

/** Returns the 32-byte document encryption key, or null if the password is wrong. */
async function verifyPasswordV5(
  pw: string,
  U: Uint8Array,
  UE: Uint8Array,
  O: Uint8Array,
  OE: Uint8Array,
): Promise<Uint8Array | null> {
  const p = normPwR5(pw);
  const zero16 = new Uint8Array(16);

  // Try as user password
  const uHash = await sha256(concat(p, U.slice(32, 40)));
  if (uHash.every((b, i) => b === U[i])) {
    return aesCbcNoPadDecrypt(await sha256(concat(p, U.slice(40, 48))), zero16, UE);
  }
  // Try as owner password
  const oHash = await sha256(concat(p, O.slice(32, 40), U.slice(0, 48)));
  if (oHash.every((b, i) => b === O[i])) {
    return aesCbcNoPadDecrypt(await sha256(concat(p, O.slice(40, 48), U.slice(0, 48))), zero16, OE);
  }
  return null;
}

function verifyPasswordLegacy(
  pw: string,
  r: number,
  keyBits: number,
  docId: Uint8Array,
  O: Uint8Array,
  U: Uint8Array,
  P: number,
): Uint8Array | null {
  const check16 = (expected: Uint8Array) => expected.slice(0, 16).every((b, i) => b === U[i]);

  // Try as user password
  const paddedPw = padPwLegacy(pw);
  const ek = encKeyLegacy(r, keyBits, docId, paddedPw, O, P);
  const expectedU = r === 2 ? userEntryR2(ek) : userEntryR3R4(docId, ek);
  if (check16(expectedU)) return ek;

  // Try as owner password (recover user password from O entry)
  const recoveredUser = decryptOwnerEntry(r, keyBits, O, paddedPw);
  const ek2 = encKeyLegacy(r, keyBits, docId, recoveredUser, O, P);
  const expectedU2 = r === 2 ? userEntryR2(ek2) : userEntryR3R4(docId, ek2);
  if (check16(expectedU2)) return ek2;

  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true if the PDF file has an Encrypt entry in its trailer.
 * Uses ignoreEncryption so it never throws on protected files.
 */
export async function isPdfEncrypted(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  return !!pdfDoc.context.trailerInfo.Encrypt;
}

const ALL_PERMS = -4; // 0xFFFFFFFC — all permission bits set

/**
 * Add password protection to a PDF.
 *
 * Always uses AES-256 / V=5 / R=5 encryption (PDF 1.7 Extension Level 3).
 * All document permissions are preserved — only the open password is added.
 * Processing happens entirely in the browser; no data is uploaded.
 *
 * @param file          - The source PDF file.
 * @param userPassword  - Password required to open the document.
 * @param ownerPassword - Password for owner access. Defaults to userPassword.
 * @returns Encrypted PDF bytes.
 */
export async function protectPdf(
  file: File,
  userPassword: string,
  ownerPassword?: string,
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  const ctx = pdfDoc.context;

  const { keyBytes, U, UE, O, OE, Perms } = await buildEncDataV5(
    userPassword,
    ownerPassword ?? userPassword,
    ALL_PERMS,
  );

  // Pre-encrypt every stream in the document with the document encryption key.
  // We use useObjectStreams:false later so pdf-lib won't create any new streams
  // during serialisation that we haven't encrypted.
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const encrypted = await encryptStreamContent(
      obj.getContents(),
      keyBytes,
      5,
      ref.objectNumber,
      ref.generationNumber,
    );
    (obj as unknown as { contents: Uint8Array }).contents = encrypted;
    obj.dict.set(PDFName.of("Length"), PDFNumber.of(encrypted.length));
  }

  // Build and register the Encrypt dictionary
  const encDict = PDFDict.withContext(ctx);
  encDict.set(PDFName.of("Filter"), PDFName.of("Standard"));
  encDict.set(PDFName.of("V"), PDFNumber.of(5));
  encDict.set(PDFName.of("R"), PDFNumber.of(5));
  encDict.set(PDFName.of("Length"), PDFNumber.of(256));
  encDict.set(PDFName.of("P"), PDFNumber.of(ALL_PERMS));
  encDict.set(PDFName.of("O"), PDFHexString.of(toHex(O)));
  encDict.set(PDFName.of("OE"), PDFHexString.of(toHex(OE)));
  encDict.set(PDFName.of("U"), PDFHexString.of(toHex(U)));
  encDict.set(PDFName.of("UE"), PDFHexString.of(toHex(UE)));
  encDict.set(PDFName.of("Perms"), PDFHexString.of(toHex(Perms)));
  encDict.set(
    PDFName.of("CF"),
    ctx.obj({ StdCF: { AuthEvent: "DocOpen", CFM: "AESV3", Length: 32 } }),
  );
  encDict.set(PDFName.of("StmF"), PDFName.of("StdCF"));
  encDict.set(PDFName.of("StrF"), PDFName.of("StdCF"));

  ctx.trailerInfo.Encrypt = ctx.register(encDict);

  // File ID — two identical 16-byte random values (per PDF spec §14.4)
  const fileId = crypto.getRandomValues(new Uint8Array(16));
  const idArr = PDFArray.withContext(ctx);
  idArr.push(PDFHexString.of(toHex(fileId)));
  idArr.push(PDFHexString.of(toHex(fileId)));
  ctx.trailerInfo.ID = idArr;

  // Save without object-streams: using object streams would create new
  // PDFStream objects during serialisation that we haven't pre-encrypted.
  return pdfDoc.save({ useObjectStreams: false });
}

/**
 * Remove password protection from an encrypted PDF.
 *
 * Supports RC4-40 (V=1), RC4-128 (V=2), AES-128 (V=4), and AES-256 (V=5).
 * The output is structurally identical to the input — text remains selectable.
 * Processing happens entirely in the browser; no data is uploaded.
 *
 * @param file     - The password-protected PDF file.
 * @param password - The user (open) or owner password for the document.
 * @returns Unprotected PDF bytes.
 */
export async function unlockPdf(file: File, password: string): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  // ignoreEncryption: true loads the document without throwing EncryptedPDFError,
  // giving us access to the raw (still-encrypted) stream bytes and the Encrypt dict.
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const ctx = pdfDoc.context;

  const encryptRef = ctx.trailerInfo.Encrypt;
  if (!encryptRef) return pdfDoc.save(); // not encrypted

  const encDict = ctx.lookup(encryptRef, PDFDict);
  const V = (encDict.get(PDFName.of("V")) as PDFNumber).asNumber();
  const R = (encDict.get(PDFName.of("R")) as PDFNumber).asNumber();
  const P = (encDict.get(PDFName.of("P")) as PDFNumber).asNumber();
  const O = getBinaryBytes(encDict.get(PDFName.of("O")));
  const U = getBinaryBytes(encDict.get(PDFName.of("U")));

  let encKey: Uint8Array | null;

  if (V === 5) {
    const OE = getBinaryBytes(encDict.get(PDFName.of("OE")));
    const UE = getBinaryBytes(encDict.get(PDFName.of("UE")));
    encKey = await verifyPasswordV5(password, U, UE, O, OE);
  } else if (V >= 1 && V <= 4) {
    const keyBits = V === 1 ? 40 : 128;
    let docId = new Uint8Array(0);
    const idObj = ctx.trailerInfo.ID;
    if (idObj instanceof PDFArray) {
      const first = idObj.get(0);
      if (first) docId = new Uint8Array(getBinaryBytes(first));
    }
    encKey = verifyPasswordLegacy(password, R, keyBits, docId, O, U, P);
  } else {
    throw new Error(`Unsupported PDF encryption version V=${V}.`);
  }

  if (!encKey) throw new Error("Incorrect password.");

  // Decrypt all stream bodies in-place
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const contents = obj.getContents();
    if (contents.length === 0) continue;
    const decrypted = await decryptStreamContent(
      contents,
      encKey,
      V,
      ref.objectNumber,
      ref.generationNumber,
    );
    (obj as unknown as { contents: Uint8Array }).contents = decrypted;
    obj.dict.set(PDFName.of("Length"), PDFNumber.of(decrypted.length));
  }

  // Remove the Encrypt entry — the saved PDF will have no encryption headers
  delete ctx.trailerInfo.Encrypt;

  return pdfDoc.save();
}
