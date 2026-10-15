import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExtractTextFromBuffer = vi.fn();

vi.mock("@/lib/services/extract-document-text", () => ({
  extractTextFromBuffer: (...args: unknown[]) => mockExtractTextFromBuffer(...args),
}));

import { extractTextFromPdfBuffer } from "@/lib/utils/pdf-text";

describe("extractTextFromPdfBuffer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to extractTextFromBuffer with PDF mime and resume filename", async () => {
    mockExtractTextFromBuffer.mockResolvedValue("Hello World from PDF");

    const buffer = Buffer.from("fake-pdf-data");
    const result = await extractTextFromPdfBuffer(buffer);

    expect(mockExtractTextFromBuffer).toHaveBeenCalledTimes(1);
    expect(mockExtractTextFromBuffer).toHaveBeenCalledWith(buffer, "application/pdf", "resume.pdf");
    expect(result).toBe("Hello World from PDF");
  });

  it("returns empty string when extractTextFromBuffer returns empty", async () => {
    mockExtractTextFromBuffer.mockResolvedValue("");

    const result = await extractTextFromPdfBuffer(Buffer.from("data"));

    expect(result).toBe("");
  });

  it("converts non-Buffer to Buffer and still calls extractTextFromBuffer", async () => {
    mockExtractTextFromBuffer.mockResolvedValue("ok");
    const uint8 = new Uint8Array([1, 2, 3]);

    await extractTextFromPdfBuffer(uint8 as unknown as Buffer);

    expect(mockExtractTextFromBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      "application/pdf",
      "resume.pdf",
    );
  });

  it("propagates errors from extractTextFromBuffer", async () => {
    mockExtractTextFromBuffer.mockRejectedValue(new Error("parse failed"));

    await expect(extractTextFromPdfBuffer(Buffer.from("bad"))).rejects.toThrow("parse failed");
  });
});
