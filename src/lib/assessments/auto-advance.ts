import { createSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Move an application to the next pipeline stage when assessment threshold is met.
 * Returns true when a stage transition is performed.
 */
export async function autoAdvanceAssessmentStage(
  applicationId: string,
  currentStageId: string | null,
): Promise<boolean> {
  if (!currentStageId) return false;
  const admin = createSupabaseAdmin();

  const { data: application } = await admin
    .from("applications")
    .select("job_id")
    .eq("id", applicationId)
    .single();
  if (!application?.job_id) return false;

  const { data: stages } = await admin
    .from("pipeline_stages")
    .select("id, stage_order")
    .eq("job_id", application.job_id)
    .order("stage_order", { ascending: true });
  if (!stages || stages.length === 0) return false;

  const current = stages.find((stage: { id: string }) => stage.id === currentStageId);
  if (!current) return false;
  const next = stages.find(
    (stage: { stage_order: number }) =>
      stage.stage_order > (current as { stage_order: number }).stage_order,
  );
  if (!next) return false;

  const { data, error } = await admin
    .from("applications")
    .update({
      current_stage_id: (next as { id: string }).id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", applicationId)
    .eq("current_stage_id", currentStageId)
    .select("id");
  return !error && Array.isArray(data) && data.length > 0;
}
