/**
 * Fetch resume file from storage and extract plain text for scoring.
 * Used when candidate.cv_raw_text is missing so we still score from the actual document.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractTextFromBuffer } from "@/lib/services/extract-document-text";
import { logger } from "@/lib/observability/logger";

const CANDIDATE_CVS_BUCKET = "candidate-cvs";
const RESUMES_BUCKET = "resumes";

/** Extract storage path from a Supabase storage public URL. */
function pathFromStorageUrl(url: string, bucket: string): string | null {
  const marker = `/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const after = url.slice(i + marker.length);
  const path = after.split("?")[0].trim();
  return path || null;
}

function mimeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".doc")) return "application/msword";
  return "application/pdf";
}

export interface CandidateWithResumeUrl {
  id: string;
  resume_url?: string | null;
  cv_url?: string | null;
}

export interface FetchResumeResult {
  buffer: Buffer;
  mime: string;
  fileName: string;
}

/**
 * Download the candidate's resume from storage and return the raw buffer.
 * Supports PDF and Word (.docx, .doc) for tier 1 extraction and PDF vision fallback.
 * Returns null if no URL or download fails.
 */
export async function fetchResumeBufferFromStorage(
  supabase: SupabaseClient,
  candidate: CandidateWithResumeUrl,
): Promise<FetchResumeResult | null> {
  const url = candidate.cv_url ?? candidate.resume_url ?? null;
  if (!url || typeof url !== "string" || !url.trim()) return null;

  let bucket: string;
  let path: string | null = pathFromStorageUrl(url, CANDIDATE_CVS_BUCKET);
  if (path) {
    bucket = CANDIDATE_CVS_BUCKET;
  } else {
    path = pathFromStorageUrl(url, RESUMES_BUCKET);
    bucket = path ? RESUMES_BUCKET : "";
  }
  if (!path) return null;

  const mime = mimeFromPath(path);
  const lower = path.toLowerCase();
  const supported = mime === "application/pdf" || lower.endsWith(".docx") || lower.endsWith(".doc");
  if (!supported) return null;

  try {
    const { data: fileData, error } = await supabase.storage.from(bucket).download(path);

    if (error || !fileData) {
      logger.warn("[fetch-resume-buffer] Storage download failed", {
        candidateId: candidate.id,
        bucket,
        path: path.slice(0, 80),
        error: error?.message ?? "no data",
      });
      return null;
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = path.split("/").pop() ?? "resume.pdf";
    return { buffer, mime, fileName };
  } catch (err) {
    logger.warn("[fetch-resume-buffer] Download failed", {
      candidateId: candidate.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Download the candidate's resume from storage and extract text.
 * Supports candidate-cvs (agency uploads) and resumes buckets.
 * Returns null if no URL, download fails, or text extraction fails.
 */
export async function fetchResumeTextFromStorage(
  supabase: SupabaseClient,
  candidate: CandidateWithResumeUrl,
): Promise<string | null> {
  const url = candidate.cv_url ?? candidate.resume_url ?? null;
  if (!url || typeof url !== "string" || !url.trim()) return null;

  let bucket: string;
  let path: string | null = pathFromStorageUrl(url, CANDIDATE_CVS_BUCKET);
  if (path) {
    bucket = CANDIDATE_CVS_BUCKET;
  } else {
    path = pathFromStorageUrl(url, RESUMES_BUCKET);
    bucket = path ? RESUMES_BUCKET : "";
  }
  if (!path) return null;

  try {
    const { data: fileData, error } = await supabase.storage.from(bucket).download(path);

    if (error || !fileData) {
      logger.warn("[fetch-resume-text] Storage download failed", {
        candidateId: candidate.id,
        bucket,
        path: path.slice(0, 80),
        error: error?.message ?? "no data",
      });
      return null;
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mime = mimeFromPath(path);
    const fileName = path.split("/").pop() ?? "resume.pdf";
    const text = await extractTextFromBuffer(buffer, mime, fileName);
    const trimmed = text?.trim();
    if (!trimmed || trimmed.length < 50) {
      logger.warn("[fetch-resume-text] Extracted text too short", {
        candidateId: candidate.id,
        length: trimmed?.length ?? 0,
      });
      return null;
    }
    logger.info("[fetch-resume-text] Fetched resume text from storage", {
      candidateId: candidate.id,
      length: trimmed.length,
    });
    return trimmed.slice(0, 100_000);
  } catch (err) {
    logger.warn("[fetch-resume-text] Extract failed", {
      candidateId: candidate.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
