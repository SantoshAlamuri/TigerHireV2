import { extractTextFromFile, inferMimeFromName } from "@/lib/services/extract-document-text";
import { logger } from "@/lib/observability/logger";
import type { DemoCandidate } from "@/lib/agents/demo-candidates";

/**
 * Converts uploaded CV files from the homepage demo into transient
 * DemoCandidate entries. Everything stays in memory — nothing is written to
 * storage or the database; text is clamped and used only for the scoring call.
 */

export const DEMO_UPLOAD_MAX_FILES = 10;
export const DEMO_UPLOAD_MAX_BYTES = 2 * 1024 * 1024; // 2 MB per file
const MAX_RESUME_CHARS = 8000;

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
]);

export class DemoUploadError extends Error {}

function displayName(filename: string, index: number): string {
  const base = filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
  return base.length >= 2 ? base.slice(0, 60) : `Candidate ${index + 1}`;
}

function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "C";
  const second = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : (parts[0]?.[1] ?? "");
  return `${first}${second}`.toUpperCase();
}

/** Strips control characters that PDF extraction sometimes leaves behind. */
function sanitize(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim();
}

export async function parseDemoUploads(formData: FormData): Promise<DemoCandidate[]> {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    throw new DemoUploadError("Attach at least one CV file (PDF, DOCX or TXT).");
  }
  if (files.length > DEMO_UPLOAD_MAX_FILES) {
    throw new DemoUploadError(`The demo scores at most ${DEMO_UPLOAD_MAX_FILES} CVs at a time.`);
  }

  const candidates: DemoCandidate[] = [];
  for (const [index, file] of files.entries()) {
    if (file.size === 0) throw new DemoUploadError(`"${file.name}" is empty.`);
    if (file.size > DEMO_UPLOAD_MAX_BYTES) {
      throw new DemoUploadError(`"${file.name}" is over 2 MB — export a lighter copy and retry.`);
    }
    const type = (file.type && file.type.trim()) || inferMimeFromName(file.name) || "";
    if (!ALLOWED_TYPES.has(type)) {
      throw new DemoUploadError(`"${file.name}" isn't a PDF, DOCX or TXT file.`);
    }
    let text: string;
    try {
      text = sanitize(await extractTextFromFile(file));
    } catch (err) {
      logger.warn("demo_upload_extract_failed", { filename: file.name, error: String(err) });
      throw new DemoUploadError(
        `Couldn't read text from "${file.name}" — it may be a scanned image. Try a text-based PDF.`,
      );
    }
    if (text.length < 80) {
      throw new DemoUploadError(
        `"${file.name}" has too little readable text to score — it may be a scanned image.`,
      );
    }
    const name = displayName(file.name, index);
    candidates.push({
      id: `upload-${index}`,
      name,
      initials: initialsOf(name),
      headline: "Uploaded CV",
      resume: text.slice(0, MAX_RESUME_CHARS),
    });
  }
  return candidates;
}
