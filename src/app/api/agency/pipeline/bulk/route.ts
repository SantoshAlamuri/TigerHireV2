import { NextRequest } from "next/server";
import { z } from "zod";
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
import { validateOrigin } from "@/lib/security/csrf";
import { buildScopedRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";
import { assertJobAccess } from "@/lib/job-access";
import { AGENCY_STAGE_KEYS, isAgencyStageVisibleToCompany } from "@/lib/constants/agency-stages";
import { fireAgencyShareNotification } from "@/lib/acknowledgements/trigger-agency-share-notification";
import { logger } from "@/lib/observability/logger";
import { recordPipelineActionSignals } from "@/lib/services/pipeline-action-signals";

const bulkBodySchema = z
  .object({
    action: z.enum(["agency_stage", "reject", "delete"]),
    agency_stage: z.string().optional(),
    items: z
      .array(
        z
          .object({
            pipelineCandidateId: z.string().uuid(),
            jobId: z.string().uuid(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

/**
 * POST /api/agency/pipeline/bulk
 * Bulk move (agency_stage), reject in place, or delete pipeline rows.
 * reject/delete do not send per-row email/WhatsApp. delete removes rows from the board
 * and sets applications to rejected quietly.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, "agency", "super_admin")) return jsonError("Forbidden", 403);

  const rl = await checkRateLimit({
    key: buildScopedRateLimitKey({
      route: "agency-bulk-pipeline",
      organisationId: ctx.organisationId,
      userId: ctx.userId,
    }),
    limit: 20,
    windowSecs: 60,
  });
  if (!rl.allowed) return jsonError("Too many requests", 429);

  const parsedBody = await parseJsonBody(request, "POST /api/agency/pipeline/bulk");
  if (parsedBody.errorResponse) return parsedBody.errorResponse;

  const parsed = bulkBodySchema.safeParse(parsedBody.body);
  if (!parsed.success) return handleZodError(parsed.error);

  const { action, items } = parsed.data;
  if (action === "agency_stage") {
    const stage = parsed.data.agency_stage;
    if (!stage || !AGENCY_STAGE_KEYS.includes(stage)) {
      return jsonError(
        `agency_stage is required and must be one of: ${AGENCY_STAGE_KEYS.join(", ")}`,
        400,
      );
    }
  }

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdmin();
  const jobOrgMap = new Map<string, string>();

  const uniqueJobIds = [...new Set(items.map((i) => i.jobId))];
  for (const jobId of uniqueJobIds) {
    const { job } = await assertJobAccess(supabase, ctx, jobId);
    if (!job) return jsonError("Job not found or access denied", 403);
    if (job.organisation_id) {
      jobOrgMap.set(jobId, job.organisation_id as string);
    }
  }

  for (const jobId of uniqueJobIds) {
    const pcIds = items.filter((i) => i.jobId === jobId).map((i) => i.pipelineCandidateId);
    const { data: rows, error: selErr } = await admin
      .from("pipeline_candidates")
      .select("id")
      .eq("job_id", jobId)
      .in("id", pcIds);

    if (selErr) {
      logger.error("Agency bulk pipeline: select failed", { error: String(selErr), jobId });
      return jsonError("Failed to verify pipeline rows", 500);
    }
    if ((rows?.length ?? 0) !== pcIds.length) {
      return jsonError("One or more pipeline rows are invalid for this job", 400);
    }
  }

  let updatedTotal = 0;

  if (action === "reject") {
    for (const jobId of uniqueJobIds) {
      const pcIds = items.filter((i) => i.jobId === jobId).map((i) => i.pipelineCandidateId);
      const { data, error } = await admin
        .from("pipeline_candidates")
        .update({ status: "rejected" })
        .eq("job_id", jobId)
        .in("id", pcIds)
        .select("id, candidate_id");

      if (error) {
        logger.error("Agency bulk pipeline: reject failed", { error: String(error), jobId });
        return jsonError("Failed to update pipeline", 500);
      }
      updatedTotal += data?.length ?? 0;
      const organisationId = jobOrgMap.get(jobId);
      if ((data?.length ?? 0) > 0 && organisationId) {
        void recordPipelineActionSignals(admin, {
          jobId,
          organisationId,
          action: "reject",
          submittedBy: ctx.userId,
          entries: (data ?? []).map((row) => ({
            candidateId: row.candidate_id as string,
            pipelineCandidateId: row.id as string,
            metadata: { route: "agency-pipeline-bulk", action: "reject" },
          })),
        });
      }

      const candidateIds = [...new Set((data ?? []).map((r) => r.candidate_id as string))];
      for (const candidateId of candidateIds) {
        await admin
          .from("applications")
          .update({ status: "rejected", updated_at: new Date().toISOString() })
          .eq("candidate_id", candidateId)
          .eq("job_id", jobId);
      }
    }
  } else if (action === "delete") {
    for (const jobId of uniqueJobIds) {
      const pcIds = items.filter((i) => i.jobId === jobId).map((i) => i.pipelineCandidateId);
      const { data, error } = await admin
        .from("pipeline_candidates")
        .delete()
        .eq("job_id", jobId)
        .in("id", pcIds)
        .select("id, candidate_id");

      if (error) {
        logger.error("Agency bulk pipeline: delete failed", { error: String(error), jobId });
        return jsonError("Failed to remove from pipeline", 500);
      }
      updatedTotal += data?.length ?? 0;
      const organisationId = jobOrgMap.get(jobId);
      if ((data?.length ?? 0) > 0 && organisationId) {
        void recordPipelineActionSignals(admin, {
          jobId,
          organisationId,
          action: "reject",
          submittedBy: ctx.userId,
          entries: (data ?? []).map((row) => ({
            candidateId: row.candidate_id as string,
            pipelineCandidateId: row.id as string,
            metadata: { route: "agency-pipeline-bulk", action: "delete" },
          })),
        });
      }

      const candidateIds = [...new Set((data ?? []).map((r) => r.candidate_id as string))];
      for (const candidateId of candidateIds) {
        await admin
          .from("applications")
          .update({ status: "rejected", updated_at: new Date().toISOString() })
          .eq("candidate_id", candidateId)
          .eq("job_id", jobId);
      }
    }
  } else {
    const agency_stage = parsed.data.agency_stage as string;
    const notifyOnShare = agency_stage === "shared_with_company";
    for (const jobId of uniqueJobIds) {
      const pcIds = items.filter((i) => i.jobId === jobId).map((i) => i.pipelineCandidateId);
      let priorRows: Array<{ id: string; candidate_id: string; agency_stage: string | null }> = [];
      if (notifyOnShare && pcIds.length > 0) {
        const { data: before } = await admin
          .from("pipeline_candidates")
          .select("id, candidate_id, agency_stage")
          .eq("job_id", jobId)
          .in("id", pcIds);
        priorRows = (before ?? []) as Array<{
          id: string;
          candidate_id: string;
          agency_stage: string | null;
        }>;
      }

      const { data, error } = await admin
        .from("pipeline_candidates")
        .update({ agency_stage })
        .eq("job_id", jobId)
        .in("id", pcIds)
        .select("id");

      if (error) {
        logger.error("Agency bulk pipeline: agency_stage failed", { error: String(error), jobId });
        return jsonError("Failed to update pipeline", 500);
      }
      updatedTotal += data?.length ?? 0;

      if (notifyOnShare) {
        for (const row of priorRows) {
          if (isAgencyStageVisibleToCompany(row.agency_stage)) continue;
          fireAgencyShareNotification({
            jobId,
            candidateId: row.candidate_id,
            agencyOrganisationId: ctx.organisationId,
          });
        }
      }
    }
  }

  logger.info("Agency bulk pipeline completed", {
    action,
    userId: ctx.userId,
    itemCount: items.length,
    updatedTotal,
  });

  return jsonSuccess({ updated: updatedTotal });
}
