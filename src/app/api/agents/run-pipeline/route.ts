import { NextRequest } from "next/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleApiError,
  getTenantScopedClient,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { buildScopedRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";
import { runPipelineForJob } from "@/lib/agents/run-pipeline";
import { logger } from "@/lib/observability/logger";
import { requireOrganisationEntitlement } from "@/lib/entitlements";
import { z } from "zod";

const RECRUITER_ROLES = [
  "super_admin",
  "leadership",
  "hiring_manager",
  "recruiter",
  "agency",
] as const;

const requestSchema = z.object({
  jobId: z.string().uuid("Valid job ID required"),
  maxCandidates: z.number().int().min(1).max(80).optional(),
  forceRescore: z.boolean().optional(),
});

/**
 * POST /api/agents/run-pipeline
 * Runs JD Intelligence for the job, then authenticity analysis + screening for candidates
 * (pipeline → applications → fit_scores, deduped, capped by maxCandidates).
 */
export async function POST(request: NextRequest) {
  try {
    const originErr = validateOrigin(request);
    if (originErr) return originErr;

    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Not authenticated", 401);
    if (!hasRole(ctx, ...RECRUITER_ROLES)) {
      return jsonError("Insufficient permissions", 403);
    }

    // Each run fans out to many candidates × multiple Claude calls — throttle hard
    // to cap Anthropic spend from accidental or abusive repeat triggers.
    const rl = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "agents-run-pipeline",
        organisationId: ctx.organisationId ?? "none",
        userId: ctx.userId,
      }),
      limit: 5,
      windowSecs: 60,
    });
    if (!rl.allowed) {
      return jsonError("Too many pipeline runs. Please wait a moment before trying again.", 429);
    }

    const { body, errorResponse } = await parseJsonBody<z.infer<typeof requestSchema>>(
      request,
      "agents/run-pipeline",
    );
    if (errorResponse) return errorResponse;

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
    }

    const { jobId, maxCandidates, forceRescore } = parsed.data;

    const db = await getTenantScopedClient(ctx);
    const { data: jobRow, error: jobErr } = await db
      .jobs()
      .select("id, organisation_id")
      .eq("id", jobId)
      .maybeSingle();

    if (jobErr) {
      logger.error("[api/agents/run-pipeline] job lookup failed", { jobId, error: jobErr.message });
      return jsonError("Failed to verify job access", 500);
    }
    if (!jobRow) {
      return jsonError("Job not found", 404);
    }

    const entitlement = await requireOrganisationEntitlement(
      jobRow.organisation_id as string | null,
      "fitscore_batch",
    );
    if (!entitlement.ok) {
      return jsonError(`Organisation not entitled for FitScore batch: ${entitlement.message}`, 403);
    }

    const result = await runPipelineForJob(jobId, { maxCandidates, forceRescore });

    return jsonSuccess(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/credit balance|Plans & Billing/i.test(msg)) return jsonError(msg, 402);

    logger.error("[api/agents/run-pipeline] error", { error: msg });
    return handleApiError(err, "Failed to run agent pipeline", { route: "agents/run-pipeline" });
  }
}
