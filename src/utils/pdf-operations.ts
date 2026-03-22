import { PDFDocument, rgb, degrees, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { PageRange, WatermarkOptions, Position } from "../types.ts";

export async function mergePdfs(files: File[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await PDFDocument.load(arrayBuffer);
    const pages = await merged.copyPages(pdf, pdf.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }

  return merged.save();
}

export async function splitPdf(file: File, ranges: PageRange[]): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const source = await PDFDocument.load(arrayBuffer);
  const result = await PDFDocument.create();

  const pageIndices: number[] = [];
  for (const range of ranges) {
    for (let i = range.start; i <= range.end && i <= source.getPageCount(); i++) {
      if (!pageIndices.includes(i - 1)) {
        pageIndices.push(i - 1);
      }
    }
  }

  const copiedPages = await result.copyPages(source, pageIndices);
  for (const page of copiedPages) {
    result.addPage(page);
  }

  return result.save();
}

export async function compressPdf(file: File): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);

  // Strip metadata to reduce size
  pdf.setTitle("");
  pdf.setAuthor("");
  pdf.setSubject("");
  pdf.setKeywords([]);
  pdf.setProducer("");
  pdf.setCreator("");

  return pdf.save({
    useObjectStreams: true,
    addDefaultPage: false,
  });
}

export async function rotatePages(file: File, rotations: Map<number, number>): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);

  for (const [pageIndex, angle] of rotations) {
    const page = pdf.getPage(pageIndex);
    const currentRotation = page.getRotation().angle;
    page.setRotation(degrees(currentRotation + angle));
  }

  return pdf.save();
}

export async function deletePages(file: File, pageIndicesToDelete: number[]): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const source = await PDFDocument.load(arrayBuffer);
  const result = await PDFDocument.create();

  const keepIndices = source.getPageIndices().filter((i) => !pageIndicesToDelete.includes(i));

  const copiedPages = await result.copyPages(source, keepIndices);
  for (const page of copiedPages) {
    result.addPage(page);
  }

  return result.save();
}

export async function reorderPages(file: File, newOrder: number[]): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const source = await PDFDocument.load(arrayBuffer);
  const result = await PDFDocument.create();

  const copiedPages = await result.copyPages(source, newOrder);
  for (const page of copiedPages) {
    result.addPage(page);
  }

  return result.save();
}

export async function imagesToPdf(
  images: File[],
  pageSize: "a4" | "letter" | "fit" = "a4",
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();

  const pageDimensions: Record<string, [number, number]> = {
    a4: [595.28, 841.89],
    letter: [612, 792],
  };

  for (const imageFile of images) {
    const imageBytes = await imageFile.arrayBuffer();
    const uint8 = new Uint8Array(imageBytes);

    let image;
    if (imageFile.type === "image/png") {
      image = await pdf.embedPng(uint8);
    } else {
      image = await pdf.embedJpg(uint8);
    }

    let pageWidth: number;
    let pageHeight: number;

    if (pageSize === "fit") {
      pageWidth = image.width;
      pageHeight = image.height;
    } else {
      [pageWidth, pageHeight] = pageDimensions[pageSize];
    }

    const page = pdf.addPage([pageWidth, pageHeight]);

    // Scale image to fit within page while maintaining aspect ratio
    const scale = Math.min(pageWidth / image.width, pageHeight / image.height);
    const scaledWidth = image.width * scale;
    const scaledHeight = image.height * scale;

    page.drawImage(image, {
      x: (pageWidth - scaledWidth) / 2,
      y: (pageHeight - scaledHeight) / 2,
      width: scaledWidth,
      height: scaledHeight,
    });
  }

  return pdf.save();
}

export async function addWatermark(file: File, options: WatermarkOptions): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  pdf.registerFontkit(fontkit);

  const font = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(options.text, options.fontSize);
    const textHeight = font.heightAtSize(options.fontSize);

    page.drawText(options.text, {
      x: (width - textWidth) / 2,
      y: (height - textHeight) / 2,
      size: options.fontSize,
      font,
      color: rgb(options.color.r / 255, options.color.g / 255, options.color.b / 255),
      opacity: options.opacity,
      rotate: degrees(options.rotation),
    });
  }

  return pdf.save();
}

export async function addSignature(
  file: File,
  signatureDataUrl: string,
  pageIndex: number,
  position: Position,
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);

  // Convert data URL to Uint8Array
  const response = await fetch(signatureDataUrl);
  const signatureBytes = new Uint8Array(await response.arrayBuffer());

  const signatureImage = await pdf.embedPng(signatureBytes);
  const page = pdf.getPage(pageIndex);

  page.drawImage(signatureImage, {
    x: position.x,
    y: position.y,
    width: position.width,
    height: position.height,
  });

  return pdf.save();
}
