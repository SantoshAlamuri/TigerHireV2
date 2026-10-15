import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { savePublicApplication } from "@/lib/agents/public-apply";
import { FitScoreService } from "@/lib/services/FitScoreService";
import { normalizeEmailForCandidate } from "@/lib/agents/candidate-dedup";
import { calculateGhostRiskScore } from "@/lib/agents/ghostbuster";
import { extractTextFromBuffer, inferMimeFromName } from "@/lib/services/extract-document-text";
import { logger } from "@/lib/observability/logger";
import { TRYOUT_APPLICATION_SOURCE, TRYOUT_MAX_CVS_PER_JOB } from "@/lib/tryout/constants";
import { countTryoutApplications, loadTryoutJob } from "@/lib/tryout/jd-base";
import { getTryoutOrgId } from "@/lib/tryout/auth";
import { inferNameFromResumeText } from "@/lib/tryout/resume-text";
import { tryoutExplanationPayload } from "@/lib/tryout/format-insight";
import type { HybridScoreResult } from "@/lib/fitscore/hybrid/types";

function slugifyFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export class TryoutCvLimitError extends Error {
  constructor() {
    super("This tryout job already has 5 CVs scored. Start a new JD to continue.");
    this.name = "TryoutCvLimitError";
  }
}

export async function scoreTryoutCv(params: {
  jobId: string;
  fileBuffer: Buffer;
  fileName: string;
  contentType?: string;
}) {
  const startedAt = Date.now();
  const orgId = getTryoutOrgId();
  if (!orgId) throw new Error("TRYOUT_ORG_ID not configured");

  const admin = createSupabaseAdmin();
  const job = await loadTryoutJob(admin, params.jobId, orgId);
  if (!job || job.status !== "open") {
    throw new Error("Job not found or not open for tryout scoring.");
  }

  const existingCount = await countTryoutApplications(admin, params.jobId);
  if (existingCount >= TRYOUT_MAX_CVS_PER_JOB) {
    throw new TryoutCvLimitError();
  }

  const slug = slugifyFileName(params.fileName) || "candidate";
  const email = normalizeEmailForCandidate(`${slug}-${Date.now()}@tryout.tigerhire.io`);
  const mime =
    params.contentType?.trim() || inferMimeFromName(params.fileName) || "application/pdf";

  const cvRawText = (await extractTextFromBuffer(params.fileBuffer, mime, params.fileName)).trim();
  if (cvRawText.length < 100) {
    throw new Error(
      "Could not extract enough text from this PDF. Try a text-based CV or a different file.",
    );
  }

  const fallbackName = slug.replace(/-/g, " ");
  const candidateName = inferNameFromResumeText(cvRawText, fallbackName);

  const saved = await savePublicApplication({
    fileBuffer: params.fileBuffer,
    fileName: params.fileName,
    contentType: params.contentType,
    organisationId: orgId,
    jobId: params.jobId,
    name: candidateName,
    email: email ?? undefined,
    source: TRYOUT_APPLICATION_SOURCE,
    skipCandidateAcknowledgement: true,
  });

  const ghostRisk = calculateGhostRiskScore({ vouchCount: 0, availability: null });
  await admin
    .from("candidates")
    .update({
      name: candidateName,
      full_name: candidateName,
      email: normalizeEmailForCandidate(email),
      cv_raw_text: cvRawText.slice(0, 100_000),
      cv_parsed_at: new Date().toISOString(),
      ghost_risk_score: ghostRisk,
      processing_status: "complete",
      updated_at: new Date().toISOString(),
    })
    .eq("id", saved.candidateId);

  const scoreResult = await FitScoreService.computeSingle(admin, params.jobId, saved.candidateId, {
    saveToDb: true,
    source: "tryout",
    onUnapprovedJdBase: "throw",
    skipExplanation: true,
  });

  const hybrid = scoreResult as HybridScoreResult;
  const extraction = hybrid.extraction;
  const greenFlags = extraction?.green_flags ?? [];
  const redFlags = (extraction?.red_flags ?? []).map((r) => r.flag);
  const explanation = tryoutExplanationPayload({
    explanationText: hybrid.explanation?.trim(),
    summary: extraction?.summary,
    greenFlags,
    redFlags,
    verdict: hybrid.verdict?.label ?? null,
  });
  const hasInsight =
    Boolean(explanation.one_line_summary) ||
    explanation.key_strengths.length > 0 ||
    explanation.key_gaps.length > 0;

  logger.info("tryout: cv scored", {
    job_id: params.jobId,
    candidate_id: saved.candidateId,
    duration_ms: Date.now() - startedAt,
    fit_score: hybrid.fitScore,
    has_explanation: hasInsight,
  });

  return {
    candidateId: saved.candidateId,
    candidateName,
    fileName: params.fileName,
    fitScore: hybrid.fitScore,
    band: hybrid.fitLabel,
    bandColor: hybrid.fitLabelColor,
    dimensions: hybrid.breakdown?.dimensions ?? {},
    green_flags: greenFlags,
    red_flags: redFlags,
    breakdown: hybrid.breakdown,
    verdict: hybrid.verdict,
    explanation: hasInsight ? explanation : null,
    explanationPending: !hasInsight,
    slotsUsed: existingCount + 1,
    slotsRemaining: Math.max(0, TRYOUT_MAX_CVS_PER_JOB - (existingCount + 1)),
  };
}
