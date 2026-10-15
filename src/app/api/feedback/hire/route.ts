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
import { EmployeeRepository } from "@/lib/repositories/EmployeeRepository";
import { upsertHiringOutcome } from "@/lib/services/hiring-outcomes";
import { logger } from "@/lib/observability/logger";
import { triggerPayoutIfEligible } from "@/lib/agents/payout-trigger";
import { z } from "zod";
import { validateOrigin } from "@/lib/security/csrf";

const bodySchema = z
  .object({
    jobId: z.string().uuid(),
    candidateId: z.string().uuid(),
    outcome: z.enum(["hired", "rejected"]),
  })
  .strict();

/**
 * POST /api/feedback/hire — Log hire/rejected for FitScore model retraining (DeliverFlow).
 * Updates application status to hired or rejected; used for feedback loop.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
  if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "agency")) {
    return jsonError("Forbidden", 403);
  }

  const parsedBody = await parseJsonBody(request, "POST /api/feedback/hire");
  if (parsedBody.errorResponse) return parsedBody.errorResponse;
  const body = parsedBody.body;

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues.map((i) => i.message).join("; "), 422);
  }

  const supabase = await createSupabaseServerClient();
  const { jobId, candidateId, outcome } = parsed.data;

  const { data: job } = await supabase
    .from("jobs")
    .select("id, organisation_id")
    .eq("id", jobId)
    .single();

  if (!job) return jsonError("Job not found", 404);
  if (!hasRole(ctx, "super_admin") && job.organisation_id !== ctx.organisationId) {
    return jsonError("Forbidden", 403);
  }

  const status = outcome === "hired" ? "hired" : "rejected";

  const { data: app } = await supabase
    .from("applications")
    .select("id")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .maybeSingle();

  if (app) {
    const { error } = await supabase
      .from("applications")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", app.id);
    if (error) {
      logger.error("Feedback hire update failed", { error: String(error) });
      return jsonError("Failed to record feedback", 500);
    }
    if (status === "hired") {
      void (async () => {
        try {
          await triggerPayoutIfEligible({
            supabase: createSupabaseAdmin(),
            candidateId,
            jobId,
            newStatus: "hired",
          });
        } catch (err) {
          logger.warn("feedback/hire: payout trigger failed", {
            candidateId,
            jobId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
    }
  }

  const { error: fbError } = await supabase
    .from("delivery_feedback")
    .upsert(
      { job_id: jobId, candidate_id: candidateId, outcome: status },
      { onConflict: "job_id,candidate_id" },
    );
  if (fbError) {
    logger.error("Feedback hire delivery_feedback upsert failed", {
      error: String(fbError),
    });
  }

  const adminForOutcome = createSupabaseAdmin();
  await upsertHiringOutcome(adminForOutcome, {
    jobId,
    candidateId,
    outcome,
    recordedByUserId: ctx.userId,
    source: "feedback_hire_api",
    sourceEventId: `feedback-hire:${jobId}:${candidateId}:${outcome}`,
  });

  if (outcome === "hired" && job.organisation_id) {
    try {
      await EmployeeRepository.onboardAsEmployee(supabase, {
        candidateId,
        companyId: job.organisation_id,
      });
    } catch (err) {
      logger.error("Employee onboarding failed via feedback/hire", {
        candidateId,
        jobId,
        error: String(err),
      });
    }
  }

  return jsonSuccess({ outcome: status }, 200);
}
