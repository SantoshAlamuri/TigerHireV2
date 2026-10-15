import type { SupabaseClient } from "@supabase/supabase-js";

/** Default markers matched as substrings of `pipeline_stages.stage_name` (case-insensitive). */
export const DEFAULT_OFFER_PIPELINE_STAGE_MARKERS = ["offer", "compensation", "salary", "ctc"];

/**
 * Recruiters may only draft an offer when the candidate is on a pipeline stage whose name
 * suggests the "offer" part of the funnel (configurable per org via permissions JSON).
 */
export async function assertOfferPipelineStageAllowed(
  supabase: SupabaseClient,
  params: {
    applicationId: string;
    /** When true, skip the pipeline check (org setting for rollout / special cases). */
    skipPipelineStageGate?: boolean;
    /** Substrings; any match on lowercased stage name allows draft. */
    stageNameMarkers?: string[];
  },
): Promise<{ allowed: true } | { allowed: false; message: string }> {
  if (params.skipPipelineStageGate) return { allowed: true };

  const markers = (
    params.stageNameMarkers?.length ? params.stageNameMarkers : DEFAULT_OFFER_PIPELINE_STAGE_MARKERS
  ).map((m) => m.toLowerCase());

  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select("candidate_id, job_id")
    .eq("id", params.applicationId)
    .maybeSingle();

  if (appErr || !app?.candidate_id || !app?.job_id) {
    return { allowed: false, message: "Application not found for pipeline check." };
  }

  // pipeline_candidates has no `updated_at`. This gate fails closed on a query
  // error, so naming a column the table does not have did not degrade quietly —
  // it answered "Could not verify pipeline stage for this candidate" every
  // time, for every offer. `created_at` is the newest-row ordering available.
  const { data: rows, error: pcErr } = await supabase
    .from("pipeline_candidates")
    .select("id, stage_id, status, created_at")
    .eq("job_id", app.job_id as string)
    .eq("candidate_id", app.candidate_id as string)
    .in("status", ["in_progress", "shortlisted"])
    .order("created_at", { ascending: false });

  if (pcErr) {
    return { allowed: false, message: "Could not verify pipeline stage for this candidate." };
  }

  const pc = (rows ?? [])[0];
  if (!pc?.stage_id) {
    return {
      allowed: false,
      message:
        "Add the candidate to the job pipeline and move them to an offer stage (e.g. a stage named “Offer” or “Compensation”) before drafting an offer.",
    };
  }

  const { data: stage, error: stErr } = await supabase
    .from("pipeline_stages")
    .select("stage_name")
    .eq("id", pc.stage_id as string)
    .maybeSingle();

  if (stErr || !stage?.stage_name) {
    return { allowed: false, message: "Pipeline stage could not be loaded for this candidate." };
  }

  const name = String(stage.stage_name).toLowerCase();
  if (!markers.some((m) => name.includes(m))) {
    return {
      allowed: false,
      message: `Draft offers are allowed only when the candidate is on an offer-related pipeline stage. Current stage: “${stage.stage_name}”. Expected the stage name to mention one of: ${markers.join(", ")}.`,
    };
  }

  return { allowed: true };
}
