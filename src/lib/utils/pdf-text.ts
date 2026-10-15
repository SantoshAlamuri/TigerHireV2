/**
 * Extract plain text (and table structure) from a PDF buffer (Node.js).
 * Uses the same enhanced extraction as extract-document-text (ParseParameters + getTable).
 * Used by Scout agent for CV parse.
 */
export async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  const { extractTextFromBuffer } = await import("@/lib/services/extract-document-text");
  return extractTextFromBuffer(
    Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer),
    "application/pdf",
    "resume.pdf",
  );
}
