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
import { runJdIntelligence } from "@/lib/agents/jd-intelligence";
import { logger } from "@/lib/observability/logger";
import { ForbiddenError } from "@/lib/security/tenancy";
import { assertAgentJobAccess } from "@/lib/security/agent-access";
import { z } from "zod";

const requestSchema = z.object({
  jobId: z.string().uuid("Valid job ID required"),
});

/**
 * POST /api/agents/jd-intelligence
 * Runs the JD Intelligence Agent for a job — generates a skills rubric from the JD.
 * Requires admin or hiring_manager role.
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
        route: "agents-jd-intelligence",
        organisationId: ctx.organisationId ?? "none",
        userId: ctx.userId,
      }),
      limit: 20,
      windowSecs: 60,
    });
    if (!rl.allowed) {
      return jsonError("Too many JD analysis requests. Please wait a moment.", 429);
    }

    const { body, errorResponse } = await parseJsonBody<{ jobId: string }>(
      request,
      "agents/jd-intelligence",
    );
    if (errorResponse) return errorResponse;

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
    }

    const supabase = await createSupabaseServerClient();
    try {
      await assertAgentJobAccess(supabase, ctx, parsed.data.jobId);
    } catch (e) {
      if (e instanceof ForbiddenError) {
        return jsonError("Job not found", 404);
      }
      throw e;
    }

    const result = await runJdIntelligence(parsed.data.jobId);

    return jsonSuccess({
      jobId: result.jobId,
      rubric: result.rubric,
      sectionsUpdated: result.sectionsUpdated,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "Job not found") return jsonError("Job not found", 404);
    if (msg.includes("no title or description")) return jsonError(msg, 400);
    if (/credit balance|Plans & Billing/i.test(msg)) return jsonError(msg, 402);

    logger.error("[api/agents/jd-intelligence] error", { error: msg });
    return handleApiError(err, "Failed to generate JD rubric", {
      route: "agents/jd-intelligence",
    });
  }
}
