import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext, requireAuth, hasRole, jsonError, jsonSuccess } from "@/lib/api-helpers";
import { assertJobAccess } from "@/lib/job-access";
import { validateOrigin } from "@/lib/security/csrf";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { deleteJobPipelineStage, LockedPipelineStageError } from "@/lib/pipeline/delete-job-stage";
import { logger } from "@/lib/observability/logger";
import {
  enrichPipelineStagesWithInterviewers,
  type PipelineStageRowBase,
} from "@/lib/pipeline/enrich-pipeline-stages-response";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

const deletePipelineStageParamsSchema = z.object({
  id: z.string().uuid(),
  stageId: z.string().uuid(),
});

type Ctx = { params: Promise<{ id: string; stageId: string }> };

/**
 * DELETE /api/jobs/[id]/pipeline-stages/[stageId]
 */
export async function DELETE(_request: NextRequest, context: Ctx) {
  const csrf = validateOrigin(_request);
  if (csrf) return csrf;

  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

  const paramsParsed = deletePipelineStageParamsSchema.safeParse(await context.params);
  if (!paramsParsed.success) return jsonError("Invalid job or stage id", 400);
  const { id: jobId, stageId } = paramsParsed.data;
  const supabase = await createSupabaseServerClient();
  const { job } = await assertJobAccess(supabase, ctx, jobId);
  if (!job) return jsonError("Job not found", 404);

  const admin = createSupabaseAdmin();
  try {
    await deleteJobPipelineStage(admin, jobId, stageId);
  } catch (e) {
    if (e instanceof LockedPipelineStageError) {
      return jsonError(e.message, 403);
    }
    if (e instanceof Error && e.message === "Stage not found") {
      return jsonError("Stage not found", 404);
    }
    logger.error("delete pipeline stage failed", { error: String(e), jobId, stageId });
    return jsonError("Failed to delete stage", 500);
  }

  const { data: stages } = await admin
    .from("pipeline_stages")
    .select(
      "id, job_id, stage_name, stage_order, stage_type, sla_days, is_locked, notify_candidate, color, notify_email_body, interviewer_email, interviewer_name, interviewer_user_id, feedback_template_id",
    )
    .eq("job_id", jobId)
    .order("stage_order", { ascending: true });

  const enriched = await enrichPipelineStagesWithInterviewers(
    admin,
    (stages ?? []) as PipelineStageRowBase[],
  );
  return jsonSuccess({ stages: enriched });
}
