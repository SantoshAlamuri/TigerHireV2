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
} from "@/lib/api-helpers";
import { triggerSchedulerAgent } from "@/lib/agents/scheduler";
import { getDualApprovalStatus } from "@/lib/pipeline-approvals";
import { logger } from "@/lib/observability/logger";
import { validateOrigin } from "@/lib/security/csrf";
import { logPipelineStageTransition } from "@/lib/analytics/log-pipeline-stage-transition";
import { z } from "zod";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;
const requestInterviewBodySchema = z
  .object({
    candidateId: z.string().trim().min(1).optional(),
    stageId: z.string().trim().min(1).optional(),
  })
  .strict();

/**
 * POST /api/jobs/[id]/pipeline/request-interview
 * Body: { candidateId: string, stageId?: string }
 * Ensures candidate is in pipeline_candidates for this job; sends WhatsApp slot options via Scheduler.
 * If stageId omitted, uses first pipeline stage by stage_order.
 * Requires both recruiter and HM approval before scheduling.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, ...RECRUITER_ROLES)) return jsonError("Forbidden", 403);

  const { id: jobId } = await params;
  const supabase = await createSupabaseServerClient();
  const { assertJobAccess } = await import("@/lib/job-access");
  const { job } = await assertJobAccess(supabase, ctx, jobId);
  if (!job) return jsonError("Job not found", 404);
  const admin = createSupabaseAdmin();

  const parsed = await parseJsonBody<{ candidateId?: string; stageId?: string }>(
    request,
    "POST /api/jobs/[id]/pipeline/request-interview",
  );
  if (parsed.errorResponse) return parsed.errorResponse;
  const bodyParsed = requestInterviewBodySchema.safeParse(parsed.body);
  if (!bodyParsed.success) return jsonError("Invalid request body", 422);
  const body = bodyParsed.data;
  const candidateId = body?.candidateId;
  if (!candidateId || typeof candidateId !== "string")
    return jsonError("candidateId is required", 400);

  // Check dual-approval gate
  const { data: pcRecord } = await supabase
    .from("pipeline_candidates")
    .select("id")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .single();

  if (pcRecord) {
    const { recruiterApproved, hmApproved } = await getDualApprovalStatus(admin, pcRecord.id);

    if (!recruiterApproved && !hmApproved) {
      return jsonError(
        "Interview requires approval from both recruiter and hiring manager. Neither has approved yet.",
        403,
      );
    }
    if (!recruiterApproved) {
      return jsonError(
        "Recruiter verification is still pending. Interview cannot be scheduled yet.",
        403,
      );
    }
    if (!hmApproved) {
      return jsonError(
        "Hiring manager approval is still pending. Interview cannot be scheduled yet.",
        403,
      );
    }
  }

  let stageId = body?.stageId;
  if (!stageId) {
    const { data: firstStage } = await supabase
      .from("pipeline_stages")
      .select("id, stage_order")
      .eq("job_id", jobId)
      .order("stage_order", { ascending: true })
      .limit(1)
      .single();
    stageId = firstStage?.id;

    if (!stageId) {
      const interviewer_user_id: string | null = job.hiring_manager_id ?? null;

      const { data: insertedStage, error: stageInsertErr } = await admin
        .from("pipeline_stages")
        .insert({
          job_id: jobId,
          stage_name: "Interview",
          stage_order: 0,
          stage_type: "interview",
          notify_candidate: false,
          color: "#6366f1",
          interviewer_user_id,
          interviewer_email: null,
          interviewer_name: null,
        })
        .select("id")
        .single();

      if (stageInsertErr || !insertedStage?.id) {
        logger.error("Failed to auto-create default interview stage", {
          jobId,
          error: String(stageInsertErr),
        });
        return jsonError("No pipeline stages for this job. Add stages first.", 400);
      }
      stageId = insertedStage.id as string;
    }
  }
  if (!stageId) return jsonError("No pipeline stages for this job. Add stages first.", 400);

  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("id, stage_name")
    .eq("id", stageId)
    .eq("job_id", jobId)
    .single();
  if (!stage) return jsonError("Stage not found for this job", 404);

  const stageLabel = (stage.stage_name as string | undefined) ?? "(no stage)";

  const { data: existing } = await supabase
    .from("pipeline_candidates")
    .select("id, stage_id")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .single();

  let priorStageName: string | null = null;
  if (existing?.stage_id) {
    const { data: prevSt } = await supabase
      .from("pipeline_stages")
      .select("stage_name")
      .eq("id", existing.stage_id as string)
      .eq("job_id", jobId)
      .maybeSingle();
    priorStageName = (prevSt?.stage_name as string | undefined) ?? null;
  }

  if (!existing) {
    const { data: inserted, error: insErr } = await supabase
      .from("pipeline_candidates")
      .insert({
        job_id: jobId,
        candidate_id: candidateId,
        stage_id: stageId,
        status: "in_progress",
      })
      .select("id")
      .single();
    if (insErr) {
      logger.error("Failed to add candidate to pipeline", {
        error: String(insErr),
      });
      return jsonError("Failed to add candidate to pipeline", 500);
    }
    if (inserted?.id) {
      logPipelineStageTransition(supabase, {
        jobId,
        candidateId,
        pipelineCandidateId: inserted.id as string,
        fromStage: null,
        toStage: stageLabel,
        movedBy: ctx.userId,
      });
    }
  } else {
    const stageChanged = (existing.stage_id as string | null) !== stageId;
    await supabase
      .from("pipeline_candidates")
      .update({ stage_id: stageId, status: "in_progress" })
      .eq("job_id", jobId)
      .eq("candidate_id", candidateId);
    if (stageChanged) {
      logPipelineStageTransition(supabase, {
        jobId,
        candidateId,
        pipelineCandidateId: existing.id as string,
        fromStage: priorStageName,
        toStage: stageLabel,
        movedBy: ctx.userId,
      });
    }
  }

  await triggerSchedulerAgent({
    candidateId,
    jobId,
    stageId,
    initiatedBy: ctx.userId,
  });
  return jsonSuccess({
    ok: true,
    message: "Interview request sent via WhatsApp.",
  });
}
