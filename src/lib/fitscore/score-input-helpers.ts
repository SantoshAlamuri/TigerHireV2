/**
 * Build resume/JD input for hybrid FitScore from job + candidate.
 * Resume text uses the 3-tier parse chain (pdfjs → Haiku → Sonnet vision).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildJdText, type JobForJdText } from "./job-text";
import { fetchResumeBufferFromStorage, fetchResumeTextFromStorage } from "./v3/fetch-resume-text";
import { validateResumeText } from "./resume-validation";
import type { FitScoreStage0Meta } from "./three-stage/types";
import { computeParseQualityScore } from "./parse-quality";
import { logger } from "@/lib/observability/logger";
import { insertFitscoreExtractionLog } from "./fitscore-extraction-log";
import type { FitScoreScoringSource } from "./scoring-source";
import { runResumeParseChain, type ResumeParseMethod } from "./resume-parse-chain";
import { isVisionFallbackEnabled } from "./resume-parse-config";

const MIN_RESUME_LENGTH = 100;
const MIN_RESUME_LENGTH_MEDIUM = 300;

const RESUME_MARKER = "\n--- Resume/CV text ---\n";

/** @deprecated Use {@link isVisionFallbackEnabled} from resume-parse-config (tier 3 gate). */
export { isVisionFallbackEnabled };

/** Resume body chars at or above this skip tier 3 vision (see RESUME_PARSE_MIN_CHARS). */
export const VISION_SKIP_MIN_BODY_CHARS = 2000;

/** @deprecated Tier chain handles skip logic; kept for existing tests. */
export function shouldSkipVisionFallback(bodyChars: number, parseQualityScore: number): boolean {
  return bodyChars >= VISION_SKIP_MIN_BODY_CHARS || parseQualityScore >= 0.7;
}

export interface ScoreInput {
  job_id: string;
  jd_text: string;
  candidate_id: string;
  resume_text: string;
  parse_method: string;
  parse_quality: string;
  profile_completeness: number;
  parse_quality_score: number;
  stage0_meta: FitScoreStage0Meta;
  resume_parse_tier?: number;
}

export interface CandidateForScoreInput {
  id: string;
  name?: string | null;
  full_name?: string | null;
  skills?: string[] | null;
  experience_years?: number | null;
  location?: string | null;
  current_role?: string | null;
  current_company?: string | null;
  cv_raw_text?: string | null;
  resume_url?: string | null;
  cv_url?: string | null;
}

export function resumeBodyForQuality(fullText: string): string {
  const i = fullText.indexOf(RESUME_MARKER);
  if (i >= 0) return fullText.slice(i + RESUME_MARKER.length).trim();
  return fullText.trim();
}

function buildResumeEnvelope(candidate: CandidateForScoreInput, cvBody: string): string {
  const displayName = candidate.name ?? candidate.full_name ?? "Candidate";
  let text = `Name: ${displayName}\n`;
  text += `Skills: ${candidate.skills?.join(", ") || "Not available"}\n`;
  text += `Experience: ${candidate.experience_years ?? "Unknown"} years\n`;
  text += `Location: ${candidate.location ?? "Not specified"}\n`;
  if (candidate.current_role) text += `Current role: ${candidate.current_role}\n`;
  if (candidate.current_company) text += `Current company: ${candidate.current_company}\n`;
  text += `${RESUME_MARKER}${cvBody}`;
  return text.trim();
}

function deriveProfileCompleteness(
  candidate: CandidateForScoreInput,
  resumeText: string,
  parseQuality: string,
): number {
  const len = resumeText.trim().length;
  let score = 0;
  if (candidate.name?.trim() || candidate.full_name?.trim()) score += 15;
  if ((candidate.skills?.length ?? 0) > 0) score += 20;
  if (candidate.experience_years != null) score += 15;
  if (len >= 500) score += 30;
  else if (len >= MIN_RESUME_LENGTH_MEDIUM) score += 20;
  else if (len >= MIN_RESUME_LENGTH) score += 10;
  if (parseQuality === "high") score += 20;
  else if (parseQuality === "medium") score += 10;
  return Math.min(100, score);
}

async function getResumeText(
  supabase: SupabaseClient,
  candidate: CandidateForScoreInput,
  options?: { scoringSource?: FitScoreScoringSource },
): Promise<{
  resume_text: string;
  parse_method: ResumeParseMethod;
  pdfBuffer: Buffer | null;
  fileBuffer: Buffer | null;
  fileName?: string;
  mimeType?: string;
  /** When true, skip tier chain — text already extracted (tryout fast path). */
  skipParseChain?: boolean;
}> {
  const cvRaw = candidate.cv_raw_text?.trim().slice(0, 14_000) ?? "";
  const tryoutFastPath = options?.scoringSource === "tryout" && cvRaw.length >= MIN_RESUME_LENGTH;

  if (tryoutFastPath) {
    return {
      resume_text: buildResumeEnvelope(candidate, cvRaw),
      parse_method: "text",
      pdfBuffer: null,
      fileBuffer: null,
      skipParseChain: true,
    };
  }

  const fileFetch = await fetchResumeBufferFromStorage(supabase, candidate);
  const pdfBuffer = fileFetch?.mime === "application/pdf" ? (fileFetch.buffer ?? null) : null;
  const fileBuffer = fileFetch?.buffer ?? null;
  const fileName = fileFetch?.fileName;
  const mimeType = fileFetch?.mime;

  if (cvRaw.length >= MIN_RESUME_LENGTH) {
    const url = (candidate.cv_url ?? candidate.resume_url ?? "").toLowerCase();
    const method: ResumeParseMethod = url.includes(".docx")
      ? "docx"
      : url.endsWith(".pdf")
        ? "pdfjs"
        : "text";
    return {
      resume_text: buildResumeEnvelope(candidate, cvRaw),
      parse_method: method,
      pdfBuffer,
      fileBuffer,
      fileName,
      mimeType,
    };
  }

  const fromStorage = await fetchResumeTextFromStorage(supabase, {
    id: candidate.id,
    resume_url: candidate.resume_url,
    cv_url: candidate.cv_url,
  });

  if (fromStorage && fromStorage.length >= MIN_RESUME_LENGTH) {
    const url = (candidate.cv_url ?? candidate.resume_url ?? "").toLowerCase();
    const docMethod: ResumeParseMethod = url.includes(".docx")
      ? "docx"
      : url.endsWith(".doc")
        ? "text"
        : "pdfjs";
    return {
      resume_text: buildResumeEnvelope(candidate, fromStorage.slice(0, 100_000)),
      parse_method: docMethod,
      pdfBuffer,
      fileBuffer,
      fileName,
      mimeType,
    };
  }

  const fallback = cvRaw.length > 0 ? cvRaw : (fromStorage ?? "No resume text available.");
  const url = (candidate.cv_url ?? candidate.resume_url ?? "").toLowerCase();
  return {
    resume_text: fallback,
    parse_method: cvRaw.length > 0 ? "text" : url.includes(".docx") ? "docx" : "pdfjs",
    pdfBuffer,
    fileBuffer,
    fileName,
    mimeType,
  };
}

export const NO_RESUME_TEXT_MESSAGE =
  "Candidate has no resume text available for scoring. Ask them to upload a resume or ensure the resume was parsed successfully.";

export async function buildScoreInput(
  supabase: SupabaseClient,
  jobId: string,
  job: JobForJdText,
  candidateId: string,
  candidate: CandidateForScoreInput,
  options?: { scoringSource?: FitScoreScoringSource },
): Promise<ScoreInput> {
  const jd_text = buildJdText(job);
  let { resume_text, parse_method, pdfBuffer, fileBuffer, fileName, mimeType, skipParseChain } =
    await getResumeText(supabase, candidate, options);

  const effectiveLength = resume_text.trim().length;
  if (effectiveLength < MIN_RESUME_LENGTH || resume_text.trim() === "No resume text available.") {
    await insertFitscoreExtractionLog(supabase, {
      candidate_id: candidateId,
      job_id: jobId,
      event_type: "parse_error",
      failure_reason: "no_usable_resume_text",
      failure_detail: `length: ${effectiveLength}`,
    });
    throw new Error(NO_RESUME_TEXT_MESSAGE);
  }

  const bodyBeforeChain = resumeBodyForQuality(resume_text);
  let chainTier = 1;
  if (!skipParseChain) {
    const chain = await runResumeParseChain({
      pdfjsText: bodyBeforeChain,
      fileBuffer,
      fileName,
      mimeType,
      pdfBuffer,
      initialMethod: parse_method,
      maxTier: options?.scoringSource === "tryout" ? 1 : undefined,
      attribution: {
        jobId,
        candidateId,
        organisationId: job.organisation_id ?? undefined,
        scoringSource: options?.scoringSource,
      },
    });

    if (chain.text.length > 0) {
      resume_text = buildResumeEnvelope(candidate, chain.text.slice(0, 100_000));
      parse_method = chain.parse_method;
    }
    chainTier = chain.tier;
  }

  const body = resumeBodyForQuality(resume_text);
  const parse_quality_score = computeParseQualityScore(body);
  const stage0_meta: FitScoreStage0Meta = {
    resume_format:
      parse_method === "pdfjs" || parse_method === "vision"
        ? "pdf"
        : parse_method === "docx"
          ? "docx"
          : parse_method === "text" || parse_method === "haiku"
            ? "text"
            : null,
  };

  const qualityResult = validateResumeText(resume_text);
  const parse_quality = qualityResult.quality;
  const profile_completeness = deriveProfileCompleteness(candidate, resume_text, parse_quality);

  if (chainTier >= 3) {
    logger.info("[buildScoreInput] Resume resolved via tier 3 vision", {
      candidateId,
      jobId,
      tier: chainTier,
    });
  }

  return {
    job_id: jobId,
    jd_text,
    candidate_id: candidateId,
    resume_text,
    parse_method,
    parse_quality,
    profile_completeness,
    parse_quality_score,
    stage0_meta,
    resume_parse_tier: chainTier,
  };
}
