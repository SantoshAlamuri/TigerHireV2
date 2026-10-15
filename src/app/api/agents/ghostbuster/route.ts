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
import { runGhostbuster } from "@/lib/agents/ghostbuster-authenticity";
import { logger } from "@/lib/observability/logger";
import { ForbiddenError } from "@/lib/security/tenancy";
import { assertRecruiterCanAccessCandidateForAgent } from "@/lib/security/agent-access";
import { z } from "zod";

const requestSchema = z.object({
  candidateId: z.string().uuid("Valid candidate ID required"),
});

/**
 * POST /api/agents/ghostbuster
 * Candidate Authenticity Check — scans CV text for AI-authorship and prompt-manipulation signals.
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

    const { body, errorResponse } = await parseJsonBody<{ candidateId: string }>(
      request,
      "agents/ghostbuster",
    );
    if (errorResponse) return errorResponse;

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
    }

    const supabase = await createSupabaseServerClient();
    try {
      await assertRecruiterCanAccessCandidateForAgent(supabase, ctx, parsed.data.candidateId);
    } catch (e) {
      if (e instanceof ForbiddenError) {
        return jsonError(e.message, 403);
      }
      throw e;
    }

    const result = await runGhostbuster(parsed.data.candidateId);
    return jsonSuccess(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof ForbiddenError) return jsonError(err.message, 403);
    if (msg === "Candidate not found") return jsonError(msg, 404);
    if (msg.includes("no CV text")) return jsonError(msg, 400);
    if (/credit balance|Plans & Billing/i.test(msg)) return jsonError(msg, 402);

    logger.error("[api/agents/ghostbuster] error", { error: msg });
    return handleApiError(err, "Failed to run authenticity check", {
      route: "agents/ghostbuster",
    });
  }
}
