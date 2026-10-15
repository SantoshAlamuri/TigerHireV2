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
import { buildScopedRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";
import { runScreening } from "@/lib/agents/screening";
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
  forceRescore: z.boolean().optional(),
});

/**
 * POST /api/agents/screening
 * Screens a candidate against a job using the AI rubric.
 * Returns existing score if available (unless forceRescore: true).
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

    const rl = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "agents-screening",
        organisationId: ctx.organisationId ?? "none",
        userId: ctx.userId,
      }),
      limit: 20,
      windowSecs: 60,
    });
    if (!rl.allowed) {
      return jsonError("Too many screening requests. Please wait a moment.", 429);
    }

    const { body, errorResponse } = await parseJsonBody<z.infer<typeof requestSchema>>(
      request,
      "agents/screening",
    );
    if (errorResponse) return errorResponse;

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
    }

    const supabase = await createSupabaseServerClient();
    try {
      await assertAgentJobAccess(supabase, ctx, parsed.data.jobId);
      await assertCandidateLinkedToJobForAgent(parsed.data.jobId, parsed.data.candidateId);
    } catch (e) {
      if (e instanceof ForbiddenError) {
        return jsonError(e.message, 403);
      }
      throw e;
    }

    const result = await runScreening(parsed.data.candidateId, parsed.data.jobId, {
      forceRescore: parsed.data.forceRescore,
    });

    return jsonSuccess(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof ForbiddenError) {
      return jsonError(err.message, 403);
    }
    if (msg === "Job not found" || msg === "Candidate not found") return jsonError(msg, 404);
    if (msg.includes("no CV text")) return jsonError(msg, 400);
    if (/credit balance|Plans & Billing/i.test(msg)) return jsonError(msg, 402);

    logger.error("[api/agents/screening] error", { error: msg });
    return handleApiError(err, "Failed to screen candidate", { route: "agents/screening" });
  }
}
