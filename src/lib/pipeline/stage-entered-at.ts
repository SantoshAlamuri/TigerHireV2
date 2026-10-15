export type StageTransitionRow = {
  pipeline_candidate_id: string;
  to_stage: string;
  entered_at: string;
};

/**
 * Best-effort timestamp for when the candidate entered their current pipeline stage.
 * Uses the latest matching transition row; falls back to application apply time, then PC created_at.
 */
export function resolveStageEnteredAtIso(params: {
  pipelineCandidateId: string;
  currentStageName: string | null;
  transitions: StageTransitionRow[];
  applicationAppliedAt: string | null;
  pipelineCandidateCreatedAt: string | null;
}): string | null {
  const {
    pipelineCandidateId,
    currentStageName,
    transitions,
    applicationAppliedAt,
    pipelineCandidateCreatedAt,
  } = params;

  if (currentStageName) {
    let latest: string | null = null;
    for (const row of transitions) {
      if (row.pipeline_candidate_id !== pipelineCandidateId) continue;
      if (row.to_stage !== currentStageName) continue;
      if (!latest || row.entered_at > latest) {
        latest = row.entered_at;
      }
    }
    if (latest) return latest;
  }

  return applicationAppliedAt ?? pipelineCandidateCreatedAt ?? null;
}
