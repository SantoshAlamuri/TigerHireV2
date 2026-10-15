import type { SupabaseClient } from "@supabase/supabase-js";
import { parseResumeFileWithClaude, type ResumeParseCostAttribution } from "@/lib/agents/cv-parser";
import {
  FitScoreService,
  numericOverallFromFitScoreServiceResult,
} from "@/lib/services/FitScoreService";
import { invalidateFitScoreCache } from "@/lib/redis/fitscore-cache";
import { calculateGhostRiskScore } from "@/lib/agents/ghostbuster";
import { logger } from "@/lib/observability/logger";
import { isJdBaseApproved, JD_BASE_NOT_APPROVED_MESSAGE } from "@/lib/fitscore/pending-jd-approval";
import { normalizePhoneForCandidate } from "@/lib/agents/candidate-dedup";
import { normalizeContactDetail } from "@/lib/candidates/normalize-contact-detail";
import { cacheDel } from "@/lib/redis/cache";
import { myPipelineKey } from "@/lib/redis/keys";

const REPROCESS_JOB_SELECT_FIELDS =
  "id, title, description, location, status, compensation_min, compensation_max, organisation_id";
const REPROCESS_CANDIDATE_SCORE_SELECT_FIELDS =
  "id, name, full_name, skills, experience_years, location, current_role, current_company, cv_raw_text, resume_url, cv_url, updated_at";

export type AgencyReprocessResult = {
  candidateId: string;
  candidateName?: string | null;
  success: boolean;
  score?: number | null;
  jobScores?: { jobId: string; score: number | null }[];
  error?: string;
};

export class AgencyReprocessJdNotApprovedError extends Error {
  constructor() {
    super(JD_BASE_NOT_APPROVED_MESSAGE);
    this.name = "AgencyReprocessJdNotApprovedError";
  }
}

export async function getAgencyClientOrgIds(
  admin: SupabaseClient,
  agencyOrganisationId: string,
): Promise<string[]> {
  const { data: links } = await admin
    .from("agency_clients")
    .select("client_organisation_id")
    .eq("agency_organisation_id", agencyOrganisationId);
  return (links ?? []).map((l: { client_organisation_id: string }) => l.client_organisation_id);
}

/**
 * Download stored CV, parse with Claude, and FitScore against scoped client jobs.
 * Used by POST /api/agency/reprocess-candidates and Inngest agency/candidate-reprocess.
 */
export async function reprocessAgencyCandidate(
  admin: SupabaseClient,
  params: {
    candidateId: string;
    agencyOrganisationId: string;
    clientOrgIds?: string[];
    triggeredByUserId?: string;
    markProcessing?: boolean;
    /**
     * Set ONLY by the agency bulk-upload path: skip the screening gate so CVs the
     * recruiter uploaded for a single job score without requiring candidate-answered
     * screening questions. Other agency reprocess callers leave this false (gated).
     */
    bypassScreeningGate?: boolean;
  },
): Promise<AgencyReprocessResult> {
  const { candidateId, agencyOrganisationId, triggeredByUserId, markProcessing } = params;
  const clientOrgIds =
    params.clientOrgIds ?? (await getAgencyClientOrgIds(admin, agencyOrganisationId));

  try {
    const { data: candidate } = await admin
      .from("candidates")
      .select("id, name, email, phone, cv_url, resume_url")
      .eq("id", candidateId)
      .single();
    if (!candidate) {
      return { candidateId, success: false, error: "Not found" };
    }

    if (markProcessing) {
      await admin
        .from("candidates")
        .update({ processing_status: "processing", updated_at: new Date().toISOString() })
        .eq("id", candidateId);
    }

    const { data: pipelineEntries } = await admin
      .from("pipeline_candidates")
      .select("job_id")
      .eq("candidate_id", candidateId);

    const pipelineJobIds = (pipelineEntries ?? []).map((p: { job_id: string }) => p.job_id);

    let scopedJobs: Array<Record<string, unknown> & { id: string }>;
    if (pipelineJobIds.length > 0) {
      const { data: jobs } = await admin
        .from("jobs")
        .select(REPROCESS_JOB_SELECT_FIELDS)
        .in("id", pipelineJobIds)
        .in("organisation_id", clientOrgIds);
      scopedJobs = (jobs ?? []) as Array<Record<string, unknown> & { id: string }>;
    } else {
      // No pipeline rows anywhere. Only fall back to scoring against the client's
      // open jobs if the candidate legitimately belongs to one of these client
      // orgs via an application — otherwise an arbitrary candidateId (e.g. one
      // owned by a different agency) would be pulled in and scored against every
      // open client job, leaking candidate data across the agency boundary.
      // "accessible = pipeline OR application on a client org" mirrors
      // filterAgencyAccessibleCandidateIds.
      const { data: appRows } = await admin
        .from("applications")
        .select("id, jobs!inner(organisation_id)")
        .eq("candidate_id", candidateId);
      const hasClientApplication = (appRows ?? []).some((row) => {
        const r = row as {
          jobs: { organisation_id: string } | { organisation_id: string }[];
        };
        const job = Array.isArray(r.jobs) ? r.jobs[0] : r.jobs;
        return Boolean(job) && clientOrgIds.includes(job.organisation_id);
      });
      if (!hasClientApplication) {
        return {
          candidateId,
          success: false,
          error: "Candidate is not in your pipeline",
        };
      }

      const { data: jobs } = await admin
        .from("jobs")
        .select(REPROCESS_JOB_SELECT_FIELDS)
        .eq("status", "open")
        .in("organisation_id", clientOrgIds)
        .limit(50);
      scopedJobs = (jobs ?? []) as Array<Record<string, unknown> & { id: string }>;
    }

    if (!scopedJobs?.length) {
      return {
        candidateId,
        success: false,
        error: "No open jobs found for your clients",
      };
    }

    for (const scopedJob of scopedJobs) {
      if (!(await isJdBaseApproved(admin, scopedJob.id))) {
        throw new AgencyReprocessJdNotApprovedError();
      }
    }

    const cvUrl = candidate.cv_url || candidate.resume_url;
    if (!cvUrl) {
      return {
        candidateId,
        success: false,
        error: "No CV file stored for this candidate",
      };
    }

    // Handles both legacy public URLs (.../object/public/candidate-cvs/...) and
    // signed URLs (.../object/sign/candidate-cvs/...?token=...); strip any query.
    const storagePath = cvUrl
      .replace(/^.*\/storage\/v1\/object\/(?:public|sign)\/candidate-cvs\//, "")
      .split("?")[0];

    const { data: fileData, error: dlError } = await admin.storage
      .from("candidate-cvs")
      .download(storagePath);

    if (dlError || !fileData) {
      logger.warn("Reprocess: CV download failed", {
        candidateId,
        storagePath,
        error: dlError ? String(dlError) : "no data",
      });
      return {
        candidateId,
        success: false,
        error: "Could not download stored CV",
      };
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const primaryJob = scopedJobs[0] as { id: string; organisation_id: string };
    const parseAttribution: ResumeParseCostAttribution = {
      organisationId: primaryJob.organisation_id,
      jobId: primaryJob.id,
      candidateId,
    };

    let parsed: Awaited<ReturnType<typeof parseResumeFileWithClaude>>["parsed"];
    let rawText: string | null = null;

    try {
      const result = await parseResumeFileWithClaude(buffer, storagePath, parseAttribution);
      parsed = result.parsed;
      rawText = result.rawTextForStorage ?? null;
      if (result.parseQuality != null) {
        logger.info("[reprocess-candidate] CV parse quality", {
          candidateId,
          parseQuality: result.parseQuality,
          parseMethod: result.parseMethod,
        });
      }
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      if (
        msg.includes("zip") ||
        msg.includes("central directory") ||
        msg.includes("WORD_PARSE_ERROR") ||
        msg.includes("PDF_PARSE_ERROR") ||
        msg.includes("Could not extract sufficient text")
      ) {
        await admin
          .from("candidates")
          .update({ processing_status: "failed", updated_at: new Date().toISOString() })
          .eq("id", candidateId);
        return {
          candidateId,
          success: false,
          error: msg.includes("Could not extract sufficient text")
            ? msg
            : "CV file is not a valid Word document or is corrupted. If it's a PDF, re-upload as .pdf; otherwise re-save as .docx and try again.",
        };
      }
      await admin
        .from("candidates")
        .update({ processing_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", candidateId);
      return { candidateId, success: false, error: msg };
    }

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

    const { data: candidateRow } = await admin
      .from("candidates")
      .select(REPROCESS_CANDIDATE_SCORE_SELECT_FIELDS)
      .eq("id", candidateId)
      .single();

    const scorePromises = scopedJobs.map(async (job) => {
      try {
        await invalidateFitScoreCache(candidateId, job.id);
        const result = await FitScoreService.computeSingle(admin, job.id, candidateId, {
          saveToDb: true,
          onUnapprovedJdBase: "throw",
          bypassScreeningGate: params.bypassScreeningGate === true,
          source: "agency_upload",
        });
        return numericOverallFromFitScoreServiceResult(result);
      } catch (e) {
        logger.warn("Reprocess: scoring failed for job", {
          job_id: job.id,
          error: String(e),
        });
        return null;
      }
    });
    const scores = await Promise.all(scorePromises);
    const validScores = scores.filter((s): s is number => s != null);
    const topScore = validScores.length > 0 ? Math.max(...validScores) : null;
    const jobScores = scopedJobs.map((job, idx) => ({
      jobId: job.id as string,
      score: scores[idx] ?? null,
    }));

    if (triggeredByUserId) {
      await cacheDel(myPipelineKey(triggeredByUserId));
    }

    return {
      candidateId,
      candidateName: candidateRow?.name ?? null,
      success: true,
      score: topScore,
      jobScores,
    };
  } catch (err) {
    if (err instanceof AgencyReprocessJdNotApprovedError) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Reprocess: candidate failed", {
      candidateId,
      error: msg,
    });
    try {
      await admin
        .from("candidates")
        .update({ processing_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", candidateId);
    } catch {
      // best-effort status update
    }
    return { candidateId, success: false, error: msg };
  }
}
