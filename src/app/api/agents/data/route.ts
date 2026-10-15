import { NextRequest } from "next/server";
import { z } from "zod";
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
import { runDataAgent } from "@/lib/agents/data-agent/agent";
import { logAgentQuery } from "@/lib/agents/data-agent/audit";
import { ANTHROPIC_CREDIT_ERROR_MESSAGE } from "@/lib/services/anthropic";
import { logger } from "@/lib/observability/logger";
import type { UserRole } from "@/types/database";

/** Every non-candidate (i.e. organisation) role may query their own org's data. */
const ORG_ROLES: UserRole[] = [
  "super_admin",
  "leadership",
  "recruiter",
  "interviewer",
  "finance",
  "agency",
  "hiring_manager",
  "employee",
];

const requestSchema = z.object({
  question: z.string().trim().min(1, "Ask a question.").max(1000),
});

/**
 * POST /api/agents/data
 * Read-only "ask your hiring data" agent. Routes a natural-language question
 * to one typed tool, runs a parameterised SELECT through the recruiter's
 * user-JWT (RLS-scoped) client, and phrases the result. No writes except the
 * audit log.
 */
export async function POST(request: NextRequest) {
  try {
    const originErr = validateOrigin(request);
    if (originErr) return originErr;

    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Not authenticated", 401);
    if (!hasRole(ctx, ...ORG_ROLES)) {
      return jsonError("Insufficient permissions", 403);
    }
    if (!ctx.organisationId) {
      return jsonError(
        "This account is not linked to an organisation, so there is no hiring data to query.",
        400,
      );
    }

    const { body, errorResponse } = await parseJsonBody<{ question: string }>(
      request,
      "agents/data",
    );
    if (errorResponse) return errorResponse;

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
    }

    // User-JWT client — RLS scopes every read/write to this recruiter's org.
    const supabase = await createSupabaseServerClient();

    const result = await runDataAgent(parsed.data.question, { supabase });

    // Audit every turn (best-effort; never blocks the answer).
    await logAgentQuery(supabase, {
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      question: parsed.data.question,
      tool: result.kind === "answer" ? result.tool : "none",
      args: result.kind === "answer" ? (result.args as Record<string, unknown>) : null,
      rowCount: result.kind === "answer" ? result.rowCount : null,
      latencyMs: result.latencyMs,
    });

    return jsonSuccess({
      rejected: result.kind === "rejected",
      answer: result.prose,
      artifact: result.kind === "answer" ? result.artifact : null,
      meta:
        result.kind === "answer"
          ? { tool: result.tool, args: result.args, rowCount: result.rowCount }
          : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === ANTHROPIC_CREDIT_ERROR_MESSAGE || /credit balance|Plans & Billing/i.test(msg)) {
      return jsonError(msg, 402);
    }
    logger.error("[api/agents/data] error", { error: msg });
    return handleApiError(err, "Failed to answer the question", {
      route: "agents/data",
    });
  }
}
