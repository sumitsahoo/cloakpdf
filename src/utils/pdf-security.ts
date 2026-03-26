/**
 * PDF password security — encryption (AES-256/V5/R5) and decryption
 * (all standard versions: RC4-40/V1, RC4-128/V2, AES-128/V4, AES-256/V5).
 *
 * ## How PDF encryption works (overview)
 *
 * A PDF's encryption is described by an /Encrypt dictionary stored in the
 * file's trailer. It contains:
 *   - /V (algorithm version): 1=RC4-40, 2=RC4-128, 4=AES-128, 5=AES-256
 *   - /R (revision): tied to V, e.g. R=5 for V=5
 *   - /P (permissions bitmask): which operations the user can perform
 *   - /O (owner password verifier / key-recovery blob)
 *   - /U (user password verifier)
 *   - /OE, /UE, /Perms (V=5 only): AES-256 key wrapping entries
 *
 * Every stream body (fonts, images, content, …) in the file is encrypted with
 * a *document encryption key* that is derived from (or wrapped by) the password.
 * Strings inside dictionaries may also be encrypted, but this implementation
 * focuses on streams, which is sufficient for removing/adding protection.
 *
 * ## Encryption pipeline (protectPdf)
 *
 * 1. Generate a random 32-byte document key.
 * 2. Build the V5/R5 Encrypt dictionary entries (U, UE, O, OE, Perms).
 * 3. Walk every PDFRawStream, encrypt its bytes in-place.
 * 4. Register the Encrypt dict and a random file ID in the trailer.
 * 5. Save with useObjectStreams:false so no new un-encrypted streams appear.
 *
 * ## Decryption pipeline (unlockPdf)
 *
 * 1. Load with ignoreEncryption:true to access raw encrypted bytes.
 * 2. Read V/R from the Encrypt dict.
 * 3. Verify the password and recover the document key (version-specific).
 * 4. Walk every PDFRawStream, decrypt its bytes in-place.
 * 5. Delete the Encrypt entry and save the now-clear document.
 *
 * ## Cryptographic primitives used
 *
 *   - Web Crypto API (AES-CBC, SHA-256) — built into every modern browser
 *   - Compact pure-JS MD5 and RC4 (these are not in the Web Crypto API)
 *   - Standard pdf-lib low-level objects (PDFDict, PDFHexString, etc.)
 *
 * PDF spec references: ISO 32000-1:2008 §7.6 (encryption), §14.4 (file ID).
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
//
// MD5 processes input in 512-bit (64-byte) blocks. Each block drives 64 rounds
// grouped into four 16-round passes (F/G/H/I) with different bitwise mix
// functions. The four 32-bit state words (a/b/c/d) accumulate into the final
// 128-bit (16-byte) digest.

/** Per-round left-rotate amounts, 4 rounds × 16 steps each (RFC 1321 §3.4). */
const MD5_SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
  20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
  10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

/**
 * Per-round additive constants T[i] = floor(abs(sin(i+1)) * 2^32).
 * Derived from the fractional parts of sin to avoid chosen-structure attacks.
 */
const MD5_T = Array.from({ length: 64 }, (_, i) => (Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

/**
 * Compute the MD5 digest of `input` (RFC 1321).
 *
 * Steps:
 *   1. Pad the message to a multiple of 512 bits: append 0x80, then zeros,
 *      then the 64-bit little-endian bit-length of the original message.
 *   2. Process 64-byte blocks. For each block, run 64 rounds that update the
 *      four 32-bit words (a, b, c, d) using the block's 16 uint32 values and the
 *      constants above.
 *   3. Accumulate the result into the running state (a0, b0, c0, d0).
 *   4. Return the four state words serialized as 16 little-endian bytes.
 */
function md5(input: Uint8Array): Uint8Array {
  const len = input.length;
  // Allocate the padded buffer (next multiple of 64 after len+9: 1 byte 0x80 + 8 bytes length)
  const blk = Math.ceil((len + 9) / 64) * 64;
  const buf = new Uint8Array(blk);
  buf.set(input);
  buf[len] = 0x80; // append bit '1' then implicit zero bits
  const dv = new DataView(buf.buffer);
  // Append original bit-length as two 32-bit little-endian words
  dv.setUint32(blk - 8, (len * 8) >>> 0, true);
  dv.setUint32(blk - 4, Math.floor(len / 0x20000000) >>> 0, true);

  // Initial hash state (magic constants from RFC 1321 §3.3)
  let a0 = 0x67452301,
    b0 = 0xefcdab89,
    c0 = 0x98badcfe,
    d0 = 0x10325476;

  for (let i = 0; i < blk; i += 64) {
    // Split the 64-byte block into 16 little-endian 32-bit words
    const M = Array.from({ length: 16 }, (_, j) => dv.getUint32(i + j * 4, true));
    let [a, b, c, d] = [a0, b0, c0, d0];

    for (let j = 0; j < 64; j++) {
      let f: number, g: number;
      if (j < 16) {
        // Round 1 — F function: (b AND c) OR (NOT b AND d)
        f = (b & c) | (~b & d);
        g = j;
      } else if (j < 32) {
        // Round 2 — G function: (d AND b) OR (NOT d AND c)
        f = (d & b) | (~d & c);
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        // Round 3 — H function: b XOR c XOR d
        f = b ^ c ^ d;
        g = (3 * j + 5) % 16;
      } else {
        // Round 4 — I function: c XOR (b OR NOT d)
        f = c ^ (b | ~d);
        g = (7 * j) % 16;
      }
      // Add, rotate left by s, add b; then rotate the state words
      const t = (a + f + M[g] + MD5_T[j]) | 0;
      const s = MD5_SHIFTS[j];
      [a, d, c, b] = [d, c, b, (b + ((t << s) | (t >>> (32 - s)))) | 0];
    }

    // Add compressed block to running state
    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }

  // Serialize state as 16 little-endian bytes
  const out = new Uint8Array(16);
  const rv = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((v, i) => rv.setUint32(i * 4, v, true));
  return out;
}

// ─── RC4 ─────────────────────────────────────────────────────────────────────
// Used for V=1 (RC4-40) and V=2 (RC4-128) encrypted PDFs.
//
// RC4 is a stream cipher with two phases:
//   KSA  (Key Scheduling Algorithm): permute a 256-byte state array S based
//        on the key, creating a pseudo-random permutation.
//   PRGA (Pseudo-Random Generation): generate a key-stream byte by byte from S,
//        then XOR with the plaintext/encrypted-data.
// Because XOR is symmetric, the same function encrypts and decrypts.

/**
 * RC4 stream cipher (encrypt or decrypt — the operation is identical).
 *
 * @param key  - Variable-length key (typically 5 bytes for RC4-40 or 16 for RC4-128).
 * @param data - Plaintext (encrypting) or encrypted bytes (decrypting).
 * @returns    Resulting encrypted or decrypted bytes.
 */
function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  // KSA: initialize S as the identity permutation, then mix in the key
  const S = Uint8Array.from({ length: 256 }, (_, i) => i);
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 0xff;
    [S[i], S[j]] = [S[j], S[i]]; // swap
  }

  // PRGA: generate key-stream and XOR with data
  const out = new Uint8Array(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + S[i]) & 0xff;
    [S[i], S[j]] = [S[j], S[i]];
    out[k] = data[k] ^ S[(S[i] + S[j]) & 0xff]; // key-stream byte XOR plaintext
  }
  return out;
}

// ─── Web Crypto helpers ───────────────────────────────────────────────────────
// All AES work is delegated to the browser's built-in SubtleCrypto API,
// which runs in a privileged context and avoids pure-JS crypto pitfalls
// (timing attacks, non-constant-time comparisons, etc.).

/** SHA-256 hash via Web Crypto. Used exclusively by V5/R5 key derivation. */
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", toU8(data)));
}

/**
 * AES-CBC encryption with PKCS7 padding (standard Web Crypto behavior).
 * Used for V5 stream encryption and for constructing the no-pad variants below.
 */
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

/** AES-CBC decryption with PKCS7 padding removal (standard Web Crypto behavior). */
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

/**
 * AES-ECB encryption of a single 16-byte block.
 *
 * Web Crypto does not expose AES-ECB, but we can emulate it via AES-CBC with a
 * zero IV: CBC(key, IV=0, P) = AES_block(key, P XOR 0) = AES_block(key, P).
 * We encrypt a 16-byte block, which produces 32 bytes (data + PKCS7 padding
 * block), and keep only the first 16.
 */
async function aesEcbEncrypt16(key: Uint8Array, block: Uint8Array): Promise<Uint8Array> {
  const enc = await aesCbcEncrypt(key, new Uint8Array(16), block);
  return enc.slice(0, 16); // strip PKCS7 padding block
}

/**
 * AES-CBC encryption *without* PKCS7 padding (data must be a multiple of 16 bytes).
 *
 * Required by the PDF V5 spec for UE/OE key-wrapping, where the document key
 * (always 32 bytes) must be stored exactly — no extra padding block.
 *
 * Trick: encrypt with PKCS7, then discard the trailing padding block. The CBC
 * chaining of the actual data blocks is unaffected by what comes after them,
 * so the first `data.length` bytes of the padded output are correct.
 */
async function aesCbcNoPadEncrypt(
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  const enc = await aesCbcEncrypt(key, iv, data);
  return enc.slice(0, data.length);
}

/**
 * AES-CBC decryption *without* PKCS7 padding removal (data must be a multiple of 16 bytes).
 *
 * Web Crypto requires valid PKCS7 padding at the end of AES-CBC encrypted data.
 * For the UE/OE key blobs (32 bytes of raw encrypted data, no padding block) we
 * construct a dummy block whose decryption produces valid padding:
 *
 *   Goal: dec(C_last) XOR C_prev = P_pad where P_pad = [0x10 × 16]
 *   Rearranging: dec(C_dummy) XOR C_last = [0x10 × 16]
 *             → dec(C_dummy) = [0x10 × 16] XOR C_last
 *             → C_dummy = AES_ECB_enc([0x10 × 16] XOR C_last)
 *
 * We append C_dummy, let Web Crypto decrypt + strip the padding block, and
 * return the first `data.length` bytes (the actual plaintext).
 */
async function aesCbcNoPadDecrypt(
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  const lastBlock = data.slice(data.length - 16);
  const paddingTarget = new Uint8Array(16).fill(0x10);
  // Craft a dummy block that makes Web Crypto see valid PKCS7 padding
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

/** Concatenate multiple Uint8Arrays into a single new array. */
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

/**
 * Ensure the Uint8Array is backed by a plain ArrayBuffer.
 *
 * Web Crypto's SubtleCrypto methods reject typed arrays whose buffer is a
 * SharedArrayBuffer (which can appear when working with certain libraries or
 * worker contexts). This wraps the data in a fresh regular ArrayBuffer when
 * necessary.
 */
function toU8(data: Uint8Array): Uint8Array<ArrayBuffer> {
  return data.buffer instanceof ArrayBuffer
    ? (data as Uint8Array<ArrayBuffer>)
    : new Uint8Array(data);
}

/** Encode a byte array as a lowercase hex string (for PDFHexString entries). */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Extract raw bytes from a PDF binary string entry.
 * The Encrypt dictionary stores O/U/OE/UE/Perms as either PDFHexString or
 * PDFString depending on how the original file was written.
 */
function getBinaryBytes(obj: unknown): Uint8Array {
  if (obj instanceof PDFHexString) return obj.asBytes();
  if (obj instanceof PDFString) return obj.asBytes();
  throw new Error("Expected PDF binary string entry");
}

// ─── PDF password pre-processing ─────────────────────────────────────────────

/**
 * Standard 32-byte password padding constant (PDF spec §7.6.3.3).
 *
 * For legacy algorithms (R2/R3/R4), every password is zero-padded or
 * truncated to exactly 32 bytes using this constant as filler. An empty
 * password is represented entirely by these 32 bytes.
 */
const PW_PADDING = new Uint8Array([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

/**
 * Pad or truncate a password to exactly 32 bytes for legacy (R2/R3/R4) algorithms.
 *
 * PDF spec §7.6.3.3: take up to 32 bytes of the password (Latin-1 code points),
 * then fill the remaining bytes with the standard padding constant above.
 */
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

/**
 * Normalize a password for R5 (AES-256): NFKC Unicode normalization, then
 * encode as UTF-8 and truncate to at most 127 bytes (PDF spec §7.6.4.3.2).
 *
 * The unescape(encodeURIComponent(…)) idiom converts a JS string to its UTF-8
 * byte representation as a Latin-1 string, which we then convert byte-by-byte.
 */
function normPwR5(pw: string): Uint8Array {
  const norm = unescape(encodeURIComponent(pw.normalize("NFKC")));
  const n = Math.min(127, norm.length);
  return Uint8Array.from({ length: n }, (_, i) => norm.charCodeAt(i));
}

// ─── Legacy (R2/R3/R4) key derivation ────────────────────────────────────────
//
// PDF spec §7.6.3.3 — "Computing an encryption key":
//   hash = MD5(padded_user_pw || O_entry || P_flags[4LE] || docId[0])
//   For R≥3: repeat MD5(hash[0..keyLen]) 50 more times (total 51 rounds).
//   The first `keyLen` bytes of the final hash are the document encryption key.
//
// The repeated hashing is a key-stretching measure to slow brute force.

/**
 * Derive the document encryption key from a (padded) user password.
 *
 * @param r          - Encryption revision (2, 3, or 4).
 * @param keyBits    - Key length in bits (40 for V=1, 128 for V=2/V=4).
 * @param docId      - First element of the /ID array from the trailer.
 * @param paddedUser - 32-byte padded/truncated user password (from padPwLegacy).
 * @param O          - Owner entry from the Encrypt dict (32 bytes).
 * @param P          - Permissions flags integer.
 * @returns The document encryption key (5 bytes for V=1, 16 bytes otherwise).
 */
function encKeyLegacy(
  r: number,
  keyBits: number,
  docId: Uint8Array,
  paddedUser: Uint8Array,
  O: Uint8Array,
  P: number,
): Uint8Array {
  const pb = new Uint8Array(4);
  new DataView(pb.buffer).setInt32(0, P, true); // P as 4-byte little-endian signed int
  let hash = md5(concat(paddedUser, O, pb, docId));
  // R≥3: 50 additional MD5 rounds over the first keyLen bytes (key stretching)
  const rounds = r >= 3 ? 51 : 1;
  for (let i = 1; i < rounds; i++) hash = md5(hash.slice(0, keyBits / 8));
  return hash.slice(0, keyBits / 8);
}

/**
 * Compute the expected /U entry for revision 2 (PDF spec §7.6.3.4, algo 4).
 *
 * For R=2 the U entry is simply RC4(encKey, padding_constant).
 */
function userEntryR2(encKey: Uint8Array): Uint8Array {
  return rc4(encKey, PW_PADDING);
}

/**
 * Compute the expected /U entry for revisions 3–4 (PDF spec §7.6.3.4, algo 5).
 *
 * Steps:
 *   1. hash = MD5(padding_constant || docId)  — 16 bytes
 *   2. Apply 20 RC4 passes with keys `encKey XOR i` for i = 0..19.
 *   3. Pad to 32 bytes with zeros (only the first 16 are checked during verify).
 */
function userEntryR3R4(docId: Uint8Array, encKey: Uint8Array): Uint8Array {
  let cipher = md5(concat(PW_PADDING, docId));
  for (let i = 0; i < 20; i++)
    cipher = rc4(
      encKey.map((b) => b ^ i), // XOR the key with the round index
      cipher,
    );
  return concat(cipher, new Uint8Array(16)); // 32 bytes total
}

/**
 * Recover the (padded) user password from the stored /O entry (PDF spec §7.6.3.4, algo 7).
 *
 * The /O entry is computed as:
 *   ownerKey = MD5^n(padded_owner_pw)[0..keyLen]
 *   O = RC4^n(ownerKey, padded_user_pw)   (20 passes for R≥3, 1 pass for R=2)
 *
 * This function reverses the process:
 *   1. Derive the same ownerKey from the supplied (padded) owner password.
 *   2. RC4-decrypt O in reverse order (i = 19..0 for R≥3, i = 0 for R=2)
 *      to recover the padded user password.
 *
 * Once we have the padded user password, we can derive the encryption key via
 * encKeyLegacy just as if the user password had been supplied directly.
 */
function decryptOwnerEntry(
  r: number,
  keyBits: number,
  O: Uint8Array,
  paddedOwnerPw: Uint8Array,
): Uint8Array {
  // Key-stretch the owner password (same number of MD5 rounds as during creation)
  let digest = paddedOwnerPw;
  for (let i = 0; i < (r >= 3 ? 51 : 1); i++) digest = md5(digest);
  const ownerKey = digest.slice(0, keyBits / 8);

  // Reverse the layered RC4 passes to recover the padded user password
  let plain = O;
  for (let i = r >= 3 ? 19 : 0; i >= 0; i--)
    plain = rc4(
      ownerKey.map((b) => b ^ i),
      plain,
    );
  return plain;
}

// ─── V5/R5 (AES-256) key setup ───────────────────────────────────────────────
//
// PDF 1.7 Extension Level 3 / ISO 32000-2 §7.6.4.
//
// Instead of deriving the key from the password, V5 generates a random 32-byte
// document key and *wraps* (encrypts) it with a key derived from the password.
// This allows multiple passwords (user + owner) to unlock the same document key.
//
// Key structure:
//   U[0..31]   = SHA256(userPw || userValidationSalt)  — for password check
//   U[32..39]  = userValidationSalt  (8 random bytes)
//   U[40..47]  = userKeySalt         (8 random bytes)
//   UE[0..31]  = AES-CBC-NoPad(SHA256(userPw || userKeySalt), IV=0, docKey)
//
//   O[0..31]   = SHA256(ownerPw || ownerValidationSalt || U)
//   O[32..39]  = ownerValidationSalt
//   O[40..47]  = ownerKeySalt
//   OE[0..31]  = AES-CBC-NoPad(SHA256(ownerPw || ownerKeySalt || U), IV=0, docKey)
//
//   Perms[0..15] = AES-ECB(docKey, P[4LE] || 0xFFFFFFFF[4] || sentinel[4] || rand[4])

/** Shape returned by buildEncDataV5; contains everything needed for the Encrypt dict. */
interface EncDataV5 {
  keyBytes: Uint8Array; // 32-byte document encryption key
  U: Uint8Array; // 48 bytes: user verifier (32) + validation salt (8) + key salt (8)
  UE: Uint8Array; // 32 bytes: document key wrapped with user key-encryption key
  O: Uint8Array; // 48 bytes: owner verifier (32) + validation salt (8) + key salt (8)
  OE: Uint8Array; // 32 bytes: document key wrapped with owner key-encryption key
  Perms: Uint8Array; // 16 bytes: encrypted permissions block
}

/**
 * Generate all V5/R5 Encrypt dictionary entries for the given passwords and permissions.
 *
 * @param userPw  - Password required to open the document.
 * @param ownerPw - Higher-privilege password (can be the same as userPw).
 * @param P       - Permissions bitmask (use ALL_PERMS = -4 to grant everything).
 */
async function buildEncDataV5(userPw: string, ownerPw: string, P: number): Promise<EncDataV5> {
  const up = normPwR5(userPw);
  const op = normPwR5(ownerPw);
  const key = crypto.getRandomValues(new Uint8Array(32)); // random 256-bit document key

  // ── User entries ──────────────────────────────────────────────────────────
  // U = SHA256(up || uvs) || uvs || uks  (48 bytes total)
  const uvs = crypto.getRandomValues(new Uint8Array(8)); // user validation salt
  const uks = crypto.getRandomValues(new Uint8Array(8)); // user key salt
  const U = concat(await sha256(concat(up, uvs)), uvs, uks);

  // UE: wrap the document key with a key derived from (userPw + userKeySalt)
  // IV=0 per spec; the 32-byte key aligns perfectly with two AES blocks.
  const UE = await aesCbcNoPadEncrypt(await sha256(concat(up, uks)), new Uint8Array(16), key);

  // ── Owner entries ─────────────────────────────────────────────────────────
  // O includes U as input so that the owner verifier is bound to this specific
  // user entry, preventing a rogue owner block from being transplanted.
  const ovs = crypto.getRandomValues(new Uint8Array(8)); // owner validation salt
  const oks = crypto.getRandomValues(new Uint8Array(8)); // owner key salt
  const O = concat(await sha256(concat(op, ovs, U)), ovs, oks);

  // OE: wrap the document key with a key derived from (ownerPw + ownerKeySalt + U)
  const OE = await aesCbcNoPadEncrypt(await sha256(concat(op, oks, U)), new Uint8Array(16), key);

  // ── Permissions block ─────────────────────────────────────────────────────
  // Perms = AES-ECB(docKey, P[4LE] || 0xFFFFFFFF[4] || sentinel[4] || rand[4])
  // The reader decrypts Perms and checks bytes 8-11 == 0x54616462 to validate the key.
  const permsPlain = new Uint8Array(16);
  new DataView(permsPlain.buffer).setInt32(0, P, true); // bytes 0-3: permissions
  permsPlain.set([0xff, 0xff, 0xff, 0xff], 4); // bytes 4-7: reserved (all 1s)
  permsPlain.set([0x54, 0x61, 0x64, 0x62], 8); // bytes 8-11: ASCII 'Tadb' sentinel
  crypto.getRandomValues(permsPlain.subarray(12)); // bytes 12-15: random padding
  const Perms = await aesEcbEncrypt16(key, permsPlain);

  return { keyBytes: key, U, UE, O, OE, Perms };
}

// ─── Stream encrypt / decrypt ─────────────────────────────────────────────────
//
// Each stream is encrypted/decrypted individually. The algorithm used depends
// on the document's /V value:
//
//   V=1 (RC4-40):   per-object key = MD5(encKey || objNum[3LE] || genNum[2LE])[0..4]
//   V=2 (RC4-128):  per-object key = MD5(encKey || objNum[3LE] || genNum[2LE])[0..15]
//   V=4 (AES-128):  per-object key = MD5(encKey || objNum[3LE] || genNum[2LE] || 'sAlT')[0..15]
//                   encrypted output format: 16-byte random IV || AES-CBC(objKey, IV, data)
//   V=5 (AES-256):  document key used directly (no per-object derivation)
//                   encrypted output format: 16-byte random IV || AES-CBC(docKey, IV, data)
//
// For V=1/V=2/V=4, mixing the object number and generation number into the key
// ensures that two identical plaintext streams produce different encrypted output.

/**
 * Encrypt one stream body.
 *
 * @param content - Raw (unencrypted) stream bytes.
 * @param encKey  - Document encryption key.
 * @param V       - Encrypt dictionary /V value (1, 2, 4, or 5).
 * @param objNum  - PDF indirect object number for the stream.
 * @param genNum  - PDF generation number for the stream.
 * @returns Encrypted bytes (IV prepended for AES variants).
 */
async function encryptStreamContent(
  content: Uint8Array,
  encKey: Uint8Array,
  V: number,
  objNum: number,
  genNum: number,
): Promise<Uint8Array> {
  if (V === 1 || V === 2) {
    // Per-object key extension: 3 bytes of objNum (LE) + 2 bytes of genNum (LE)
    const ext = new Uint8Array([
      objNum & 0xff,
      (objNum >> 8) & 0xff,
      (objNum >> 16) & 0xff,
      genNum & 0xff,
      (genNum >> 8) & 0xff,
    ]);
    // Key length: min(keyBits/8 + 5, 16) — the +5 accounts for the object ext
    const keyLen = Math.min(16, (V === 1 ? 40 : 128) / 8 + 5);
    return rc4(md5(concat(encKey, ext)).slice(0, keyLen), content);
  }

  // AES variants: generate a fresh random 16-byte IV for each stream
  const iv = crypto.getRandomValues(new Uint8Array(16));

  if (V === 4) {
    // Same extension as V=1/V=2, plus the 4-byte 'sAlT' marker for AES (PDF spec §7.6.5)
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

  // V=5: use the 256-bit document key directly — no per-object derivation
  return concat(iv, await aesCbcEncrypt(encKey, iv, content));
}

/**
 * Decrypt one stream body (exact inverse of encryptStreamContent).
 *
 * @param data   - Encrypted stream bytes (IV prepended for AES variants).
 * @param encKey - Document encryption key.
 * @param V      - Encrypt dictionary /V value (1, 2, 4, or 5).
 * @param objNum - PDF indirect object number for the stream.
 * @param genNum - PDF generation number for the stream.
 * @returns Decrypted plaintext bytes.
 */
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

  // For AES: the first 16 bytes are the IV written during encryption
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
      0x54, // 'sAlT'
    ]);
    const objKey = md5(concat(encKey, ext)).slice(0, 16);
    return aesCbcDecrypt(objKey, iv, ct);
  }

  // V=5: document key used directly
  return aesCbcDecrypt(encKey, iv, ct);
}

// ─── Password verification ────────────────────────────────────────────────────

/**
 * Verify a password against a V5/R5 Encrypt dictionary and recover the document key.
 *
 * The PDF spec (§7.6.4.4) defines separate checks for user and owner passwords:
 *
 *   User check:
 *     SHA256(password || U[32..39]) == U[0..31]
 *     If true: docKey = AES-CBC-NoPad-Dec(SHA256(password || U[40..47]), IV=0, UE)
 *
 *   Owner check:
 *     SHA256(password || O[32..39] || U[0..47]) == O[0..31]
 *     If true: docKey = AES-CBC-NoPad-Dec(SHA256(password || O[40..47] || U[0..47]), IV=0, OE)
 *
 * Both checks are tried; the first match wins.
 *
 * @returns The 32-byte document encryption key, or null if the password is wrong.
 */
async function verifyPasswordV5(
  pw: string,
  U: Uint8Array,
  UE: Uint8Array,
  O: Uint8Array,
  OE: Uint8Array,
): Promise<Uint8Array | null> {
  const p = normPwR5(pw);
  const zero16 = new Uint8Array(16);

  // Try as user password: hash with the user validation salt (U[32..39])
  const uHash = await sha256(concat(p, U.slice(32, 40)));
  if (uHash.every((b, i) => b === U[i])) {
    // Password correct — unwrap the document key using the user key salt (U[40..47])
    return aesCbcNoPadDecrypt(await sha256(concat(p, U.slice(40, 48))), zero16, UE);
  }

  // Try as owner password: hash with owner validation salt (O[32..39]) and U
  const oHash = await sha256(concat(p, O.slice(32, 40), U.slice(0, 48)));
  if (oHash.every((b, i) => b === O[i])) {
    // Password correct — unwrap the document key using the owner key salt (O[40..47])
    return aesCbcNoPadDecrypt(await sha256(concat(p, O.slice(40, 48), U.slice(0, 48))), zero16, OE);
  }

  return null; // neither user nor owner password matched
}

/**
 * Verify a password against a legacy (V=1/2/4, R=2/3/4) Encrypt dictionary.
 *
 * Two strategies are tried:
 *
 *   1. User password check (PDF spec §7.6.3.4, algorithm 6):
 *      Derive encKey from the padded password, compute the expected U entry,
 *      compare the first 16 bytes with the stored /U.
 *
 *   2. Owner password check (PDF spec §7.6.3.4, algorithm 7):
 *      Use decryptOwnerEntry() to extract the padded user password from /O,
 *      then proceed as in step 1 with that recovered user password.
 *
 * @returns The 5- or 16-byte document encryption key if the password is correct,
 *   or `null` if neither the user nor owner password matches.
 */
function verifyPasswordLegacy(
  pw: string,
  r: number,
  keyBits: number,
  docId: Uint8Array,
  O: Uint8Array,
  U: Uint8Array,
  P: number,
): Uint8Array | null {
  // Only the first 16 bytes of the U entry are meaningful for comparison (R≥3 pads to 32)
  const check16 = (expected: Uint8Array) => expected.slice(0, 16).every((b, i) => b === U[i]);

  // Strategy 1: treat pw as the user password
  const paddedPw = padPwLegacy(pw);
  const ek = encKeyLegacy(r, keyBits, docId, paddedPw, O, P);
  const expectedU = r === 2 ? userEntryR2(ek) : userEntryR3R4(docId, ek);
  if (check16(expectedU)) return ek;

  // Strategy 2: treat pw as the owner password and recover the user password from /O
  const recoveredUser = decryptOwnerEntry(r, keyBits, O, paddedPw);
  const ek2 = encKeyLegacy(r, keyBits, docId, recoveredUser, O, P);
  const expectedU2 = r === 2 ? userEntryR2(ek2) : userEntryR3R4(docId, ek2);
  if (check16(expectedU2)) return ek2;

  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true if the PDF file has an Encrypt entry in its trailer.
 *
 * The file is loaded with `ignoreEncryption: true` so that even an
 * incorrectly password-protected or fully-locked PDF can be inspected without
 * pdf-lib throwing an EncryptedPDFError.
 *
 * @param file - The PDF file to inspect.
 * @returns `true` if the file is encrypted, `false` otherwise.
 */
export async function isPdfEncrypted(file: File): Promise<boolean> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  return !!pdfDoc.context.trailerInfo.Encrypt;
}

/** Bitmask granting all document permissions (PDF spec §7.6.3.2, Table 22). */
const ALL_PERMS = -4; // 0xFFFFFFFC — all permission bits set

/**
 * Add password protection to a PDF.
 *
 * Always uses AES-256 / V=5 / R=5 encryption (PDF 1.7 Extension Level 3).
 * All document permissions are preserved — only the open password is added.
 * Processing happens entirely in the browser; no data is uploaded.
 *
 * ## What happens internally
 *
 * 1. Load the PDF normally (unencrypted input assumed).
 * 2. Generate a random 32-byte document encryption key and all V5 Encrypt
 *    entries via buildEncDataV5().
 * 3. Walk every PDFRawStream and encrypt its bytes in-place using
 *    encryptStreamContent() with V=5 (AES-CBC, random IV per stream).
 *    The stream's /Length entry is updated to match the new encrypted output size
 *    (AES-CBC with PKCS7 adds up to 16 bytes of padding + 16-byte IV).
 * 4. Build and register the /Encrypt dictionary in the trailer.
 * 5. Generate a random 16-byte file ID and write it as the /ID array.
 * 6. Save with `useObjectStreams: false` so pdf-lib does not create any new
 *    compressed object streams during serialization that we haven't encrypted.
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
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  if (pdfDoc.context.trailerInfo.Encrypt) {
    throw new Error(
      "This PDF is already encrypted. Remove the existing password first before adding a new one.",
    );
  }
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
    // pdf-lib exposes `contents` as a readonly-ish property; the cast bypasses that
    (obj as unknown as { contents: Uint8Array }).contents = encrypted;
    obj.dict.set(PDFName.of("Length"), PDFNumber.of(encrypted.length));
  }

  // Build and register the /Encrypt dictionary (PDF spec §7.6.4, Table 20/28)
  const encDict = PDFDict.withContext(ctx);
  encDict.set(PDFName.of("Filter"), PDFName.of("Standard")); // standard security handler
  encDict.set(PDFName.of("V"), PDFNumber.of(5)); // algorithm version: AES-256
  encDict.set(PDFName.of("R"), PDFNumber.of(5)); // revision
  encDict.set(PDFName.of("Length"), PDFNumber.of(256)); // key length in bits
  encDict.set(PDFName.of("P"), PDFNumber.of(ALL_PERMS)); // permissions flags
  encDict.set(PDFName.of("O"), PDFHexString.of(toHex(O)));
  encDict.set(PDFName.of("OE"), PDFHexString.of(toHex(OE)));
  encDict.set(PDFName.of("U"), PDFHexString.of(toHex(U)));
  encDict.set(PDFName.of("UE"), PDFHexString.of(toHex(UE)));
  encDict.set(PDFName.of("Perms"), PDFHexString.of(toHex(Perms)));
  // CF (crypt filter) declares the algorithm used for streams and strings
  encDict.set(
    PDFName.of("CF"),
    ctx.obj({ StdCF: { AuthEvent: "DocOpen", CFM: "AESV3", Length: 32 } }),
  );
  encDict.set(PDFName.of("StmF"), PDFName.of("StdCF")); // stream crypt filter
  encDict.set(PDFName.of("StrF"), PDFName.of("StdCF")); // string crypt filter

  ctx.trailerInfo.Encrypt = ctx.register(encDict);

  // File ID — two identical 16-byte random values (PDF spec §14.4).
  // The spec recommends two *different* values (original and current), but
  // all major viewers accept two identical values for a freshly-encrypted file.
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
 * ## What happens internally
 *
 * 1. Load with `ignoreEncryption: true` — gives access to the raw encrypted
 *    stream bytes and the /Encrypt dict without pdf-lib throwing.
 * 2. Read /V and /R from the Encrypt dict to pick the right algorithm.
 * 3. Verify the password and recover the document key:
 *    - V=5: verifyPasswordV5()
 *    - V=1/2/4: verifyPasswordLegacy()
 * 4. Walk every PDFRawStream and decrypt its bytes in-place.
 * 5. Delete the /Encrypt entry from the trailer — the saved PDF will have
 *    no encryption headers and no /Encrypt dict.
 *
 * @param file     - The password-protected PDF file.
 * @param password - The user (open) or owner password for the document.
 * @returns Unprotected PDF bytes.
 * @throws If the password is incorrect or the encryption version is unsupported.
 */
export async function unlockPdf(file: File, password: string): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  // ignoreEncryption: true loads the document without throwing EncryptedPDFError,
  // giving us access to the raw (still-encrypted) stream bytes and the Encrypt dict.
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const ctx = pdfDoc.context;

  const encryptRef = ctx.trailerInfo.Encrypt;
  if (!encryptRef) return pdfDoc.save(); // not encrypted — return as-is

  // Parse the Encrypt dictionary
  const encDict = ctx.lookup(encryptRef, PDFDict);
  const V = (encDict.get(PDFName.of("V")) as PDFNumber).asNumber();
  const R = (encDict.get(PDFName.of("R")) as PDFNumber).asNumber();
  const P = (encDict.get(PDFName.of("P")) as PDFNumber).asNumber();
  const O = getBinaryBytes(encDict.get(PDFName.of("O")));
  const U = getBinaryBytes(encDict.get(PDFName.of("U")));

  let encKey: Uint8Array | null;

  if (V === 5) {
    // AES-256 (R=5): password verified via SHA-256 hashes; key unwrapped from UE/OE
    const OE = getBinaryBytes(encDict.get(PDFName.of("OE")));
    const UE = getBinaryBytes(encDict.get(PDFName.of("UE")));
    encKey = await verifyPasswordV5(password, U, UE, O, OE);
  } else if (V >= 1 && V <= 4) {
    // Legacy RC4/AES-128: key derived via iterated MD5 + RC4 password check
    const keyBits = V === 1 ? 40 : 128;
    // Extract the first element of the /ID array — needed for key derivation
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
    if (contents.length === 0) continue; // skip empty streams
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
