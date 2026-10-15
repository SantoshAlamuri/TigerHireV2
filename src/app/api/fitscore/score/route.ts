import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { buildScopedRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";
import { isEnabled } from "@/lib/feature-flags";
import { requireOrganisationEntitlement } from "@/lib/entitlements";
import { hybridScoreRequestSchema } from "@/lib/validations/fitscore-hybrid";
import { FEATURE_FLAG_HYBRID_V2, HybridFitScoreError } from "@/lib/fitscore/hybrid";
import { loadJobForHybridPipeline } from "@/lib/fitscore/hybrid/api-access";
import { ANTHROPIC_CREDIT_ERROR_MESSAGE } from "@/lib/services/anthropic";
import { isAnthropicDeferableError } from "@/lib/services/anthropic-circuit";
import { NO_RESUME_TEXT_MESSAGE } from "@/lib/fitscore/score-input-helpers";
import { reportError } from "@/lib/observability/report-error";
import { FitScoreService } from "@/lib/services/FitScoreService";
import { addSentryBreadcrumb, setSentryRequestContext } from "@/lib/observability/sentry";
import { pushScoringDlq } from "@/lib/observability/scoring-dlq";

const FITSCORE_CANDIDATE_SELECT =
  "id, name, full_name, skills, experience_years, location, intent_score, resume_url, cv_url, cv_raw_text, current_role, current_company, seniority_level, updated_at";

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  let requestedJobId: string | null = null;
  let requestedCandidateId: string | null = null;
  let requestedOrganisationId: string | null = null;
  try {
    const ctx = await getAuthContext();
    requestedOrganisationId = ctx?.organisationId ?? null;
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!(await isEnabled(FEATURE_FLAG_HYBRID_V2, ctx.organisationId))) {
      return jsonError("Hybrid FitScore v2 is not enabled.", 403);
    }

    const rl = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "fitscore-hybrid",
        organisationId: ctx.organisationId,
        userId: ctx.userId,
      }),
      limit: 15,
      windowSecs: 60,
    });
    if (!rl.allowed) return jsonError("Rate limit exceeded. Please wait.", 429);

    const parsedBody = await parseJsonBody(request, "POST /api/fitscore/score");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;

    const parsed = hybridScoreRequestSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);
    requestedJobId = parsed.data.jobId;
    requestedCandidateId = parsed.data.candidateId;

    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "agency")) {
      return jsonError("Forbidden", 403);
    }

    if (!hasRole(ctx, "super_admin")) {
      const entitlement = await requireOrganisationEntitlement(
        ctx.organisationId,
        "fitscore_batch",
      );
      if (!entitlement.ok) {
        return jsonError(`Feature not available: ${entitlement.message}`, 403);
      }
    }

    const server = await createSupabaseServerClient();
    const admin = createSupabaseAdmin();
    const job = await loadJobForHybridPipeline(server, admin, ctx, parsed.data.jobId);
    if (!job) return jsonError("Job not found or access denied", 404);

    const { data: candidate, error: cErr } = await admin
      .from("candidates")
      .select(FITSCORE_CANDIDATE_SELECT)
      .eq("id", parsed.data.candidateId)
      .single();
    if (cErr || !candidate) return jsonError("Candidate not found", 404);

    let result;
    try {
      result = await FitScoreService.computeSingle(
        admin,
        parsed.data.jobId,
        parsed.data.candidateId,
        {
          saveToDb: true,
          source: "api",
          onUnapprovedJdBase: "throw",
        },
      );
      if (
        result &&
        typeof result === "object" &&
        "scoring_status" in result &&
        ((result as { scoring_status: string }).scoring_status === "deduped" ||
          (result as { scoring_status: string }).scoring_status === "concurrent_skip")
      ) {
        const existing = await FitScoreService.getLatestProductionScore(
          admin,
          parsed.data.jobId,
          parsed.data.candidateId,
        );
        if (existing && typeof existing.overall_score === "number") {
          return jsonSuccess(
            {
              fitScore: existing.overall_score,
              scoring_status: (result as { scoring_status: string }).scoring_status,
              message: "Using existing score (dedupe or concurrent guard).",
            },
            200,
          );
        }
      }
    } catch (error) {
      if (isAnthropicDeferableError(error)) {
        await FitScoreService.markDeferredScore(
          admin,
          parsed.data.jobId,
          parsed.data.candidateId,
          error instanceof Error ? error.message.slice(0, 200) : "anthropic_unavailable",
        );
        setSentryRequestContext({
          route: "/api/fitscore/score",
          userId: ctx.userId,
          organisationId: ctx.organisationId,
          scoringStatus: "deferred",
        });
        addSentryBreadcrumb({
          category: "fitscore",
          message: "Hybrid score deferred due to Anthropic availability",
          level: "warning",
          data: { job_id: parsed.data.jobId, candidate_id: parsed.data.candidateId },
        });
        return jsonSuccess(
          {
            scoring_status: "deferred",
            message: "Scoring is queued due to temporary model availability. Please retry shortly.",
          },
          202,
        );
      }
      throw error;
    }

    const hybrid = result as {
      fitScore: number;
      fitLabel: string;
      fitLabelColor: string;
      extraction: unknown;
      explanation: string;
      evidence: unknown;
      breakdown: unknown;
      confidence: unknown;
      market: unknown;
      idealMatch: unknown;
      verdict: { label: string; icon: string; color: string; bg: string; action: string };
      shadowScore: number;
    };

    return jsonSuccess(
      {
        fitScore: hybrid.fitScore,
        fitLabel: hybrid.fitLabel,
        fitLabelColor: hybrid.fitLabelColor,
        extraction: hybrid.extraction,
        explanation: hybrid.explanation,
        evidence: hybrid.evidence,
        breakdown: hybrid.breakdown,
        confidence: hybrid.confidence,
        market: hybrid.market,
        idealMatch: hybrid.idealMatch,
        verdict: {
          label: hybrid.verdict.label,
          icon: hybrid.verdict.icon,
          color: hybrid.verdict.color,
          bg: hybrid.verdict.bg,
          action: hybrid.verdict.action,
        },
        shadowScore: hybrid.shadowScore,
      },
      201,
    );
  } catch (err) {
    if (err instanceof HybridFitScoreError) {
      if (err.code === "no_jd_base") return jsonError(err.message, 400);
      if (err.code === "jd_base_not_approved") return jsonError(err.message, 428);
      return jsonError(err.message, 502);
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === NO_RESUME_TEXT_MESSAGE) return jsonError(NO_RESUME_TEXT_MESSAGE, 400);
    if (msg === ANTHROPIC_CREDIT_ERROR_MESSAGE || /credit balance|Plans & Billing/i.test(msg)) {
      return jsonError(ANTHROPIC_CREDIT_ERROR_MESSAGE, 402);
    }
    if (requestedJobId && requestedCandidateId) {
      await pushScoringDlq(createSupabaseAdmin(), {
        jobId: requestedJobId,
        candidateId: requestedCandidateId,
        organisationId: requestedOrganisationId,
        route: "POST /api/fitscore/score",
        errorMessage: msg,
      });
    }
    reportError(err, { route: "POST /api/fitscore/score" });
    return handleApiError(err, "Failed to compute hybrid FitScore", {
      route: "POST /api/fitscore/score",
    });
  }
}
