import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScreeningSummary } from "./types";
import { logger } from "@/lib/observability/logger";

/**
 * Copy screening summary fields onto applications when WhatsApp/voice screening completes.
 */
export async function persistScreeningSummaryToApplication(
  admin: SupabaseClient,
  params: {
    jobId: string;
    candidateId: string;
    summary: ScreeningSummary;
  },
): Promise<void> {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (params.summary.notice_period_days != null) {
    updates.notice_period_days = params.summary.notice_period_days;
  }
  if (params.summary.current_ctc_lakhs != null) {
    updates.current_ctc_lpa = params.summary.current_ctc_lakhs;
  }
  if (params.summary.expected_ctc_lakhs != null) {
    updates.expected_ctc_lpa = params.summary.expected_ctc_lakhs;
  }
  if (params.summary.location_preference != null) {
    updates.relocation_willingness = params.summary.location_preference;
  }

  if (Object.keys(updates).length <= 1) return;

  const { error } = await admin
    .from("applications")
    .update(updates)
    .eq("job_id", params.jobId)
    .eq("candidate_id", params.candidateId);

  if (error) {
    logger.warn("persistScreeningSummaryToApplication failed", {
      jobId: params.jobId,
      candidateId: params.candidateId,
      error: error.message,
    });
  }
}
