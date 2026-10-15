import { NextRequest, NextResponse, after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createApplicationSchema } from "@/lib/validations/applications";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  getTenantScopedClient,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
  handleApiError,
} from "@/lib/api-helpers";
import { ForbiddenError } from "@/lib/tenancy/tenant-scoped-client";
import { ApplicationService } from "@/lib/services/ApplicationService";
import { CandidateService } from "@/lib/services/CandidateService";
import { FitScoreService } from "@/lib/services/FitScoreService";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { buildScopedRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";
import { validateOrigin } from "@/lib/security/csrf";
import { withRouteSpan } from "@/lib/observability/route-span";
import { logger } from "@/lib/observability/logger";
import { enqueue } from "@/lib/jobs/queue";
import { ApplicationApplyError } from "@/lib/applications/application-apply-error";
import { triggerOrganisationOutboundEvent } from "@/lib/webhooks/trigger-organisation-outbound";
import { enqueuePendingJdApprovalPair, isJdBaseApproved } from "@/lib/fitscore/pending-jd-approval";
import { checkScoringGuard } from "@/lib/prescreen/scoring-guard";
import { triggerScreeningAfterFitScore } from "@/lib/screening/trigger";
import { notifyCvIngestedFromLoggedInApply } from "@/lib/acknowledgements/cv-ingested";

export async function GET(request: NextRequest) {
  return withRouteSpan("GET /api/applications", async () => {
    try {
      const ctx = await getAuthContext();
      if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

      const { searchParams } = request.nextUrl;
      const limit = Math.min(parseInt(searchParams.get("limit") ?? "30", 10), 100);
      const page = Math.max(parseInt(searchParams.get("page") ?? "1", 10), 1);
      const cursor = searchParams.get("cursor") ?? undefined;
      const statusFilter = searchParams.get("status") ?? undefined;
      const jobId = searchParams.get("jobId") ?? undefined;
      const candidateId = searchParams.get("candidateId") ?? undefined;
      const fields = searchParams.get("fields") ?? undefined;

      const supabase = await createSupabaseServerClient();

      if (jobId && hasRole(ctx, "leadership", "recruiter", "agency", "super_admin")) {
        const db = await getTenantScopedClient(ctx);
        try {
          const accessible = await db.assertJobAccess(jobId);
          if (!accessible) return jsonError("Job not found", 404);
        } catch (error) {
          if (error instanceof ForbiddenError) return jsonError("Forbidden", 403);
          throw error;
        }
      }

      if (hasRole(ctx, "candidate_pro", "candidate_free")) {
        const candidate = await CandidateService.getByUserId(supabase, ctx.userId);
        if (!candidate) {
          return jsonSuccess({
            applications: [],
            pagination: { page: 1, limit, total: 0, totalPages: 0 },
          });
        }
        const result = await ApplicationService.listForCandidate(supabase, candidate.id, {
          page,
          limit,
          cursor,
          status: statusFilter,
        });
        return jsonSuccess(result);
      }

      if (hasRole(ctx, "leadership", "recruiter", "agency", "super_admin")) {
        const result =
          fields === "review"
            ? await ApplicationService.listForRecruiterReview(supabase, {
                page,
                limit,
                cursor,
                status: statusFilter,
                jobId,
                candidateId,
                reviewOrder: searchParams.get("order") === "score" ? "score" : undefined,
              })
            : await ApplicationService.listForRecruiter(supabase, {
                page,
                limit,
                cursor,
                status: statusFilter,
                jobId,
                candidateId,
                search: searchParams.get("search")?.trim().slice(0, 200) || undefined,
                jobTitle: searchParams.get("jobTitle")?.trim().slice(0, 200) || undefined,
                location: searchParams.get("location")?.trim().slice(0, 200) || undefined,
                highIntentOnly: searchParams.get("highIntentOnly") === "true",
              });
        return jsonSuccess(result);
      }

      return jsonError("Forbidden", 403);
    } catch (err) {
      return handleApiError(err, "Failed to fetch applications", {
        route: "GET /api/applications",
      });
    }
  });
}

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!hasRole(ctx, "candidate_pro", "candidate_free")) {
      return jsonError("Only candidates can apply to jobs", 403);
    }

    const rl = await checkRateLimit({
      key: buildScopedRateLimitKey({
        route: "apply",
        organisationId: ctx.organisationId,
        userId: ctx.userId,
      }),
      limit: 10,
      windowSecs: 60,
    });
    if (!rl.allowed) return jsonError("Rate limit exceeded. Please wait.", 429);

    const parsedBody = await parseJsonBody(request, "POST /api/applications");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = createApplicationSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const supabase = await createSupabaseServerClient();
    const candidate = await CandidateService.getByUserId(supabase, ctx.userId);
    if (!candidate) return jsonError("Complete your profile before applying", 400);

    const { data: job } = await supabase
      .from("jobs")
      .select("id, status, title, organisation_id, organisations!jobs_organisation_id_fkey(name)")
      .eq("id", parsed.data.jobId)
      .single();
    if (!job) return jsonError("Job not found", 404);
    if (job.status !== "open")
      return jsonError("This job is no longer accepting applications", 400);

    let application;
    try {
      application = await ApplicationService.create(supabase, candidate.id, {
        jobId: parsed.data.jobId,
        fitScoreId: parsed.data.fitScoreId,
        interest: parsed.data.interest,
        coverNote: parsed.data.coverNote,
        source: parsed.data.source,
        confidentialApply: parsed.data.confidentialApply,
        screeningAnswers: parsed.data.screeningAnswers,
      });
    } catch (e) {
      if (e instanceof ApplicationApplyError) {
        if (e.code === "cooling_off") {
          return NextResponse.json(
            {
              error: e.message,
              code: "cooling_off",
              retryAfter: e.retryAfterIso,
              retryAfterIso: e.retryAfterIso,
            },
            { status: 403 },
          );
        }
        if (e.code === "already_applied") {
          return jsonError(e.message, 409);
        }
        if (e.code === "hired") {
          return jsonError(e.message, 400);
        }
        if (e.code === "screening_incomplete") {
          return jsonError(e.message, 400);
        }
        if (e.code === "screening_not_passed") {
          return jsonError(e.message, 403);
        }
      }
      throw e;
    }

    if (!parsed.data.fitScoreId) {
      const admin = createSupabaseAdmin();
      const jdBaseApproved = await isJdBaseApproved(admin, parsed.data.jobId);
      if (!jdBaseApproved) {
        await enqueuePendingJdApprovalPair(admin, parsed.data.jobId, candidate.id);
        logger.info("FitScore queued pending JD approval", {
          jobId: parsed.data.jobId,
          candidateId: candidate.id,
          source: "applications_apply",
        });
      } else {
        const prescreenGuard = await checkScoringGuard({
          admin,
          jobId: parsed.data.jobId,
          candidateId: candidate.id,
          organisationId: job.organisation_id as string,
        });
        if (prescreenGuard.block) {
          logger.info("FitScore deferred by prescreen gate", {
            jobId: parsed.data.jobId,
            candidateId: candidate.id,
            reason: prescreenGuard.reason,
            gate_status: prescreenGuard.gateStatus,
          });
        } else {
          // Try to enqueue Fit Score generation (async, non-blocking)
          await enqueue("fit-score-single", {
            jobId: parsed.data.jobId,
            candidateId: candidate.id,
          }).catch((err) => {
            logger.warn("Failed to enqueue Fit Score", {
              error: String(err),
              jobId: parsed.data.jobId,
              candidateId: candidate.id,
            });
            return { id: undefined };
          });

          // If Inngest is not configured (no INNGEST_EVENT_KEY), compute asynchronously as fallback
          // This ensures Fit Scores are generated even in dev/staging without Inngest
          // We check for the env var rather than queueResult.id because enqueue returns {} when Inngest is not configured
          if (!process.env.INNGEST_EVENT_KEY) {
            // Fallback: compute Fit Score asynchronously if Inngest is not available.
            // Wrapped in after() so the work continues after the response is sent but
            // before Vercel freezes the function — otherwise the in-flight Promise dies
            // unfinished and logged-in applies end up missing a fit_score.
            const fallbackAdmin = createSupabaseAdmin();
            const fallbackJobId = parsed.data.jobId;
            const fallbackCandidateId = candidate.id;
            after(async () => {
              try {
                await FitScoreService.computeSingle(
                  fallbackAdmin,
                  fallbackJobId,
                  fallbackCandidateId,
                  { source: "upload" },
                );
                await triggerScreeningAfterFitScore(fallbackAdmin, {
                  jobId: fallbackJobId,
                  candidateId: fallbackCandidateId,
                  triggeredBy: "auto",
                });
              } catch (err) {
                logger.error("Failed to compute Fit Score (fallback)", {
                  error: String(err),
                  jobId: fallbackJobId,
                  candidateId: fallbackCandidateId,
                });
              }
            });
          }
        }
      }
    }

    // Centralized acknowledgement (dark launch compatible; falls back to legacy email-only path).
    const orgList = job.organisations as { name: string }[] | { name: string } | null;
    const org = Array.isArray(orgList) ? (orgList[0] ?? null) : orgList;
    const { data: candidateContact } = await supabase
      .from("candidates")
      .select("phone")
      .eq("id", candidate.id)
      .maybeSingle();

    const applicationId = (application as { id: string }).id;
    const ackPayload = {
      applicationId,
      candidateId: candidate.id,
      jobId: parsed.data.jobId,
      candidateName: candidate.name ?? "there",
      candidateEmail: candidate.email ?? null,
      candidatePhone: (candidateContact as { phone?: string | null } | null)?.phone ?? null,
      jobTitle: job.title ?? "this role",
      companyName: org?.name ?? "the company",
    };
    // Wrapped in after() so the acknowledgement dispatch survives Vercel's
    // post-response function freeze. Without this, the Promise can die in-flight.
    after(async () => {
      try {
        await notifyCvIngestedFromLoggedInApply(ackPayload);
      } catch (err) {
        logger.error("Failed candidate acknowledgement dispatch for apply", {
          error: String(err),
          applicationId,
          candidateId: ackPayload.candidateId,
          jobId: ackPayload.jobId,
        });
      }
    });

    const orgId = job.organisation_id as string | null | undefined;
    if (orgId && application) {
      // triggerOrganisationOutboundEvent fires an internal void enqueue() Promise.
      // Wrap the call in after() so that Promise has a chance to complete before
      // the Vercel function freezes post-response.
      const outboundOrgId = orgId;
      const outboundData = {
        applicationId: (application as { id?: string }).id,
        jobId: parsed.data.jobId,
        candidateId: candidate.id,
        confidentialApply: Boolean(parsed.data.confidentialApply),
      };
      after(() => {
        triggerOrganisationOutboundEvent({
          organisationId: outboundOrgId,
          eventType: "application.submitted",
          data: outboundData,
        });
      });
    }

    return jsonSuccess({ application }, 201);
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") return jsonError("You have already applied to this job", 409);
    return handleApiError(err, "Failed to submit application", {
      route: "POST /api/applications",
    });
  }
}
