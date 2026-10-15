import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

export type PipelineActionSignalType =
  | "shortlist"
  | "reject"
  | "hire"
  | "move_stage"
  | "move_to_interview";

export async function recordPipelineActionSignals(
  admin: SupabaseClient,
  params: {
    jobId: string;
    organisationId: string;
    action: PipelineActionSignalType;
    submittedBy: string;
    entries: Array<{
      candidateId: string;
      pipelineCandidateId?: string | null;
      stageId?: string | null;
      stageName?: string | null;
      metadata?: Record<string, unknown>;
    }>;
  },
): Promise<void> {
  if (!params.entries.length) return;

  const candidateIds = [...new Set(params.entries.map((e) => e.candidateId))];
  const scoreMap = new Map<
    string,
    { id: string | null; scoreValue: number | null; scoringVersion: number | null }
  >();

  const { data: scores, error: scoreErr } = await admin
    .from("fit_scores")
    .select("id, candidate_id, primary_score, overall_score, scoring_version, created_at")
    .eq("job_id", params.jobId)
    .in("candidate_id", candidateIds)
    .or("is_test_run.eq.false,is_test_run.is.null")
    .order("created_at", { ascending: false });

  if (scoreErr) {
    logger.warn("pipeline_action_signals: failed to load score snapshots", {
      jobId: params.jobId,
      message: scoreErr.message,
      code: scoreErr.code,
    });
  } else {
    for (const row of scores ?? []) {
      if (!row?.candidate_id) continue;
      if (scoreMap.has(row.candidate_id)) continue;
      const primary = row.primary_score;
      const overall = row.overall_score;
      const raw =
        primary != null && primary !== ("" as unknown)
          ? Number(primary)
          : overall != null
            ? Number(overall)
            : null;
      const scoreValue =
        raw != null && Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : null;
      scoreMap.set(row.candidate_id, {
        id: row.id ?? null,
        scoreValue,
        scoringVersion:
          row.scoring_version != null && row.scoring_version !== ("" as unknown)
            ? Number(row.scoring_version)
            : 1,
      });
    }
  }

  const rows = params.entries.map((entry) => {
    const score = scoreMap.get(entry.candidateId);
    return {
      job_id: params.jobId,
      candidate_id: entry.candidateId,
      pipeline_candidate_id: entry.pipelineCandidateId ?? null,
      organisation_id: params.organisationId,
      action: params.action,
      stage_id: entry.stageId ?? null,
      stage_name: entry.stageName ?? null,
      fit_score_id: score?.id ?? null,
      fit_score_value: score?.scoreValue ?? null,
      scoring_version: score?.scoringVersion ?? 1,
      submitted_by: params.submittedBy,
      metadata: entry.metadata ?? {},
      created_at: new Date().toISOString(),
    };
  });

  const { error } = await admin.from("pipeline_action_signals").insert(rows);
  if (error) {
    logger.warn("pipeline_action_signals: insert failed", {
      jobId: params.jobId,
      action: params.action,
      rows: rows.length,
      message: error.message,
      code: error.code,
    });
  }
}
