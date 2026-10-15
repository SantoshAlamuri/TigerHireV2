import { describe, it, expect, vi } from "vitest";

// Mock pdfjs-dist to prevent side effects during import
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
}));

vi.mock("pdf-parse", () => ({
  PDFParse: vi.fn(),
}));

vi.mock("mammoth", () => ({
  extractRawText: vi.fn(),
}));

import {
  detectMimeFromBuffer,
  inferMimeFromName,
  extractTextFromBuffer,
  ALLOWED_JD_TYPES,
  MAX_JD_FILE_SIZE,
} from "@/lib/services/extract-document-text";

describe("extractDocumentText", () => {
  describe("detectMimeFromBuffer", () => {
    it("detects PDF from magic bytes", () => {
      const pdfBuffer = Buffer.from("%PDF-1.4 some content here");
      const result = detectMimeFromBuffer(pdfBuffer, "unknown.bin");
      expect(result).toBe("application/pdf");
    });

    it("detects DOCX from ZIP magic bytes (PK)", () => {
      const zipBuffer = Buffer.alloc(100);
      zipBuffer.write("PK", 0); // ZIP magic bytes used by DOCX
      const result = detectMimeFromBuffer(zipBuffer, "unknown.bin");
      expect(result).toBe(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
    });

    it("detects DOC from OLE magic bytes", () => {
      const oleBuffer = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x00, 0x00, 0x00, 0x00]);
      const result = detectMimeFromBuffer(oleBuffer, "unknown.bin");
      expect(result).toBe("application/msword");
    });

    it("falls back to filename for unknown magic bytes", () => {
      const randomBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      const result = detectMimeFromBuffer(randomBuffer, "document.pdf");
      expect(result).toBe("application/pdf");
    });

    it("returns null for unknown format and unknown filename", () => {
      const randomBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      const result = detectMimeFromBuffer(randomBuffer, "file.xyz");
      expect(result).toBeNull();
    });

    it("handles empty buffer with filename fallback", () => {
      const emptyBuffer = Buffer.alloc(0);
      const result = detectMimeFromBuffer(emptyBuffer, "resume.docx");
      expect(result).toBe(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
    });

    it("prioritizes magic bytes over filename", () => {
      // PDF magic bytes but .docx filename -- magic bytes should win
      const pdfBuffer = Buffer.from("%PDF-1.7 fake content");
      const result = detectMimeFromBuffer(pdfBuffer, "resume.docx");
      expect(result).toBe("application/pdf");
    });
  });

  describe("inferMimeFromName", () => {
    it("infers PDF from .pdf extension", () => {
      expect(inferMimeFromName("resume.pdf")).toBe("application/pdf");
    });

    it("infers DOCX from .docx extension", () => {
      expect(inferMimeFromName("resume.docx")).toBe(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
    });

    it("infers DOC from .doc extension", () => {
      expect(inferMimeFromName("resume.doc")).toBe("application/msword");
    });

    it("infers TXT from .txt extension", () => {
      expect(inferMimeFromName("resume.txt")).toBe("text/plain");
    });

    it("returns null for unknown extension", () => {
      expect(inferMimeFromName("file.xyz")).toBeNull();
      expect(inferMimeFromName("file.jpg")).toBeNull();
      expect(inferMimeFromName("file.png")).toBeNull();
    });

    it("handles case-insensitive extensions", () => {
      expect(inferMimeFromName("RESUME.PDF")).toBe("application/pdf");
      expect(inferMimeFromName("Document.DOCX")).toBe(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      expect(inferMimeFromName("Notes.TXT")).toBe("text/plain");
    });

    it("returns null for empty string", () => {
      expect(inferMimeFromName("")).toBeNull();
    });

    it("handles filenames with multiple dots", () => {
      expect(inferMimeFromName("my.resume.final.pdf")).toBe("application/pdf");
    });
  });

  describe("extractTextFromBuffer", () => {
    it("extracts text from plain text buffer", async () => {
      const text = "This is a plain text resume with some content.";
      const buffer = Buffer.from(text, "utf-8");
      const result = await extractTextFromBuffer(buffer, "text/plain");
      expect(result).toBe(text);
    });

    it("extracts text from plain text buffer using filename fallback", async () => {
      const text = "Resume content here";
      const buffer = Buffer.from(text, "utf-8");
      const result = await extractTextFromBuffer(buffer, "", "resume.txt");
      expect(result).toBe(text);
    });

    it("throws for unsupported MIME type", async () => {
      const buffer = Buffer.from("some data");
      await expect(extractTextFromBuffer(buffer, "image/png", "photo.png")).rejects.toThrow(
        "Unsupported file type",
      );
    });

    it("throws for completely unknown type", async () => {
      const buffer = Buffer.from("data");
      await expect(extractTextFromBuffer(buffer, "", "unknown.xyz")).rejects.toThrow(
        "Unsupported file type",
      );
    });
  });

  describe("constants", () => {
    it("ALLOWED_JD_TYPES contains expected MIME types", () => {
      expect(ALLOWED_JD_TYPES).toContain("application/pdf");
      expect(ALLOWED_JD_TYPES).toContain(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      expect(ALLOWED_JD_TYPES).toContain("application/msword");
      expect(ALLOWED_JD_TYPES).toContain("text/plain");
    });

    it("MAX_JD_FILE_SIZE is 10MB", () => {
      expect(MAX_JD_FILE_SIZE).toBe(10 * 1024 * 1024);
    });
  });
});
