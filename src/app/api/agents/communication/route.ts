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
import { runCommunication } from "@/lib/agents/communication";
import type { MessageType } from "@/lib/agents/communication";
import { logger } from "@/lib/observability/logger";
import { ForbiddenError } from "@/lib/security/tenancy";
import {
  assertAgentJobAccess,
  assertCandidateLinkedToJobForAgent,
  assertRecruiterCanAccessCandidateForAgent,
} from "@/lib/security/agent-access";
import { z } from "zod";

const requestSchema = z.object({
  candidateId: z.string().uuid("Valid candidate ID required"),
  messageType: z.enum(["outreach", "status_update", "rejection", "interview_invite"]),
  jobId: z.string().uuid().optional(),
  context: z.string().max(2000).optional(),
  dryRun: z.boolean().optional(),
});

/**
 * POST /api/agents/communication
 * Generates and sends a personalised email to a candidate.
 * Pass dryRun: true to generate without sending.
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
        route: "agents-communication",
        organisationId: ctx.organisationId ?? "none",
        userId: ctx.userId,
      }),
      limit: 20,
      windowSecs: 60,
    });
    if (!rl.allowed) {
      return jsonError("Too many message requests. Please wait a moment.", 429);
    }

    const { body, errorResponse } = await parseJsonBody<z.infer<typeof requestSchema>>(
      request,
      "agents/communication",
    );
    if (errorResponse) return errorResponse;

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
    }

    const supabase = await createSupabaseServerClient();
    try {
      if (parsed.data.jobId) {
        await assertAgentJobAccess(supabase, ctx, parsed.data.jobId);
        await assertCandidateLinkedToJobForAgent(parsed.data.jobId, parsed.data.candidateId);
      } else {
        await assertRecruiterCanAccessCandidateForAgent(supabase, ctx, parsed.data.candidateId);
      }
    } catch (e) {
      if (e instanceof ForbiddenError) {
        return jsonError(e.message, 403);
      }
      throw e;
    }

    const result = await runCommunication({
      candidateId: parsed.data.candidateId,
      messageType: parsed.data.messageType as MessageType,
      jobId: parsed.data.jobId,
      context: parsed.data.context,
      dryRun: parsed.data.dryRun,
    });

    return jsonSuccess(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof ForbiddenError) {
      return jsonError(err.message, 403);
    }
    if (msg === "Candidate not found") return jsonError(msg, 404);
    if (msg.includes("no email address")) return jsonError(msg, 400);
    if (/credit balance|Plans & Billing/i.test(msg)) return jsonError(msg, 402);

    logger.error("[api/agents/communication] error", { error: msg });
    return handleApiError(err, "Failed to generate communication", {
      route: "agents/communication",
    });
  }
}
