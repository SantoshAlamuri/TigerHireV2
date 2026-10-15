import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { runJdIntelligence } from "@/lib/agents/jd-intelligence";
import { runGhostbuster } from "@/lib/agents/ghostbuster-authenticity";
import { runScreening } from "@/lib/agents/screening";

export interface RunPipelineCandidatePool {
  /** Distinct candidate_ids on the job pipeline. */
  pipeline: number;
  /** Distinct applicants for this job not already counted above (union order: pipeline first). */
  applications: number;
  /** Distinct fit_scores rows for this job not already selected earlier. */
  fitScores: number;
  /** How many unique candidates were actually run (after maxCandidates cap). */
  selected: number;
}

export interface RunPipelineResult {
  jobId: string;
  candidatesProcessed: number;
  approved: number;
  rejected: number;
  belowThreshold: number;
  errors: string[];
  candidatePool?: RunPipelineCandidatePool;
}

/** Aligns with Candidate Authenticity Check persistence (`authenticity_signal` at risk ≥ 60). */
const GHOSTBUSTER_REJECT_THRESHOLD = 60;
const SCREENING_APPROVE_THRESHOLD = 70;
const DEFAULT_MAX_CANDIDATES = 40;

/**
 * Merge candidate sources in priority order: pipeline → applications → fit_scores.
 */
export async function resolveCandidateIdsForJob(
  jobId: string,
  maxCandidates: number,
): Promise<{ ids: string[]; pool: RunPipelineCandidatePool }> {
  const admin = createSupabaseAdmin();
  const ordered: string[] = [];
  const seen = new Set<string>();

  const pushUnique = (rawIds: string[]) => {
    for (const id of rawIds) {
      if (!id || seen.has(id) || ordered.length >= maxCandidates) continue;
      seen.add(id);
      ordered.push(id);
    }
  };

  const { data: pcRows, error: pcErr } = await admin
    .from("pipeline_candidates")
    .select("candidate_id")
    .eq("job_id", jobId)
    .order("candidate_id", { ascending: true });

  if (pcErr) {
    logger.error("[run-pipeline] pipeline_candidates query failed", {
      jobId,
      error: pcErr.message,
    });
    throw new Error(`Failed to load pipeline candidates: ${pcErr.message}`);
  }

  const pipelineIds = [...new Set((pcRows ?? []).map((r) => r.candidate_id as string))];
  pushUnique(pipelineIds);

  const { data: appRows, error: appErr } = await admin
    .from("applications")
    .select("candidate_id")
    .eq("job_id", jobId)
    .order("candidate_id", { ascending: true });

  if (appErr) {
    logger.error("[run-pipeline] applications query failed", { jobId, error: appErr.message });
    throw new Error(`Failed to load applications: ${appErr.message}`);
  }

  const applicationIds = [...new Set((appRows ?? []).map((r) => r.candidate_id as string))];
  pushUnique(applicationIds);

  const { data: fsRows, error: fsErr } = await admin
    .from("fit_scores")
    .select("candidate_id")
    .eq("job_id", jobId)
    .order("candidate_id", { ascending: true });

  if (fsErr) {
    logger.error("[run-pipeline] fit_scores query failed", { jobId, error: fsErr.message });
    throw new Error(`Failed to load fit_scores: ${fsErr.message}`);
  }

  const fitScoreIds = [...new Set((fsRows ?? []).map((r) => r.candidate_id as string))];
  pushUnique(fitScoreIds);

  const pool: RunPipelineCandidatePool = {
    pipeline: pipelineIds.length,
    applications: applicationIds.length,
    fitScores: fitScoreIds.length,
    selected: ordered.length,
  };

  return { ids: ordered, pool };
}

/**
 * For each resolved candidate: authenticity analysis, then screening (if it clears).
 * JD Intelligence runs once up front so `skills_rubric` is populated when possible.
 */
export async function runPipelineForJob(
  jobId: string,
  options?: { maxCandidates?: number; forceRescore?: boolean },
): Promise<RunPipelineResult> {
  const errors: string[] = [];
  const maxCandidates = Math.min(Math.max(1, options?.maxCandidates ?? DEFAULT_MAX_CANDIDATES), 80);

  try {
    await runJdIntelligence(jobId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`jd_intelligence: ${msg}`);
    logger.warn("[run-pipeline] jd intelligence skipped or failed", { jobId, msg });
  }

  const { ids: candidateIds, pool } = await resolveCandidateIdsForJob(jobId, maxCandidates);

  let approved = 0;
  let rejected = 0;
  let belowThreshold = 0;

  for (const candidateId of candidateIds) {
    try {
      const ghostbuster = await runGhostbuster(candidateId);
      if (ghostbuster.riskScore >= GHOSTBUSTER_REJECT_THRESHOLD) {
        rejected++;
        continue;
      }

      const screening = await runScreening(candidateId, jobId, {
        forceRescore: options?.forceRescore ?? false,
      });
      if (screening.overallScore >= SCREENING_APPROVE_THRESHOLD) {
        approved++;
      } else {
        belowThreshold++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${candidateId}: ${msg}`);
      logger.warn("[run-pipeline] candidate step failed", { jobId, candidateId, msg });
    }
  }

  const candidatesProcessed = approved + rejected + belowThreshold;

  logger.info("[run-pipeline] complete", {
    jobId,
    candidatesProcessed,
    approved,
    rejected,
    belowThreshold,
    errorCount: errors.length,
    pool,
  });

  return {
    jobId,
    candidatesProcessed,
    approved,
    rejected,
    belowThreshold,
    errors,
    candidatePool: pool,
  };
}
