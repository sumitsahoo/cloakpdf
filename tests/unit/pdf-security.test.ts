/**
 * Smoke tests for the encrypted-PDF gate.
 *
 * `isPdfEncrypted` is the gatekeeper that every PDF-input tool runs
 * before touching a user-dropped file (via `usePdfFile`'s built-in
 * guard) — getting it wrong on either side regresses to one of two
 * bad UX outcomes: the raw "EncryptedPDFError" surfacing in the tool,
 * or unencrypted files being mistakenly redirected to PDF Password.
 *
 * The cryptographic correctness of `protectPdf` / `unlockPdf` is
 * already exercised in real browsers by the e2e suite; here we just
 * pin the detection helper and the typed error shape.
 */
import { PDFDocument } from "@pdfme/pdf-lib";
import { describe, expect, it } from "vitest";
import { EncryptedPdfError, isPdfEncrypted, protectPdf } from "../../src/utils/pdf-security.ts";

/**
 * Build a one-page PDF in memory and wrap it in a `File` so the helper
 * sees the same shape it would from a browser upload. Returned as a
 * function so each test gets a fresh File (the underlying ArrayBuffer
 * is consumed by `arrayBuffer()` calls internally).
 */
async function makeBlankPdfFile(name = "blank.pdf"): Promise<File> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  const bytes = await doc.save();
  return new File([bytes], name, { type: "application/pdf" });
}

describe("isPdfEncrypted", () => {
  it("returns false for a freshly-generated unencrypted PDF", async () => {
    const file = await makeBlankPdfFile();
    await expect(isPdfEncrypted(file)).resolves.toBe(false);
  });

  it("returns true after protectPdf wraps the same bytes with AES-256", async () => {
    const file = await makeBlankPdfFile();
    const encryptedBytes = await protectPdf(file, "hunter2");
    // `Uint8Array<ArrayBufferLike>` (from pdf-lib's save()) needs the
    // explicit `BlobPart` cast — `ArrayBufferLike` covers both regular
    // and shared buffers, and only the former satisfies `BlobPart`.
    const encryptedFile = new File([encryptedBytes as BlobPart], "protected.pdf", {
      type: "application/pdf",
    });
    await expect(isPdfEncrypted(encryptedFile)).resolves.toBe(true);
  });
});

describe("EncryptedPdfError", () => {
  it("carries the offending file so the UI can render its name + size", () => {
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "locked.pdf", {
      type: "application/pdf",
    });
    const err = new EncryptedPdfError(file);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("EncryptedPdfError");
    expect(err.file).toBe(file);
    expect(err.message).toMatch(/password-protected/i);
  });

  it("is structurally identifiable across module boundaries (no instanceof drift)", () => {
    // Tools that catch this can either `instanceof` check or string-match
    // `err.name`. Both must keep working — locking the contract here.
    const err = new EncryptedPdfError(new File([], "x.pdf"));
    expect(err.name).toBe("EncryptedPdfError");
    expect(err instanceof EncryptedPdfError).toBe(true);
  });
});
