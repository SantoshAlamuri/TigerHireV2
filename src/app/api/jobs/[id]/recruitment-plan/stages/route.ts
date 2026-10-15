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
  listPlanStages,
} from "@/lib/recruitment-plan";
import { planStagesUpsertSchema } from "@/lib/recruitment-plan/schemas";
import type { z } from "zod";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;

type StageWrite = z.infer<typeof planStagesUpsertSchema>["stages"][number];

async function resolveInterviewer(
  admin: ReturnType<typeof createSupabaseAdmin>,
  organisationId: string,
  userId: string | null | undefined,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const uid = (userId ?? "").trim();
  if (!uid) return { ok: true };
  const { data: pr, error } = await admin
    .from("profiles")
    .select("id, organisation_id, is_active")
    .eq("id", uid)
    .maybeSingle();
  if (error || !pr) return { ok: false, message: "Interviewer profile not found" };
  if (pr.organisation_id !== organisationId) {
    return { ok: false, message: "Interviewer must belong to the same organisation as this job" };
  }
  if (!pr.is_active) return { ok: false, message: "Interviewer profile is inactive" };
  return { ok: true };
}

async function validateScorecardTemplates(
  admin: ReturnType<typeof createSupabaseAdmin>,
  jobId: string,
  stages: StageWrite[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const templateIds = [
    ...new Set(
      stages.map((s) => s.scorecard_template_id).filter((id): id is string => Boolean(id)),
    ),
  ];
  if (templateIds.length === 0) return { ok: true };

  const { data, error } = await admin
    .from("feedback_form_templates")
    .select("id")
    .eq("job_id", jobId)
    .in("id", templateIds);

  if (error) return { ok: false, message: "Failed to validate scorecard templates" };
  const allowed = new Set((data ?? []).map((r) => r.id as string));
  for (const id of templateIds) {
    if (!allowed.has(id))
      return { ok: false, message: "Scorecard template must belong to this job" };
  }
  return { ok: true };
}

/**
 * GET /api/jobs/[id]/recruitment-plan/stages
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
  const { plan } = await getRecruitmentPlanByJobId(admin, jobId);
  if (!plan) return jsonSuccess({ stages: [] });

  const { stages, error } = await listPlanStages(admin, plan.id);
  if (error) return jsonError("Failed to load plan stages", 500);
  return jsonSuccess({ stages });
}

/**
 * POST /api/jobs/[id]/recruitment-plan/stages
 * Upsert plan stages (replace-by-id pattern matching pipeline-stages).
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

  const parsedBody = await parseJsonBody(request, "POST /api/jobs/[id]/recruitment-plan/stages");
  if (parsedBody.errorResponse) return parsedBody.errorResponse;
  const parsed = planStagesUpsertSchema.safeParse(parsedBody.body);
  if (!parsed.success) return handleZodError(parsed.error);

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
    if (ensured.error || !ensured.plan) {
      return jsonError("Failed to ensure recruitment plan", 500);
    }
    plan = ensured.plan;
  }

  const templateCheck = await validateScorecardTemplates(admin, jobId, parsed.data.stages);
  if (!templateCheck.ok) return jsonError(templateCheck.message, 422);

  const { data: pipelineStageRows } = await admin
    .from("pipeline_stages")
    .select("id, stage_order")
    .eq("job_id", jobId);
  const pipelineIdByOrder = new Map(
    (pipelineStageRows ?? []).map((r) => [Number(r.stage_order), String(r.id)]),
  );

  for (const s of parsed.data.stages) {
    const primary = await resolveInterviewer(admin, job.organisation_id, s.primary_interviewer_id);
    if (!primary.ok) return jsonError(primary.message, 422);
    const backup = await resolveInterviewer(admin, job.organisation_id, s.backup_interviewer_id);
    if (!backup.ok) return jsonError(backup.message, 422);
  }

  const { data: existingRows } = await admin
    .from("plan_stages")
    .select("id")
    .eq("plan_id", plan.id);
  const existingIds = new Set((existingRows ?? []).map((r) => r.id as string));
  const payloadIds = new Set(parsed.data.stages.map((s) => s.id).filter(Boolean) as string[]);

  for (const s of parsed.data.stages) {
    const resolvedPipelineStageId =
      s.pipeline_stage_id ?? pipelineIdByOrder.get(s.stage_order) ?? null;

    const row = {
      plan_id: plan.id,
      pipeline_stage_id: resolvedPipelineStageId,
      stage_order: s.stage_order,
      stage_type: s.stage_type,
      display_name: s.display_name,
      primary_interviewer_id: s.primary_interviewer_id ?? null,
      backup_interviewer_id: s.backup_interviewer_id ?? null,
      duration_minutes: s.duration_minutes ?? null,
      format: s.format ?? null,
      scorecard_template_id: s.scorecard_template_id ?? null,
      comms_template_id: s.comms_template_id ?? s.comms_template ?? null,
      comms_template: s.comms_template ?? s.comms_template_id ?? null,
      approval_gate: s.approval_gate ?? "none",
      target_dwell_days: s.target_dwell_days ?? 5,
      is_active: s.is_active ?? true,
    };

    if (s.id && existingIds.has(s.id)) {
      const { error } = await admin
        .from("plan_stages")
        .update(row)
        .eq("id", s.id)
        .eq("plan_id", plan.id);
      if (error) {
        logger.error("plan_stages update failed", { error: error.message, stageId: s.id });
        return jsonError("Failed to save plan stages", 500);
      }
    } else {
      const { error } = await admin.from("plan_stages").insert(row);
      if (error) {
        logger.error("plan_stages insert failed", { error: error.message });
        return jsonError("Failed to save plan stages", 500);
      }
    }
  }

  for (const id of existingIds) {
    if (!payloadIds.has(id)) {
      await admin
        .from("plan_stages")
        .update({ is_active: false })
        .eq("id", id)
        .eq("plan_id", plan.id);
    }
  }

  await appendPlanHistory(admin, {
    plan_id: plan.id,
    actor_type: "human",
    actor_user_id: ctx.userId,
    event_type: "stages_updated",
    event_summary: "Plan stages updated",
    details: { stage_count: parsed.data.stages.length },
  });

  const { stages, error: listErr } = await listPlanStages(admin, plan.id);
  if (listErr) return jsonError("Failed to load saved plan stages", 500);
  return jsonSuccess({ stages });
}
