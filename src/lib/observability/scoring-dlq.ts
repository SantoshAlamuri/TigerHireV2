import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

export async function pushScoringDlq(
  supabase: SupabaseClient,
  payload: {
    jobId: string;
    candidateId: string;
    route: string;
    errorMessage: string;
    organisationId?: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("scoring_dlq").insert({
    job_id: payload.jobId,
    candidate_id: payload.candidateId,
    route: payload.route,
    organisation_id: payload.organisationId ?? null,
    error_message: payload.errorMessage.slice(0, 1000),
  });
  if (error) {
    logger.warn("Failed to push scoring DLQ event", {
      route: payload.route,
      jobId: payload.jobId,
      candidateId: payload.candidateId,
      error: error.message,
    });
  }
}
