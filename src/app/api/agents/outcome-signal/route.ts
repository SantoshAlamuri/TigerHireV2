import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { runOutcomeSignalWriter } from "@/lib/agents/outcome-signal";
import { logger } from "@/lib/observability/logger";
import { ForbiddenError } from "@/lib/security/tenancy";
import {
  assertAgentJobAccess,
  assertCandidateLinkedToJobForAgent,
} from "@/lib/security/agent-access";
import { z } from "zod";

const requestSchema = z.object({
  candidateId: z.string().uuid("Valid candidate ID required"),
  jobId: z.string().uuid("Valid job ID required"),
  /** @deprecated Ignored for writes; organisation is taken from the job. Optional for older clients. */
  organisationId: z.string().uuid().optional(),
  outcome: z.object({
    wasHired: z.boolean(),
    candidateAccepted: z.boolean().optional(),
    daysToHire: z.number().int().positive().optional(),
    wasScheduled: z.boolean().optional(),
    assignmentSubmitted: z.boolean().optional(),
    performanceRating: z.number().int().min(1).max(5).optional(),
    retained6m: z.boolean().optional(),
    retained12m: z.boolean().optional(),
    rejectionReason: z.string().max(1000).optional(),
    lowFitscoreOverride: z.boolean().optional(),
  }),
});

/**
 * POST /api/agents/outcome-signal
 * Records a hiring outcome and refreshes the org's learning index.
 */
export async function POST(request: NextRequest) {
  try {
    const originErr = validateOrigin(request);
    if (originErr) return originErr;

    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Not authenticated", 401);
    if (!hasRole(ctx, "super_admin", "leadership", "hiring_manager", "recruiter")) {
      return jsonError("Insufficient permissions", 403);
    }

    const { body, errorResponse } = await parseJsonBody<z.infer<typeof requestSchema>>(
      request,
      "agents/outcome-signal",
    );
    if (errorResponse) return errorResponse;

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
    }

    const supabase = await createSupabaseServerClient();
    let jobOrgId: string;
    try {
      const jobRow = await assertAgentJobAccess(supabase, ctx, parsed.data.jobId);
      jobOrgId = jobRow.organisation_id;
      if (parsed.data.organisationId && parsed.data.organisationId !== jobOrgId) {
        return jsonError(
          "organisationId does not match this job; omit it or use the job's organisation.",
          400,
        );
      }
      await assertCandidateLinkedToJobForAgent(parsed.data.jobId, parsed.data.candidateId);
    } catch (e) {
      if (e instanceof ForbiddenError) {
        return jsonError(e.message, 403);
      }
      throw e;
    }

    const result = await runOutcomeSignalWriter({
      candidateId: parsed.data.candidateId,
      jobId: parsed.data.jobId,
      organisationId: jobOrgId,
      outcome: parsed.data.outcome,
      recordedBy: ctx.userId,
    });

    return jsonSuccess(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof ForbiddenError) {
      return jsonError(err.message, 403);
    }
    if (msg.includes("Failed to record outcome")) return jsonError(msg, 500);

    logger.error("[api/agents/outcome-signal] error", { error: msg });
    return handleApiError(err, "Failed to record outcome signal", {
      route: "agents/outcome-signal",
    });
  }
}
