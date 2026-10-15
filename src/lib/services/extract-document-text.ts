import { MAX_STANDARD_UPLOAD_BYTES } from "@/lib/constants/upload-limits";

/**
 * Polyfill DOMMatrix for serverless environments (Vercel, Lambda) where
 * browser APIs are missing. pdfjs-dist requires this for text extraction.
 */
if (typeof globalThis.DOMMatrix === "undefined") {
  (globalThis as Record<string, unknown>).DOMMatrix = class DOMMatrix {
    m: number[] = [1, 0, 0, 1, 0, 0];
    constructor(init?: string | number[]) {
      if (Array.isArray(init)) this.m = init.slice(0, 6);
    }
    get a() {
      return this.m[0];
    }
    get b() {
      return this.m[1];
    }
    get c() {
      return this.m[2];
    }
    get d() {
      return this.m[3];
    }
    get e() {
      return this.m[4];
    }
    get f() {
      return this.m[5];
    }
    get is2D() {
      return true;
    }
    get isIdentity() {
      return (
        this.m[0] === 1 &&
        this.m[1] === 0 &&
        this.m[2] === 0 &&
        this.m[3] === 1 &&
        this.m[4] === 0 &&
        this.m[5] === 0
      );
    }
    inverse() {
      return new DOMMatrix();
    }
    multiply() {
      return new DOMMatrix(this.m);
    }
    scale() {
      return new DOMMatrix(this.m);
    }
    translate() {
      return new DOMMatrix(this.m);
    }
    transformPoint(p: { x?: number; y?: number } = {}) {
      return { x: p.x ?? 0, y: p.y ?? 0, z: 0, w: 1 };
    }
  };
}

/**
 * Configure pdf-parse's bundled worker explicitly. A no-op data URL breaks
 * pdfjs fake-worker setup in Node and causes every PDF extraction to fail.
 */
async function configurePdfjsWorker(): Promise<void> {
  try {
    const [{ PDFParse }, { getPath }] = await Promise.all([
      import("pdf-parse"),
      import("pdf-parse/worker"),
    ]);
    PDFParse.setWorker(getPath());
  } catch {
    // pdf-parse can still attempt its default worker resolution.
  }
}
const _pdfjsReady = configurePdfjsWorker();

/** Parse options for better line/table structure (resume-friendly). */
const PDF_PARSE_OPTIONS = {
  lineThreshold: 2.0,
  cellThreshold: 2.5,
  lineEnforce: true,
  cellSeparator: " | ",
  pageJoiner: "\n\n---PAGE BREAK---\n\n",
} as const;

/** Format pdf-parse TableResult as markdown so LLM sees structure. */
function formatTablesAsMarkdown(tableResult: {
  pages: Array<{ num: number; tables: string[][][] }>;
  mergedTables?: string[][];
}): string {
  const blocks: string[] = [];
  const seen = new Set<string>();

  for (const page of tableResult.pages ?? []) {
    for (const table of page.tables ?? []) {
      if (!table.length) continue;
      const key = table.map((r: string[]) => r.join("|")).join("\n");
      if (seen.has(key)) continue;
      seen.add(key);
      const rows = table.map((row) => "| " + row.join(" | ") + " |");
      if (rows.length > 0) {
        blocks.push(rows.join("\n"));
      }
    }
  }

  if (blocks.length === 0) return "";
  return "\n\n[Extracted tables]\n" + blocks.join("\n\n");
}

/**
 * Extract text and tables from a PDF buffer using pdf-parse (ParseParameters + getTable).
 * Single source of truth for resume/JD PDF extraction.
 */
async function extractPdfEnhanced(nodeBuffer: Buffer): Promise<string> {
  await _pdfjsReady;
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: nodeBuffer });
  try {
    const [textResult, tableResult] = await Promise.all([
      parser.getText(PDF_PARSE_OPTIONS),
      parser.getTable().catch(() => null),
    ]);
    // pdf-parse getText returns TextResult with .text; guard against API drift
    const rawText =
      textResult != null && typeof textResult === "object" && "text" in textResult
        ? (textResult as { text?: string }).text
        : typeof textResult === "string"
          ? textResult
          : "";
    const text = (rawText ?? "").trim();
    type TableInput = Parameters<typeof formatTablesAsMarkdown>[0];
    const tableMd =
      tableResult && (tableResult.pages?.length > 0 || (tableResult.mergedTables?.length ?? 0) > 0)
        ? formatTablesAsMarkdown(tableResult as unknown as TableInput)
        : "";
    return tableMd ? `${text}${tableMd}` : text;
  } finally {
    await parser.destroy();
  }
}

/**
 * Extract plain text from PDF, DOCX, or TXT for JD/resume parsing.
 */

/** PDF magic bytes; DOCX is ZIP (PK..); DOC is OLE. */
const PDF_MAGIC = Buffer.from("%PDF", "utf-8");
const ZIP_MAGIC = Buffer.from("PK", "utf-8");
/** Microsoft Compound Document (OLE) magic for .doc */
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);

function bufferStartsWith(buf: Buffer, magic: Buffer): boolean {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.length >= magic.length && b.subarray(0, magic.length).equals(magic);
}

/**
 * Detect MIME from file content (magic bytes). Use for server-side validation
 * when client-provided file.type cannot be trusted. Returns null if unknown.
 */
export function detectMimeFromBuffer(buffer: Buffer, filename: string): string | null {
  const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (b.length >= PDF_MAGIC.length && bufferStartsWith(b, PDF_MAGIC)) return "application/pdf";
  if (b.length >= ZIP_MAGIC.length && bufferStartsWith(b, ZIP_MAGIC))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (b.length >= OLE_MAGIC.length && bufferStartsWith(b, OLE_MAGIC)) return "application/msword";
  return inferMimeFromName(filename);
}

export const ALLOWED_JD_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
] as const;

/** JD upload limit — same as `MAX_STANDARD_UPLOAD_BYTES`. Confirm host request body limits allow this. */
export const MAX_JD_FILE_SIZE = MAX_STANDARD_UPLOAD_BYTES;

/** Infer MIME from filename when file.type is empty (common in server-side FormData). */
export function inferMimeFromName(filename: string): string | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".txt")) return "text/plain";
  return null;
}

function getEffectiveMimeType(file: File): string {
  return file.type || inferMimeFromName(file.name || "") || "";
}

export async function extractTextFromFile(file: File): Promise<string> {
  const type = getEffectiveMimeType(file);

  if (type === "text/plain") {
    return file.text();
  }

  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    type === "application/msword"
  ) {
    const arrayBuffer = await file.arrayBuffer();
    const nodeBuffer = Buffer.from(arrayBuffer);
    if (bufferStartsWith(nodeBuffer, PDF_MAGIC)) {
      try {
        return await extractPdfEnhanced(Buffer.from(arrayBuffer));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to extract text from PDF: ${msg}`);
      }
    }
    if (
      type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
      !bufferStartsWith(nodeBuffer, ZIP_MAGIC)
    ) {
      throw new Error(
        "File does not look like a valid Word document (.docx). It may be a PDF with .docx extension — try saving or uploading as PDF.",
      );
    }
    try {
      const { extractDocxPlainText } = await import("@/lib/services/docx-extract");
      return await extractDocxPlainText(nodeBuffer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("end of central directory") ||
        msg.includes("is this a zip") ||
        msg.includes("zip file")
      ) {
        throw new Error(
          "File is not a valid Word document (.docx). It may be corrupted or a PDF with .docx extension. Try uploading as PDF or re-saving as .docx.",
        );
      }
      throw new Error(`Failed to extract text from Word document: ${msg}`);
    }
  }

  if (type === "application/pdf") {
    try {
      const buffer = await file.arrayBuffer();
      return await extractPdfEnhanced(Buffer.from(buffer));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to extract text from PDF: ${msg}`);
    }
  }

  throw new Error(`Unsupported file type. Use PDF, DOCX, DOC, or TXT.`);
}

/**
 * Extract plain text from a buffer (PDF or Word). Used by API routes that receive
 * FormData and pass buffers to agents (e.g. agency upload-profile).
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
  fileName: string = "",
): Promise<string> {
  const type = mimeType || inferMimeFromName(fileName) || "";

  if (type === "text/plain") {
    const nodeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    return nodeBuffer.toString("utf-8");
  }

  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    type === "application/msword"
  ) {
    const nodeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    // Mislabeled PDF (e.g. .docx extension but actual PDF): try PDF extraction
    if (bufferStartsWith(nodeBuffer, PDF_MAGIC)) {
      try {
        return await extractPdfEnhanced(nodeBuffer);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("defineProperty") || msg.includes("non-object")) {
          throw new Error(
            "PDF_PARSE_ERROR: PDF may be corrupted, password-protected, or image-only (no selectable text). Try a different file or OCR.",
          );
        }
        throw new Error(`Failed to extract text from PDF: ${msg}`);
      }
    }
    // .docx must be a ZIP; .doc (msword) is OLE. If not ZIP, mammoth will throw.
    if (
      type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
      !bufferStartsWith(nodeBuffer, ZIP_MAGIC)
    ) {
      throw new Error(
        "WORD_PARSE_ERROR: File does not look like a valid Word document (.docx). It may be a PDF with .docx extension — try saving or uploading as PDF, or use a proper .docx file.",
      );
    }
    try {
      const { extractDocxPlainText } = await import("@/lib/services/docx-extract");
      return await extractDocxPlainText(nodeBuffer);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("defineProperty") || msg.includes("non-object")) {
        throw new Error(
          "WORD_PARSE_ERROR: Document may be corrupted or in an unsupported format. Try saving as .docx or export as PDF.",
        );
      }
      if (
        msg.includes("end of central directory") ||
        msg.includes("is this a zip") ||
        msg.includes("zip file")
      ) {
        throw new Error(
          "WORD_PARSE_ERROR: File is not a valid Word document (.docx). It may be corrupted, or a PDF/other format with a .docx extension. Try uploading as PDF or re-saving the file as .docx.",
        );
      }
      throw new Error(`Failed to extract text from Word document: ${msg}`);
    }
  }

  if (type === "application/pdf") {
    try {
      const nodeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      return await extractPdfEnhanced(nodeBuffer);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("defineProperty") || msg.includes("non-object")) {
        throw new Error(
          "PDF_PARSE_ERROR: PDF may be corrupted, password-protected, or image-only (no selectable text). Try a different file or OCR.",
        );
      }
      if (msg.includes("Invalid") || msg.includes("corrupt")) {
        throw new Error(
          "PDF appears corrupted or invalid. Try re-saving the PDF or use a different file.",
        );
      }
      throw new Error(`Failed to extract text from PDF: ${msg}`);
    }
  }

  throw new Error(`Unsupported file type. Use PDF, DOCX, or DOC.`);
}
