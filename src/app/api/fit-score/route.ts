import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fitScoreRequestSchema, batchFitScoreSchema } from "@/lib/validations/organisations";
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
import { FitScoreService } from "@/lib/services/FitScoreService";
import { ANTHROPIC_CREDIT_ERROR_MESSAGE } from "@/lib/services/anthropic";
import { isAnthropicDeferableError } from "@/lib/services/anthropic-circuit";
import { addSentryBreadcrumb, setSentryRequestContext } from "@/lib/observability/sentry";
import { logger } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/report-error";
import { NO_RESUME_TEXT_MESSAGE } from "@/lib/fitscore/score-input-helpers";
import { env } from "@/lib/config/env";

/** Map known FitScore errors to user-facing message and status. */
function fitScoreErrorResponse(err: unknown): NextResponse | null {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "Job not found")
    return jsonError("Job not found. The role may have been removed.", 404);
  if (msg === "Candidate not found")
    return jsonError("Candidate profile not found. Complete your profile to get a FitScore.", 404);
  if (msg === NO_RESUME_TEXT_MESSAGE) return jsonError(NO_RESUME_TEXT_MESSAGE, 400);
  if (msg === ANTHROPIC_CREDIT_ERROR_MESSAGE || /credit balance|Plans & Billing/i.test(msg))
    return jsonError(ANTHROPIC_CREDIT_ERROR_MESSAGE, 402);
  if (msg === "Failed to save FitScore" || msg.startsWith("Failed to save FitScore:"))
    return jsonError("Score was computed but could not be saved. Please try again.", 500);
  if (/no JSON object|invalid response|JSON/i.test(msg))
    return jsonError("Scoring service returned an invalid response. Please try again.", 502);
  return null;
}

function normalizeScoreForApi(score: unknown): Record<string, unknown> {
  if (!score || typeof score !== "object") return {};
  const value = score as Record<string, unknown>;
  const overallScore =
    (value.overallScore as number | undefined) ??
    (value.score as number | undefined) ??
    (value.fitScore as number | undefined);
  const normalized: Record<string, unknown> = {
    ...value,
    overallScore,
    score: (value.score as number | undefined) ?? overallScore,
    band: (value.band as string | undefined) ?? (value.fitLabel as string | undefined),
    greenFlags:
      (value.greenFlags as string[] | undefined) ??
      (value.green_flags as string[] | undefined) ??
      [],
    amberFlags:
      (value.amberFlags as string[] | undefined) ??
      (value.amber_flags as string[] | undefined) ??
      [],
    redFlags:
      (value.redFlags as string[] | undefined) ?? (value.red_flags as string[] | undefined) ?? [],
    interview_angles:
      (value.interview_angles as string[] | undefined) ??
      (value.interviewAngles as string[] | undefined),
  };
  if (!env.ffConfidenceBand) {
    delete normalized.confidence;
  }
  if (!env.ffVerdictCvEvidence) {
    delete normalized.evidence_json;
    delete normalized.evidence_snapshot;
    delete normalized.evidence;
  }
  return normalized;
}

function sanitizeScoreRecord(score: unknown): Record<string, unknown> {
  if (!score || typeof score !== "object") return {};
  const row = { ...(score as Record<string, unknown>) };
  if (!env.ffConfidenceBand) delete row.confidence;
  if (!env.ffVerdictCvEvidence) {
    delete row.evidence_json;
    delete row.evidence_snapshot;
    delete row.evidence;
  }
  return row;
}
import { buildScopedRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";
import { validateOrigin } from "@/lib/security/csrf";
import { enqueue } from "@/lib/jobs/queue";
import { isEnabled } from "@/lib/feature-flags";
import { requireOrganisationEntitlement } from "@/lib/entitlements";
import { getJdBaseByJobId } from "@/lib/fitscore/hybrid";
import { assertJobAccess } from "@/lib/job-access";

const SAFETY_MARGIN = 0.5;
const INLINE_BATCH_CANDIDATE_HARD_LIMIT = 40;
const INLINE_BATCH_CANDIDATE_EFFECTIVE_LIMIT = Math.max(
  1,
  Math.floor(INLINE_BATCH_CANDIDATE_HARD_LIMIT * SAFETY_MARGIN),
);

const FIT_SCORE_GET_CACHE_TTL_MS = 15_000;
const fitScoreGetCache = new Map<string, { at: number; value: unknown }>();
const JD_BASE_NOT_APPROVED_MESSAGE =
  "JD Base awaiting hiring manager approval. Review weights and approve before scoring.";

function invalidateFitScoreGetCache(): void {
  fitScoreGetCache.clear();
}

async function requireApprovedJdBase(jobId: string): Promise<NextResponse | null> {
  const admin = createSupabaseAdmin();
  const jdBase = await getJdBaseByJobId(admin, jobId);
  if (!jdBase?.approvedBy) {
    return NextResponse.json(
      {
        error: JD_BASE_NOT_APPROVED_MESSAGE,
        code: "jd_base_not_approved",
      },
      { status: 428 },
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const { searchParams } = request.nextUrl;
    const jobId = searchParams.get("jobId");
    const candidateId = searchParams.get("candidateId");
    const fields = searchParams.get("fields");
    const cacheKey = `${ctx.userId}:${ctx.organisationId ?? "no-org"}:${request.nextUrl.search}`;
    const cached = fitScoreGetCache.get(cacheKey);
    if (cached && Date.now() - cached.at < FIT_SCORE_GET_CACHE_TTL_MS) {
      return jsonSuccess(cached.value);
    }

    let supabase;
    try {
      supabase = await createSupabaseServerClient();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Supabase not configured";
      if (message.includes("Supabase env vars")) {
        return jsonError("Database not configured. Please check your Supabase credentials.", 503);
      }
      throw err;
    }

    if (!jobId && !candidateId) {
      if (ctx.organisationId && hasRole(ctx, "leadership", "recruiter")) {
        const scores = (await FitScoreService.listForOrg(supabase, ctx.organisationId)).map(
          sanitizeScoreRecord,
        );
        const value = { fitScores: scores };
        fitScoreGetCache.set(cacheKey, { at: Date.now(), value });
        return jsonSuccess(value);
      }
      if (hasRole(ctx, "hiring_manager")) {
        const scores = (await FitScoreService.listForHiringManager(supabase, ctx.userId)).map(
          sanitizeScoreRecord,
        );
        const value = { fitScores: scores };
        fitScoreGetCache.set(cacheKey, { at: Date.now(), value });
        return jsonSuccess(value);
      }
      return jsonError("Provide jobId or candidateId query param", 400);
    }

    if (jobId) {
      const scores = (
        fields === "review"
          ? await FitScoreService.listForJobReview(supabase, jobId)
          : await FitScoreService.listForJob(supabase, jobId)
      ).map(sanitizeScoreRecord);
      const value = { scores };
      fitScoreGetCache.set(cacheKey, { at: Date.now(), value });
      return jsonSuccess(value);
    }

    const scores = (await FitScoreService.listForCandidate(supabase, candidateId!)).map(
      sanitizeScoreRecord,
    );
    const value = { scores };
    fitScoreGetCache.set(cacheKey, { at: Date.now(), value });
    return jsonSuccess(value);
  } catch (err) {
    return handleApiError(err, "Failed to fetch scores", {
      route: "GET /api/fit-score",
    });
  }
}

export async function POST(request: NextRequest) {
  // LEGACY — prefer the hybrid endpoint. This route enforces JD Base approval and will be removed post-launch.
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  let jobId: string | undefined;
  let candidateId: string | undefined;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const rl = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "fitscore",
        organisationId: ctx.organisationId,
        userId: ctx.userId,
      }),
      limit: 20,
      windowSecs: 60,
    });
    if (!rl.allowed) return jsonError("FitScore rate limit exceeded. Please wait.", 429);

    const parsedBody = await parseJsonBody(request, "POST /api/fit-score");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const body = parsedBody.body;
    const supabase = await createSupabaseServerClient();
    const hybridExecutionEnabled = await isEnabled("fitscore_hybrid_execution", ctx.organisationId);

    if (hasRole(ctx, "candidate_pro", "candidate_free")) {
      return jsonError(
        "Candidates cannot run FitScore manually. Scores are generated after you apply to a job.",
        403,
      );
    }

    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "agency")) {
      return jsonError("Forbidden", 403);
    }

    if (!hasRole(ctx, "super_admin")) {
      const entitlement = await requireOrganisationEntitlement(
        ctx.organisationId,
        "fitscore_batch",
      );
      if (!entitlement.ok) {
        return jsonError(
          `Feature not available for your organisation: ${entitlement.message}`,
          403,
        );
      }
    }

    // Check single scoring FIRST (has both jobId + candidateId)
    // This must come before batch, because batchFitScoreSchema also matches {jobId} alone
    const singleParsed = fitScoreRequestSchema.safeParse(body);
    if (singleParsed.success && singleParsed.data.candidateId) {
      jobId = singleParsed.data.jobId;
      candidateId = singleParsed.data.candidateId;
      const { job: accessibleJob } = await assertJobAccess(supabase, ctx, jobId);
      if (!accessibleJob) return jsonError("Forbidden", 403);
      const jdBaseGate = await requireApprovedJdBase(jobId);
      if (jdBaseGate) return jdBaseGate;

      // Default to async (enqueue) unless caller explicitly opts into sync
      const asyncParam = request.nextUrl.searchParams.get("async");
      const syncParam = request.nextUrl.searchParams.get("sync");
      const preferSync =
        asyncParam === "false" || asyncParam === "0" || syncParam === "true" || syncParam === "1";

      if (!preferSync) {
        await enqueue("fit-score-single", { jobId, candidateId });
        invalidateFitScoreGetCache();
        return jsonSuccess(
          {
            status: "pending",
            jobId,
            candidateId,
            message:
              "FitScore is being computed. Poll GET /api/fit-score?jobId=&candidateId= for the result.",
          },
          202,
        );
      }

      const admin = createSupabaseAdmin();
      let score;
      try {
        const forceRescore =
          request.nextUrl.searchParams.get("force") === "true" ||
          request.nextUrl.searchParams.get("forceRescore") === "true";
        score = await FitScoreService.computeSingle(admin, jobId, candidateId, {
          source: "api",
          force: forceRescore,
        });
      } catch (error) {
        if (isAnthropicDeferableError(error)) {
          await FitScoreService.markDeferredScore(
            admin,
            jobId,
            candidateId,
            error instanceof Error ? error.message.slice(0, 200) : "anthropic_unavailable",
          );
          const latest = await FitScoreService.getLatestProductionScore(admin, jobId, candidateId);
          invalidateFitScoreGetCache();
          if (latest && typeof latest.overall_score === "number") {
            setSentryRequestContext({
              route: "/api/fit-score",
              userId: ctx.userId,
              organisationId: ctx.organisationId,
              scoringStatus: "deferred",
            });
            addSentryBreadcrumb({
              category: "fitscore",
              message: "Returned stale score due to deferred Anthropic call",
              level: "warning",
              data: { job_id: jobId, candidate_id: candidateId },
            });
            return jsonSuccess(
              {
                score: {
                  ...latest,
                  stale: true,
                  scoring_status: "deferred",
                },
                message:
                  "Scoring is temporarily deferred. Showing the latest available score while we retry in the background.",
              },
              200,
            );
          }
          setSentryRequestContext({
            route: "/api/fit-score",
            userId: ctx.userId,
            organisationId: ctx.organisationId,
            scoringStatus: "deferred",
          });
          addSentryBreadcrumb({
            category: "fitscore",
            message: "Deferred score returned without prior cache",
            level: "warning",
            data: { job_id: jobId, candidate_id: candidateId },
          });
          return jsonSuccess(
            {
              scoring_status: "deferred",
              jobId,
              candidateId,
              message:
                "Scoring is queued due to temporary model availability. Please check back shortly.",
            },
            202,
          );
        }
        throw error;
      }
      invalidateFitScoreGetCache();
      return jsonSuccess({ score: normalizeScoreForApi(score) }, 201);
    }

    // Batch scoring (jobId only, optionally with candidateIds array)
    const batchParsed = batchFitScoreSchema.safeParse(body);
    if (batchParsed.success) {
      const batchJobId = batchParsed.data.jobId;
      const { job: accessibleBatchJob } = await assertJobAccess(supabase, ctx, batchJobId);
      if (!accessibleBatchJob) return jsonError("Forbidden", 403);
      const jdBaseGate = await requireApprovedJdBase(batchJobId);
      if (jdBaseGate) return jdBaseGate;
      let candidateIds = batchParsed.data.candidateIds;
      if (!candidateIds?.length) {
        const { data: scores } = await supabase
          .from("fit_scores")
          .select("candidate_id")
          .eq("job_id", batchParsed.data.jobId)
          .is("superseded_at", null);
        candidateIds = [...new Set((scores ?? []).map((s) => s.candidate_id))];
      }
      if (!candidateIds.length) {
        return jsonError("No candidates found for this job", 400);
      }

      const asyncParam = request.nextUrl.searchParams.get("async");
      const syncParam = request.nextUrl.searchParams.get("sync");
      const preferSync =
        asyncParam === "false" || asyncParam === "0" || syncParam === "true" || syncParam === "1";
      const shouldUseAsync =
        hybridExecutionEnabled &&
        !preferSync &&
        candidateIds.length > INLINE_BATCH_CANDIDATE_EFFECTIVE_LIMIT;

      if (shouldUseAsync) {
        const queued = await enqueue("fit-score-batch", {
          jobId: batchParsed.data.jobId,
          candidateIds,
          maxPairs: candidateIds.length,
        });
        if (queued.id) {
          invalidateFitScoreGetCache();
          return jsonSuccess(
            {
              status: "pending",
              mode: "async",
              reason: "hybrid_guardrail_batch_size",
              safetyMargin: SAFETY_MARGIN,
              inlineCandidateLimit: INLINE_BATCH_CANDIDATE_EFFECTIVE_LIMIT,
              requestedCandidates: candidateIds.length,
              queueId: queued.id,
              message:
                "Batch FitScore is queued. Poll GET /api/fit-score?jobId= to read updated scores.",
            },
            202,
          );
        }
      }

      const admin = createSupabaseAdmin();
      const forceRescore =
        request.nextUrl.searchParams.get("force") === "true" ||
        request.nextUrl.searchParams.get("forceRescore") === "true";
      // Inline execution is capped to protect the request timeout, but the cap must
      // never silently swallow candidates: we reach here with an oversized list only
      // when the async enqueue failed, and the caller has to know what was left out.
      const inlineLimit = hybridExecutionEnabled
        ? INLINE_BATCH_CANDIDATE_EFFECTIVE_LIMIT
        : candidateIds.length;
      const inlineSelected = candidateIds.slice(0, inlineLimit);
      const skippedCandidateIds = candidateIds.slice(inlineLimit);
      if (skippedCandidateIds.length > 0) {
        logger.warn("fit_score_inline_batch_truncated", {
          jobId: batchParsed.data.jobId,
          requested: candidateIds.length,
          scored: inlineSelected.length,
          skipped: skippedCandidateIds.length,
        });
      }
      const result = await FitScoreService.computeBatch(
        admin,
        batchParsed.data.jobId,
        inlineSelected,
        { source: "api", force: forceRescore },
      );
      invalidateFitScoreGetCache();
      return jsonSuccess(
        {
          ...result,
          scores: Array.isArray(result.scores)
            ? result.scores.map((score) => normalizeScoreForApi(score))
            : result.scores,
          mode: "inline",
          safetyMargin: hybridExecutionEnabled ? SAFETY_MARGIN : undefined,
          candidateCountInput: candidateIds.length,
          candidateCountProcessed: inlineSelected.length,
          candidateCountSkipped: skippedCandidateIds.length,
          skippedCandidateIds: skippedCandidateIds.length > 0 ? skippedCandidateIds : undefined,
        },
        201,
      );
    }

    return handleZodError(singleParsed.error!);
  } catch (err) {
    reportError(err, { route: "POST /api/fit-score", jobId, candidateId });
    const known = fitScoreErrorResponse(err);
    if (known) return known;
    logger.error("FitScore compute failed", {
      err: err instanceof Error ? err.message : String(err),
      jobId,
      candidateId,
    });
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonError(
      `Failed to compute FitScore${message ? `: ${message}` : ""}. Please try again.`,
      500,
    );
  }
}
