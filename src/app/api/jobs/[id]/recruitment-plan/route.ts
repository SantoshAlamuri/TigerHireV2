import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
} from "@/lib/api-helpers";
import { assertJobAccess } from "@/lib/job-access";
import { validateOrigin } from "@/lib/security/csrf";
import { logger } from "@/lib/observability/logger";
import {
  appendPlanHistory,
  ensureRecruitmentPlanForJob,
  getRecruitmentPlanByJobId,
  linkPlanStagesToPipeline,
  listPlanStages,
  updateRecruitmentPlan,
} from "@/lib/recruitment-plan";
import { recruitmentPlanPatchSchema } from "@/lib/recruitment-plan/schemas";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

/**
 * GET /api/jobs/[id]/recruitment-plan
 * Returns plan + stages; creates plan on first access if missing.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

  const { id: jobId } = await params;
  const supabase = await createSupabaseServerClient();
  const { job } = await assertJobAccess(supabase, ctx, jobId);
  if (!job) return jsonError("Job not found", 404);

  const admin = createSupabaseAdmin();
  let { plan } = await getRecruitmentPlanByJobId(admin, jobId);

  if (!plan) {
    const { data: jobRow } = await admin
      .from("jobs")
      .select("status")
      .eq("id", jobId)
      .maybeSingle();

    const ensured = await ensureRecruitmentPlanForJob({
      jobId,
      organisationId: job.organisation_id,
      jobStatus: (jobRow as { status?: string } | null)?.status,
      createdBy: ctx.userId,
    });
    if (ensured.error) {
      logger.error("recruitment-plan ensure failed", { error: ensured.error.message, jobId });
      return jsonError("Failed to load recruitment plan", 500);
    }
    plan = ensured.plan;
    const linked = await linkPlanStagesToPipeline(admin, jobId, plan.id, ensured.stages);
    return jsonSuccess({ plan, stages: linked.stages, created: ensured.created });
  }

  const { stages, error } = await listPlanStages(admin, plan.id);
  if (error) {
    logger.error("recruitment-plan stages list failed", { error: error.message, jobId });
    return jsonError("Failed to load plan stages", 500);
  }

  const linked = await linkPlanStagesToPipeline(admin, jobId, plan.id, stages);
  return jsonSuccess({ plan, stages: linked.stages, created: false });
}

/**
 * POST /api/jobs/[id]/recruitment-plan
 * Explicitly create plan (idempotent if exists).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

  const { id: jobId } = await params;
  const supabase = await createSupabaseServerClient();
  const { job } = await assertJobAccess(supabase, ctx, jobId);
  if (!job) return jsonError("Job not found", 404);

  const admin = createSupabaseAdmin();
  const { data: jobRow } = await admin.from("jobs").select("status").eq("id", jobId).maybeSingle();

  const ensured = await ensureRecruitmentPlanForJob({
    jobId,
    organisationId: job.organisation_id,
    jobStatus: (jobRow as { status?: string } | null)?.status,
    createdBy: ctx.userId,
  });

  if (ensured.error) {
    logger.error("recruitment-plan create failed", { error: ensured.error.message, jobId });
    return jsonError("Failed to create recruitment plan", 500);
  }

  return jsonSuccess({ plan: ensured.plan, stages: ensured.stages, created: ensured.created });
}

/**
 * PATCH /api/jobs/[id]/recruitment-plan
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

  const { id: jobId } = await params;
  const supabase = await createSupabaseServerClient();
  const { job } = await assertJobAccess(supabase, ctx, jobId);
  if (!job) return jsonError("Job not found", 404);

  const parsedBody = await parseJsonBody(request, "PATCH /api/jobs/[id]/recruitment-plan");
  if (parsedBody.errorResponse) return parsedBody.errorResponse;
  const parsed = recruitmentPlanPatchSchema.safeParse(parsedBody.body);
  if (!parsed.success) return handleZodError(parsed.error);

  const admin = createSupabaseAdmin();
  const { plan: existing } = await getRecruitmentPlanByJobId(admin, jobId);
  if (!existing) return jsonError("Recruitment plan not found", 404);

  const { plan, error } = await updateRecruitmentPlan(admin, existing.id, parsed.data);
  if (error || !plan) {
    logger.error("recruitment-plan patch failed", { error: error?.message, jobId });
    return jsonError("Failed to update recruitment plan", 500);
  }

  await appendPlanHistory(admin, {
    plan_id: plan.id,
    actor_type: "human",
    actor_user_id: ctx.userId,
    event_type: "plan_updated",
    event_summary: "Recruitment plan updated",
    details: parsed.data,
  });

  const { stages } = await listPlanStages(admin, plan.id);
  return jsonSuccess({ plan, stages });
}
