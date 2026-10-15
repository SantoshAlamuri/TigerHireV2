import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
  handleApiError,
} from "@/lib/api-helpers";
import { assertJobAccess } from "@/lib/job-access";
import { validateOrigin } from "@/lib/security/csrf";
import {
  getRecruitmentPlanByJobId,
  listPlanStages,
  syncPlanStagesToPipeline,
} from "@/lib/recruitment-plan";
const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

const bodySchema = z
  .object({
    jobId: z.string().uuid(),
    planStageId: z.string().uuid().optional(),
    pipelineCandidateId: z.string().uuid().optional(),
    primaryInterviewerId: z.string().uuid().nullable(),
  })
  .strict();

/**
 * POST /api/tasks/plan-stage-interviewer
 * Assign primary interviewer on a plan stage from the tasks drawer.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

  const parsedBody = await parseJsonBody(request, "POST /api/tasks/plan-stage-interviewer");
  if (parsedBody.errorResponse) return parsedBody.errorResponse;
  const parsed = bodySchema.safeParse(parsedBody.body);
  if (!parsed.success) return handleZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { job } = await assertJobAccess(supabase, ctx, parsed.data.jobId);
  if (!job) return jsonError("Job not found", 404);

  const admin = createSupabaseAdmin();
  const { plan } = await getRecruitmentPlanByJobId(admin, parsed.data.jobId);
  if (!plan) return jsonError("Recruitment plan not found", 404);

  const { stages, error: listErr } = await listPlanStages(admin, plan.id);
  if (listErr) return jsonError("Failed to load plan stages", 500);

  let planStageId = parsed.data.planStageId;
  if (!planStageId && parsed.data.pipelineCandidateId) {
    const { data: pc } = await admin
      .from("pipeline_candidates")
      .select("stage_id")
      .eq("id", parsed.data.pipelineCandidateId)
      .eq("job_id", parsed.data.jobId)
      .maybeSingle();
    const stageId = pc?.stage_id as string | null;
    if (stageId) {
      const linked = stages.find((s) => s.pipeline_stage_id === stageId);
      planStageId = linked?.id;
    }
  }

  if (!planStageId) {
    return jsonError("planStageId or pipelineCandidateId is required", 422);
  }

  const target = stages.find((s) => s.id === planStageId);
  if (!target) return jsonError("Plan stage not found", 404);

  if (parsed.data.primaryInterviewerId) {
    const { data: pr } = await admin
      .from("profiles")
      .select("id, organisation_id, is_active")
      .eq("id", parsed.data.primaryInterviewerId)
      .maybeSingle();
    if (!pr || pr.organisation_id !== job.organisation_id) {
      return jsonError("Interviewer must belong to this organisation", 422);
    }
    if (!pr.is_active) return jsonError("Interviewer profile is inactive", 422);
  }

  const { error: upErr } = await admin
    .from("plan_stages")
    .update({
      primary_interviewer_id: parsed.data.primaryInterviewerId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", target.id)
    .eq("plan_id", plan.id);

  if (upErr) return jsonError("Failed to assign interviewer", 500);

  const { stages: refreshed, error: refreshErr } = await listPlanStages(admin, plan.id);
  if (refreshErr) return jsonError("Failed to reload plan stages", 500);

  try {
    await syncPlanStagesToPipeline(admin, {
      jobId: parsed.data.jobId,
      organisationId: job.organisation_id,
      planId: plan.id,
      stages: refreshed,
    });
  } catch (err) {
    return handleApiError(err, "Interviewer saved but pipeline sync failed", {
      route: "POST /api/tasks/plan-stage-interviewer",
    });
  }

  return jsonSuccess({ ok: true, planStageId: target.id });
}
