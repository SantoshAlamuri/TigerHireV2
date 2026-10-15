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
import { hybridBatchRequestSchema } from "@/lib/validations/fitscore-hybrid";
import {
  FEATURE_FLAG_HYBRID_V2,
  HybridFitScoreError,
  getJdBaseByJobId,
} from "@/lib/fitscore/hybrid";
import { loadJobForHybridPipeline } from "@/lib/fitscore/hybrid/api-access";
import { ANTHROPIC_CREDIT_ERROR_MESSAGE } from "@/lib/services/anthropic";
import { isAnthropicDeferableError } from "@/lib/services/anthropic-circuit";
import { reportError } from "@/lib/observability/report-error";
import { FitScoreService } from "@/lib/services/FitScoreService";
import { addSentryBreadcrumb, setSentryRequestContext } from "@/lib/observability/sentry";
import { pushScoringDlq } from "@/lib/observability/scoring-dlq";

const FITSCORE_CANDIDATE_SELECT =
  "id, name, full_name, skills, experience_years, location, intent_score, resume_url, cv_url, cv_raw_text, current_role, current_company, seniority_level, updated_at";

/**
 * Batch scoring runs **sequentially** to respect Anthropic rate limits during beta.
 * Post-launch: consider a small pool (3–5) of concurrent workers with a token-bucket limiter.
 */

type FitResult =
  | {
      candidateId: string;
      ok: true;
      fitScore: number;
      fitLabel: string;
      fitLabelColor: string;
      extraction: unknown;
      explanation: string;
      breakdown: unknown;
      deduped?: boolean;
    }
  | { candidateId: string; ok: false; error: string };

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;

  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!(await isEnabled(FEATURE_FLAG_HYBRID_V2, ctx.organisationId))) {
      return jsonError("Hybrid FitScore v2 is not enabled.", 403);
    }

    const rl = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "fitscore-hybrid-batch",
        organisationId: ctx.organisationId,
        userId: ctx.userId,
      }),
      limit: 5,
      windowSecs: 60,
    });
    if (!rl.allowed) return jsonError("Rate limit exceeded. Please wait.", 429);

    const parsedBody = await parseJsonBody(request, "POST /api/fitscore/batch");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;

    const parsed = hybridBatchRequestSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

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

    const jdBase = await getJdBaseByJobId(admin, parsed.data.jobId);
    if (!jdBase) return jsonError("No JD Base document for this job.", 400);
    if (!jdBase.approvedBy) {
      return jsonError(
        "JD Base awaiting hiring manager approval. Review weights and approve before scoring.",
        428,
      );
    }

    const results: FitResult[] = [];

    for (const candidateId of parsed.data.candidateIds) {
      try {
        const { data: candidate, error: cErr } = await admin
          .from("candidates")
          .select(FITSCORE_CANDIDATE_SELECT)
          .eq("id", candidateId)
          .single();
        if (cErr || !candidate) {
          results.push({ candidateId, ok: false, error: "Candidate not found" });
          continue;
        }

        const result = await FitScoreService.computeSingle(admin, parsed.data.jobId, candidateId, {
          saveToDb: true,
          source: "api",
          onUnapprovedJdBase: "throw",
        });
        if (
          result &&
          typeof result === "object" &&
          "scoring_status" in result &&
          (result as { scoring_status: string }).scoring_status === "deduped"
        ) {
          const existing = await FitScoreService.getLatestProductionScore(
            admin,
            parsed.data.jobId,
            candidateId,
          );
          if (existing && typeof existing.overall_score === "number") {
            results.push({
              candidateId,
              ok: true,
              fitScore: existing.overall_score,
              fitLabel: "",
              fitLabelColor: "",
              extraction: null,
              explanation: "",
              breakdown: null,
              deduped: true,
            });
            continue;
          }
        }
        if (
          !result ||
          typeof result !== "object" ||
          !("fitScore" in result) ||
          typeof (result as { fitScore: unknown }).fitScore !== "number"
        ) {
          results.push({ candidateId, ok: false, error: "Scoring skipped or incomplete" });
          continue;
        }
        const hybrid = result as {
          fitScore: number;
          fitLabel: string;
          fitLabelColor: string;
          extraction: unknown;
          explanation: string;
          breakdown: unknown;
        };

        results.push({
          candidateId,
          ok: true,
          fitScore: hybrid.fitScore,
          fitLabel: hybrid.fitLabel,
          fitLabelColor: hybrid.fitLabelColor,
          extraction: hybrid.extraction,
          explanation: hybrid.explanation,
          breakdown: hybrid.breakdown,
        });
      } catch (e) {
        if (isAnthropicDeferableError(e)) {
          await FitScoreService.markDeferredScore(
            admin,
            parsed.data.jobId,
            candidateId,
            e instanceof Error ? e.message.slice(0, 200) : "anthropic_unavailable",
          );
          setSentryRequestContext({
            route: "/api/fitscore/batch",
            userId: ctx.userId,
            organisationId: ctx.organisationId,
            scoringStatus: "deferred",
          });
          addSentryBreadcrumb({
            category: "fitscore",
            message: "Batch candidate deferred due to Anthropic availability",
            level: "warning",
            data: { job_id: parsed.data.jobId, candidate_id: candidateId },
          });
          results.push({ candidateId, ok: false, error: "scoring_deferred" });
          continue;
        }
        const msg =
          e instanceof HybridFitScoreError ? e.message : e instanceof Error ? e.message : String(e);
        await pushScoringDlq(admin, {
          jobId: parsed.data.jobId,
          candidateId,
          organisationId: ctx.organisationId,
          route: "POST /api/fitscore/batch",
          errorMessage: msg,
        });
        results.push({ candidateId, ok: false, error: msg });
      }
    }

    return jsonSuccess({ results }, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === ANTHROPIC_CREDIT_ERROR_MESSAGE || /credit balance|Plans & Billing/i.test(msg)) {
      return jsonError(ANTHROPIC_CREDIT_ERROR_MESSAGE, 402);
    }
    reportError(err, { route: "POST /api/fitscore/batch" });
    return handleApiError(err, "Failed to run hybrid FitScore batch", {
      route: "POST /api/fitscore/batch",
    });
  }
}
