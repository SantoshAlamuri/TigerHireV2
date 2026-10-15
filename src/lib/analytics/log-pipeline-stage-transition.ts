import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

export type LogPipelineStageTransitionParams = {
  jobId: string;
  candidateId: string;
  pipelineCandidateId: string;
  /** null = first entry into pipeline / unknown prior stage */
  fromStage: string | null;
  toStage: string;
  movedBy: string | null;
};

/**
 * Fire-and-forget insert into pipeline_stage_transitions. Does not throw;
 * logs structured warning on failure so the primary pipeline mutation still succeeds.
 */
export function logPipelineStageTransition(
  supabase: SupabaseClient,
  params: LogPipelineStageTransitionParams,
): void {
  void supabase
    .from("pipeline_stage_transitions")
    .insert({
      job_id: params.jobId,
      candidate_id: params.candidateId,
      pipeline_candidate_id: params.pipelineCandidateId,
      from_stage: params.fromStage,
      to_stage: params.toStage,
      moved_by: params.movedBy,
    })
    .then(({ error }) => {
      if (error) {
        logger.warn("pipeline_stage_transitions insert failed", {
          message: error.message,
          code: error.code,
          jobId: params.jobId,
          pipelineCandidateId: params.pipelineCandidateId,
        });
      }
    });
}
