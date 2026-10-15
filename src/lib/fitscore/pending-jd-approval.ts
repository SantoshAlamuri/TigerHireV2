import type { SupabaseClient } from "@supabase/supabase-js";
import { getJdBaseByJobId } from "@/lib/fitscore/hybrid/jd-base";
import {
  computeJdReconcileScoreDiffs,
  snapshotActiveFitScoresForJob,
  type JdReconcileScoreDiff,
} from "@/lib/fitscore/jd-reconcile-score-diff";

export const JD_BASE_NOT_APPROVED_MESSAGE =
  "JD Base awaiting hiring manager approval. Review weights and approve before scoring.";

type PendingRow = {
  job_id: string;
  candidate_id: string;
  enqueued_at: string;
  attempted_at: string | null;
  last_error: string | null;
};

export async function isJdBaseApproved(supabase: SupabaseClient, jobId: string): Promise<boolean> {
  const jdBase = await getJdBaseByJobId(supabase, jobId);
  return Boolean(jdBase?.approvedBy);
}

export async function enqueuePendingJdApprovalPair(
  supabase: SupabaseClient,
  jobId: string,
  candidateId: string,
): Promise<void> {
  await enqueuePendingJdApprovalPairs(supabase, [{ jobId, candidateId }]);
}

export async function enqueuePendingJdApprovalPairs(
  supabase: SupabaseClient,
  pairs: Array<{ jobId: string; candidateId: string }>,
): Promise<void> {
  if (pairs.length === 0) return;
  const unique = new Map<string, { jobId: string; candidateId: string }>();
  for (const pair of pairs) {
    unique.set(`${pair.jobId}:${pair.candidateId}`, pair);
  }
  const now = new Date().toISOString();
  const payload = Array.from(unique.values()).map((pair) => ({
    job_id: pair.jobId,
    candidate_id: pair.candidateId,
    enqueued_at: now,
    attempted_at: null,
    last_error: null,
  }));

  const { error } = await supabase
    .from("pending_jd_approval")
    .upsert(payload, { onConflict: "job_id,candidate_id" });
  if (error) throw error;
}

export async function listPendingJdApprovalForJob(
  supabase: SupabaseClient,
  jobId: string,
): Promise<PendingRow[]> {
  const { data, error } = await supabase
    .from("pending_jd_approval")
    .select("job_id, candidate_id, enqueued_at, attempted_at, last_error")
    .eq("job_id", jobId)
    .order("enqueued_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PendingRow[];
}

export async function countPendingJdApprovalForJob(
  supabase: SupabaseClient,
  jobId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("pending_jd_approval")
    .select("candidate_id", { head: true, count: "exact" })
    .eq("job_id", jobId);
  if (error) throw error;
  return Number(count ?? 0);
}

export async function deletePendingJdApprovalPairs(
  supabase: SupabaseClient,
  jobId: string,
  candidateIds: string[],
): Promise<void> {
  if (candidateIds.length === 0) return;
  const { error } = await supabase
    .from("pending_jd_approval")
    .delete()
    .eq("job_id", jobId)
    .in("candidate_id", candidateIds);
  if (error) throw error;
}

export async function markPendingJdApprovalAttemptFailures(
  supabase: SupabaseClient,
  jobId: string,
  failures: Array<{ candidateId: string; error: string }>,
): Promise<void> {
  if (failures.length === 0) return;
  const attemptedAt = new Date().toISOString();
  for (const failure of failures) {
    const { error } = await supabase
      .from("pending_jd_approval")
      .update({
        attempted_at: attemptedAt,
        last_error: failure.error.slice(0, 500),
      })
      .eq("job_id", jobId)
      .eq("candidate_id", failure.candidateId);
    if (error) throw error;
  }
}

export async function sweepPendingJdApprovalForJob(
  supabase: SupabaseClient,
  jobId: string,
): Promise<{ processed: number; scored: number; failed: number; scoredCandidateIds: string[] }> {
  if (!(await isJdBaseApproved(supabase, jobId))) {
    return { processed: 0, scored: 0, failed: 0, scoredCandidateIds: [] };
  }

  const pending = await listPendingJdApprovalForJob(supabase, jobId);
  if (pending.length === 0) {
    return { processed: 0, scored: 0, failed: 0, scoredCandidateIds: [] };
  }

  const candidateIds = pending.map((row) => row.candidate_id);
  const fitScoreServiceMod = (await import("@/lib/services/FitScoreService")) as {
    FitScoreService?: {
      computeBatch: (
        db: SupabaseClient,
        id: string,
        ids: string[],
        options?: { onUnapprovedJdBase?: "throw" | "queue_pending" },
      ) => Promise<{
        scoredCandidateIds?: string[];
        failedCandidateIds?: Array<{ candidateId: string; error: string }>;
      }>;
    };
  };
  const service = fitScoreServiceMod.FitScoreService;
  if (!service) throw new Error("FitScoreService unavailable");

  const result = await service.computeBatch(supabase, jobId, candidateIds, {
    onUnapprovedJdBase: "throw",
  });
  const scoredCandidateIds = result.scoredCandidateIds ?? [];
  const failedCandidateIds = result.failedCandidateIds ?? [];
  await deletePendingJdApprovalPairs(supabase, jobId, scoredCandidateIds);
  await markPendingJdApprovalAttemptFailures(supabase, jobId, failedCandidateIds);

  return {
    processed: candidateIds.length,
    scored: scoredCandidateIds.length,
    failed: failedCandidateIds.length,
    scoredCandidateIds,
  };
}

type ReconcileSummary = {
  processed: number;
  scored: number;
  failed: number;
  pendingSweep: { processed: number; scored: number; failed: number; scoredCandidateIds: string[] };
  candidateSources: {
    pending_jd_approval: number;
    applications: number;
    pipeline_candidates: number;
    fit_scores: number;
  };
  verdictChanges: JdReconcileScoreDiff[];
};

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function listCandidateIdsForJobReconciliation(
  supabase: SupabaseClient,
  jobId: string,
): Promise<{
  candidateIds: string[];
  sources: ReconcileSummary["candidateSources"];
}> {
  const [pendingRows, applicationRows, pipelineRows, fitScoreRows] = await Promise.all([
    supabase.from("pending_jd_approval").select("candidate_id").eq("job_id", jobId),
    supabase.from("applications").select("candidate_id").eq("job_id", jobId),
    supabase.from("pipeline_candidates").select("candidate_id").eq("job_id", jobId),
    supabase
      .from("fit_scores")
      .select("candidate_id")
      .eq("job_id", jobId)
      .or("is_test_run.eq.false,is_test_run.is.null"),
  ]);

  if (pendingRows.error) throw pendingRows.error;
  if (applicationRows.error) throw applicationRows.error;
  if (pipelineRows.error) throw pipelineRows.error;
  if (fitScoreRows.error) throw fitScoreRows.error;

  const pendingIds = (pendingRows.data ?? []).map((r) => String(r.candidate_id));
  const applicationIds = (applicationRows.data ?? []).map((r) => String(r.candidate_id));
  const pipelineIds = (pipelineRows.data ?? []).map((r) => String(r.candidate_id));
  const fitScoreIds = (fitScoreRows.data ?? []).map((r) => String(r.candidate_id));

  const candidateIds = [
    ...new Set(
      [...pendingIds, ...applicationIds, ...pipelineIds, ...fitScoreIds].filter(
        (id) => id && id !== "null" && id !== "undefined",
      ),
    ),
  ];

  return {
    candidateIds,
    sources: {
      pending_jd_approval: pendingIds.length,
      applications: applicationIds.length,
      pipeline_candidates: pipelineIds.length,
      fit_scores: fitScoreIds.length,
    },
  };
}

/**
 * Reconcile all existing candidates for a job after JD Base approval so hybrid scoring
 * becomes the live path even when candidates were previously scored on three-stage.
 */
export async function reconcileApprovedJdBaseForJob(
  supabase: SupabaseClient,
  jobId: string,
): Promise<ReconcileSummary> {
  const emptySummary = (): ReconcileSummary => ({
    processed: 0,
    scored: 0,
    failed: 0,
    pendingSweep: { processed: 0, scored: 0, failed: 0, scoredCandidateIds: [] },
    candidateSources: {
      pending_jd_approval: 0,
      applications: 0,
      pipeline_candidates: 0,
      fit_scores: 0,
    },
    verdictChanges: [],
  });

  if (!(await isJdBaseApproved(supabase, jobId))) {
    return emptySummary();
  }

  const discovered = await listCandidateIdsForJobReconciliation(supabase, jobId);
  const candidateIds = discovered.candidateIds;
  const beforeScores = await snapshotActiveFitScoresForJob(supabase, jobId, candidateIds);

  // Keep the existing pending queue sweep path for backward compatibility.
  const pendingSweep = await sweepPendingJdApprovalForJob(supabase, jobId);

  if (candidateIds.length === 0) {
    return {
      processed: 0,
      scored: 0,
      failed: 0,
      pendingSweep,
      candidateSources: discovered.sources,
      verdictChanges: [],
    };
  }

  const fitScoreServiceMod = (await import("@/lib/services/FitScoreService")) as {
    FitScoreService?: {
      computeBatch: (
        db: SupabaseClient,
        id: string,
        ids: string[],
        options?: { onUnapprovedJdBase?: "throw" | "queue_pending" },
      ) => Promise<{
        scoredCandidateIds?: string[];
        failedCandidateIds?: Array<{ candidateId: string; error: string }>;
      }>;
    };
  };
  const service = fitScoreServiceMod.FitScoreService;
  if (!service) throw new Error("FitScoreService unavailable");

  const batches = chunk(candidateIds, 50);
  let scored = 0;
  let failed = 0;
  for (const ids of batches) {
    const result = await service.computeBatch(supabase, jobId, ids, {
      onUnapprovedJdBase: "throw",
    });
    scored += (result.scoredCandidateIds ?? []).length;
    failed += (result.failedCandidateIds ?? []).length;
  }

  const afterScores = await snapshotActiveFitScoresForJob(supabase, jobId, candidateIds);
  const verdictChanges = computeJdReconcileScoreDiffs(beforeScores, afterScores);

  return {
    processed: candidateIds.length,
    scored,
    failed,
    pendingSweep,
    candidateSources: discovered.sources,
    verdictChanges,
  };
}
