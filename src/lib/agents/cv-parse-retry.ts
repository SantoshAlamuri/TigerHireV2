import type { SupabaseClient } from "@supabase/supabase-js";
import { parseResumeFileWithClaude, type ResumeParseCostAttribution } from "@/lib/agents/cv-parser";
import {
  FitScoreService,
  numericOverallFromFitScoreServiceResult,
} from "@/lib/services/FitScoreService";
import { enqueuePendingJdApprovalPair, isJdBaseApproved } from "@/lib/fitscore/pending-jd-approval";
import { calculateGhostRiskScore } from "@/lib/agents/ghostbuster";
import { normalizePhoneForCandidate } from "@/lib/agents/candidate-dedup";
import { normalizeContactDetail } from "@/lib/candidates/normalize-contact-detail";
import { logger } from "@/lib/observability/logger";
import { NonRetriableError } from "inngest";
import { isNonRetriableCvParseError } from "@/lib/agents/cv-parse-repair";

export type CvParseRetryInput = {
  candidateId: string;
  jobId?: string | null;
  organisationId: string;
  source?: string | null;
};

export type CvParseRetryResult = {
  candidateId: string;
  /** True when the function exited early because the candidate was already parsed. */
  skipped?: boolean;
  skipReason?: "already_parsed" | "candidate_missing" | "no_cv_stored" | "download_failed";
  /** True when this run actually parsed and persisted. */
  parsed?: boolean;
  topScore?: number | null;
  jobsScored?: number;
};

/**
 * Strip a Supabase storage URL (public or signed) down to the bucket-relative path.
 * Mirrors the helper inside reprocess-candidate.ts so we don't need to re-upload to retry.
 */
function storagePathFromCvUrl(cvUrl: string): string {
  return cvUrl
    .replace(/^.*\/storage\/v1\/object\/(?:public|sign)\/candidate-cvs\//, "")
    .split("?")[0];
}

/**
 * Phase 2 retry worker. Inngest-driven retry of the CV parse + FitScore that
 * processPublicApplication runs inline. Called when the inline Phase 2 throws
 * (Claude 5xx, budget gate, network) so the recruiter doesn't see a "ghost"
 * candidate row with no parsed skills.
 *
 * Idempotent: a candidate whose `cv_parsed_at` is already set is left alone, so
 * Inngest's retry policy and any manual re-enqueue are both safe.
 */
export async function retryCvParse(
  admin: SupabaseClient,
  input: CvParseRetryInput,
): Promise<CvParseRetryResult> {
  const { candidateId, jobId, organisationId } = input;

  const { data: candidate } = await admin
    .from("candidates")
    .select("id, name, email, phone, cv_url, resume_url, cv_parsed_at")
    .eq("id", candidateId)
    .maybeSingle();

  if (!candidate) {
    logger.warn("cv-parse-retry: candidate not found, skipping", { candidateId });
    return { candidateId, skipped: true, skipReason: "candidate_missing" };
  }

  if (candidate.cv_parsed_at) {
    logger.info("cv-parse-retry: candidate already parsed, skipping (idempotent)", {
      candidateId,
      cvParsedAt: candidate.cv_parsed_at,
    });
    return { candidateId, skipped: true, skipReason: "already_parsed" };
  }

  const cvUrl = (candidate.cv_url as string | null) || (candidate.resume_url as string | null);
  if (!cvUrl) {
    logger.warn("cv-parse-retry: no stored CV for candidate, skipping", { candidateId });
    return { candidateId, skipped: true, skipReason: "no_cv_stored" };
  }

  const storagePath = storagePathFromCvUrl(cvUrl);
  const { data: fileData, error: dlError } = await admin.storage
    .from("candidate-cvs")
    .download(storagePath);

  if (dlError || !fileData) {
    logger.warn("cv-parse-retry: CV download failed", {
      candidateId,
      storagePath,
      error: dlError ? String(dlError) : "no data",
    });
    return { candidateId, skipped: true, skipReason: "download_failed" };
  }

  const arrayBuffer = await fileData.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const parseAttribution: ResumeParseCostAttribution = {
    organisationId,
    jobId: jobId ?? undefined,
    candidateId,
  };

  let result: Awaited<ReturnType<typeof parseResumeFileWithClaude>>;
  try {
    result = await parseResumeFileWithClaude(buffer, storagePath, parseAttribution);
  } catch (err) {
    if (!isNonRetriableCvParseError(err)) throw err; // transient: let Inngest retry
    // Same file + temperature 0 = same rejection. Retrying only re-bills the
    // parse (observed 2026-09-16: 4 × ~₹2 for one profile that never landed).
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("candidates")
      .update({ processing_status: "failed", updated_at: new Date().toISOString() })
      .eq("id", candidateId);
    logger.warn("cv_parse_retry_failed_permanently", { candidateId, jobId, error: message });
    throw new NonRetriableError(`cv-parse-retry: ${message}`, { cause: err });
  }
  const parsed = result.parsed;
  const rawText = result.rawTextForStorage ?? null;

  const ghostRisk = calculateGhostRiskScore({
    vouchCount: 0,
    availability: parsed.availability || null,
  });

  let resolvedPhone = candidate.phone as string | null | undefined;
  if (!normalizeContactDetail(resolvedPhone)) {
    const fromParse = normalizePhoneForCandidate(parsed.phone ?? undefined);
    if (fromParse) resolvedPhone = fromParse;
  }

  await admin
    .from("candidates")
    .update({
      name: parsed.full_name || candidate.name,
      full_name: parsed.full_name || candidate.name,
      email: parsed.email || candidate.email,
      phone: resolvedPhone ?? null,
      current_role: parsed.current_title || null,
      current_company: parsed.current_company || null,
      skills: Array.isArray(parsed.canonical_skills) ? parsed.canonical_skills : [],
      experience_years: parsed.years_experience ?? null,
      location: parsed.location_city || null,
      cv_raw_text: rawText?.slice(0, 100_000) ?? null,
      cv_parsed_at: new Date().toISOString(),
      ghost_risk_score: ghostRisk,
      processing_status: "complete",
      updated_at: new Date().toISOString(),
      availability: parsed.availability || null,
      seniority_level: parsed.seniority_level || null,
      salary_expectation_min: parsed.salary_expectation_min ?? null,
      salary_expectation_max: parsed.salary_expectation_max ?? null,
    })
    .eq("id", candidateId);

  // Score the targeted job (if any). Cross-org / multi-job scoring is left to
  // existing batch sweeps so this retry stays narrow and fast.
  let topScore: number | null = null;
  let jobsScored = 0;
  if (jobId) {
    const approved = await isJdBaseApproved(admin, jobId);
    if (!approved) {
      await enqueuePendingJdApprovalPair(admin, jobId, candidateId);
    } else {
      try {
        const scoreResult = await FitScoreService.computeSingle(admin, jobId, candidateId, {
          saveToDb: true,
          onUnapprovedJdBase: "queue_pending",
          source: "upload",
        });
        const n = numericOverallFromFitScoreServiceResult(scoreResult);
        if (n != null) {
          jobsScored = 1;
          topScore = n;
        }
      } catch (err) {
        logger.warn("cv-parse-retry: FitScore failed for targeted job", {
          candidateId,
          jobId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { candidateId, parsed: true, topScore, jobsScored };
}
