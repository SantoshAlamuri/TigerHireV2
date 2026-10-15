import { NextRequest } from "next/server";
import { runAfterResponse } from "@/lib/observability/after-response";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logPipelineStageTransition } from "@/lib/analytics/log-pipeline-stage-transition";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
} from "@/lib/api-helpers";
import { buildScopedRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";
import { validateOrigin } from "@/lib/security/csrf";
import { logger } from "@/lib/observability/logger";
import { recordPipelineActionSignals } from "@/lib/services/pipeline-action-signals";
import { upsertHiringOutcome } from "@/lib/services/hiring-outcomes";
import { assertPlanApprovalGateForPipelineMove } from "@/lib/recruitment-plan/check-plan-approval-gate";
import { assertJobAccess } from "@/lib/job-access";
import { dispatchPlanStageOnCandidateMove } from "@/lib/recruitment-plan/plan-stage-dispatch";
import { z } from "zod";

const bulkActionSchema = z
  .object({
    action: z.enum(["move_stage", "reject", "shortlist"]),
    candidateIds: z.array(z.string().uuid()).min(1).max(50),
    stageId: z.string().uuid().optional(),
  })
  .strict();

const ALLOWED_ROLES = [
  "super_admin",
  "leadership",
  "recruiter",
  "agency",
  "hiring_manager",
] as const;
const STAGE_MUTATION_ROLES = ["super_admin", "leadership", "recruiter"] as const;

/**
 * POST /api/jobs/[id]/pipeline/bulk
 * Perform bulk actions on pipeline candidates: move_stage, reject, shortlist.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, ...ALLOWED_ROLES)) return jsonError("Forbidden", 403);

  const rl = await checkRateLimit({
    key: buildScopedRateLimitKey({
      route: "bulk-pipeline",
      organisationId: ctx.organisationId,
      userId: ctx.userId,
    }),
    limit: 10,
    windowSecs: 60,
  });
  if (!rl.allowed) {
    return jsonError("Too many requests", 429);
  }

  const { id: jobId } = await params;

  const parsedBody = await parseJsonBody(request, "POST /api/jobs/[id]/pipeline/bulk");
  if (parsedBody.errorResponse) return parsedBody.errorResponse;

  const parsed = bulkActionSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return handleZodError(parsed.error);
  }
  const { action, candidateIds, stageId } = parsed.data;

  if (action === "move_stage" && !stageId) {
    return jsonError("stageId is required for move_stage action", 400);
  }
  if (action === "move_stage" && !hasRole(ctx, ...STAGE_MUTATION_ROLES)) {
    return jsonError("Only admins or recruiters can change pipeline stage", 403);
  }

  const admin = createSupabaseAdmin();
  const scopedSupabase = await createSupabaseServerClient();
  const { job } = await assertJobAccess(scopedSupabase, ctx, jobId);
  if (!job) return jsonError("Job not found", 404);

  let resolvedStageName: string | null = null;
  let resolvedStageType: string | null = null;
  // For move_stage, verify the stage belongs to this job
  if (action === "move_stage" && stageId) {
    const { data: stage } = await admin
      .from("pipeline_stages")
      .select("id, stage_name, stage_type")
      .eq("id", stageId)
      .eq("job_id", jobId)
      .single();

    if (!stage) {
      return jsonError("Stage not found for this job", 400);
    }
    resolvedStageName = stage.stage_name ?? null;
    resolvedStageType = (stage.stage_type as string | null) ?? null;
  }

  let updatedCount = 0;

  if (action === "move_stage") {
    const { data: beforeRows } = await admin
      .from("pipeline_candidates")
      .select("id, candidate_id, stage_id")
      .eq("job_id", jobId)
      .in("id", candidateIds);
    const movableRows = (beforeRows ?? []).filter((row) => row.stage_id !== stageId);
    if (movableRows.length === 0) {
      return jsonSuccess({ updated: 0 });
    }
    const movableIds = movableRows.map((row) => row.id as string);
    const beforeById = new Map(movableRows.map((row) => [row.id as string, row]));

    for (const row of movableRows) {
      const gate = await assertPlanApprovalGateForPipelineMove(admin, {
        jobId,
        pipelineCandidateId: row.id as string,
        targetPipelineStageId: stageId!,
      });
      if (!gate.ok) {
        return jsonError(gate.message, 409);
      }
    }

    const prevStageIds = [
      ...new Set(
        movableRows.map((r) => r.stage_id as string | null).filter((x): x is string => Boolean(x)),
      ),
    ];
    const stageNameById: Record<string, string> = {};
    if (prevStageIds.length > 0) {
      const { data: stRows } = await admin
        .from("pipeline_stages")
        .select("id, stage_name")
        .in("id", prevStageIds);
      for (const s of stRows ?? []) {
        stageNameById[s.id as string] = (s.stage_name as string) ?? "(no stage)";
      }
    }

    const { data, error } = await admin
      .from("pipeline_candidates")
      .update({ stage_id: stageId! })
      .eq("job_id", jobId)
      .in("id", movableIds)
      .select("id, candidate_id");

    if (error) {
      logger.error("Bulk move_stage failed", {
        error: String(error),
        jobId,
        candidateIds,
      });
      return jsonError("Failed to move candidates", 500);
    }
    updatedCount = data?.length ?? 0;

    const targetStageType = resolvedStageType ?? undefined;
    if (targetStageType && (data?.length ?? 0) > 0) {
      const cids = [...new Set((data ?? []).map((r) => r.candidate_id as string))];
      await admin
        .from("applications")
        .update({ stage_type: targetStageType, updated_at: new Date().toISOString() })
        .eq("job_id", jobId)
        .in("candidate_id", cids);
    }

    const toLabel = resolvedStageName ?? "(no stage)";
    for (const row of data ?? []) {
      const before = beforeById.get(row.id as string);
      const fromName = before?.stage_id ? (stageNameById[before.stage_id as string] ?? null) : null;
      logPipelineStageTransition(scopedSupabase, {
        jobId,
        candidateId: row.candidate_id as string,
        pipelineCandidateId: row.id as string,
        fromStage: fromName,
        toStage: toLabel,
        movedBy: ctx.userId,
      });
    }
    if ((data?.length ?? 0) > 0 && stageId) {
      // Run post-response so a frozen serverless instance can't drop these. (#349)
      const rowsForDispatch = data ?? [];
      runAfterResponse("bulk-plan-stage-dispatch", async () => {
        for (const row of rowsForDispatch) {
          await dispatchPlanStageOnCandidateMove({
            jobId,
            organisationId: job.organisation_id as string,
            pipelineCandidateId: row.id as string,
            candidateId: row.candidate_id as string,
            pipelineStageId: stageId,
            initiatedBy: ctx.userId,
          });
        }
      });
    }
    if ((data?.length ?? 0) > 0) {
      const moveAction = (resolvedStageName ?? "").toLowerCase().includes("interview")
        ? "move_to_interview"
        : "move_stage";
      void recordPipelineActionSignals(admin, {
        jobId,
        organisationId: job.organisation_id as string,
        action: moveAction,
        submittedBy: ctx.userId,
        entries: (data ?? []).map((row) => ({
          candidateId: row.candidate_id as string,
          pipelineCandidateId: row.id as string,
          stageId: stageId!,
          stageName: resolvedStageName,
          metadata: { route: "jobs-pipeline-bulk" },
        })),
      });
    }
  } else if (action === "reject") {
    const { data, error } = await admin
      .from("pipeline_candidates")
      .update({ status: "rejected" })
      .eq("job_id", jobId)
      .in("id", candidateIds)
      .select("id, candidate_id");

    if (error) {
      logger.error("Bulk reject failed", {
        error: String(error),
        jobId,
        candidateIds,
      });
      return jsonError("Failed to reject candidates", 500);
    }
    updatedCount = data?.length ?? 0;
    if ((data?.length ?? 0) > 0) {
      void recordPipelineActionSignals(admin, {
        jobId,
        organisationId: job.organisation_id as string,
        action: "reject",
        submittedBy: ctx.userId,
        entries: (data ?? []).map((row) => ({
          candidateId: row.candidate_id as string,
          pipelineCandidateId: row.id as string,
          metadata: { route: "jobs-pipeline-bulk" },
        })),
      });
      // Hire-analytics rows must not be dropped if the instance freezes. (#349)
      const rejectedRows = data ?? [];
      runAfterResponse("bulk-reject-hiring-outcome", async () => {
        for (const row of rejectedRows) {
          await upsertHiringOutcome(admin, {
            jobId,
            candidateId: row.candidate_id as string,
            outcome: "rejected",
            recordedByUserId: ctx.userId,
            source: "manual",
            sourceEventId: `bulk-reject:${row.id}`,
          });
        }
      });
    }
  } else if (action === "shortlist") {
    const { data, error } = await admin
      .from("pipeline_candidates")
      .update({ status: "shortlisted" })
      .eq("job_id", jobId)
      .in("id", candidateIds)
      .select("id, candidate_id");

    if (error) {
      logger.error("Bulk shortlist failed", {
        error: String(error),
        jobId,
        candidateIds,
      });
      return jsonError("Failed to shortlist candidates", 500);
    }
    updatedCount = data?.length ?? 0;
    if ((data?.length ?? 0) > 0) {
      void recordPipelineActionSignals(admin, {
        jobId,
        organisationId: job.organisation_id as string,
        action: "shortlist",
        submittedBy: ctx.userId,
        entries: (data ?? []).map((row) => ({
          candidateId: row.candidate_id as string,
          pipelineCandidateId: row.id as string,
          metadata: { route: "jobs-pipeline-bulk" },
        })),
      });
    }
  }

  logger.info("Bulk pipeline action completed", {
    action,
    jobId,
    candidateCount: candidateIds.length,
    updatedCount,
    userId: ctx.userId,
  });

  return jsonSuccess({ updated: updatedCount });
}
