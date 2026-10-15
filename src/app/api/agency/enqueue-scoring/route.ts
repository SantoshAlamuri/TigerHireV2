import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
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
import { reportError } from "@/lib/observability/report-error";
import {
  enqueueAgencyCandidateScoring,
  filterAgencyAccessibleCandidateIds,
} from "@/lib/agency/enqueue-candidate-scoring";

const bodySchema = z.object({
  candidateIds: z.array(z.string().uuid()).min(1).max(100),
});

/**
 * POST /api/agency/enqueue-scoring
 * Queue background CV parse + FitScore for agency candidates (Inngest).
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "agency", "super_admin")) return jsonError("Forbidden", 403);
    if (!ctx.organisationId) return jsonError("No organisation linked", 400);

    let rlAllowed = false;
    try {
      const rl = await checkRateLimit({
        key: buildScopedRateLimitKey({
          route: "agency-enqueue-scoring",
          organisationId: ctx.organisationId,
          userId: ctx.userId,
        }),
        limit: 30,
        windowSecs: 60,
      });
      rlAllowed = rl.allowed;
    } catch (err) {
      reportError(err, {
        route: "POST /api/agency/enqueue-scoring",
        userId: ctx.userId,
      });
      return jsonError("Rate limit check unavailable. Please try again later.", 503);
    }
    if (!rlAllowed) return jsonError("Too many requests. Please wait a moment.", 429);

    const parsedBody = await parseJsonBody<unknown>(request, "POST /api/agency/enqueue-scoring");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;

    const parsed = bodySchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      return jsonError("candidateIds must be a non-empty array of UUIDs (max 100)", 400);
    }

    const admin = createSupabaseAdmin();
    const accessible = await filterAgencyAccessibleCandidateIds(
      admin,
      parsed.data.candidateIds,
      ctx.organisationId,
    );

    if (accessible.length === 0) {
      return jsonError("No accessible candidates found for your agency clients", 404);
    }

    const { queued, total } = await enqueueAgencyCandidateScoring(accessible, {
      organisationId: ctx.organisationId,
      userId: ctx.userId,
    });

    return jsonSuccess({
      queued,
      total,
      skipped: parsed.data.candidateIds.length - accessible.length,
    });
  } catch (err) {
    return handleApiError(err, "Failed to enqueue agency scoring", {
      route: "POST /api/agency/enqueue-scoring",
    });
  }
}
