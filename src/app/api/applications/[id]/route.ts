import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { updateApplicationSchema } from "@/lib/validations/applications";
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
import { assertApplicationRouteAccess } from "@/lib/applications/assert-application-access";
import { ApplicationRepository } from "@/lib/repositories/ApplicationRepository";
import { ApplicationService } from "@/lib/services/ApplicationService";
import { NotificationRepository } from "@/lib/repositories/NotificationRepository";
import {
  sendApplicationWithdrawnToRecruiter,
  sendApplicationStatusUpdate,
} from "@/lib/services/resend";
import {
  notifyCandidateShortlisted,
  notifyCandidateRejected,
  notifyCandidateOffer,
} from "@/lib/services/whatsapp";
import { validateOrigin } from "@/lib/security/csrf";
import { logger } from "@/lib/observability/logger";
import { fetchApplicationScreeningAnswersForDisplay } from "@/lib/screening/fetch-application-screening-display";
import { fetchPrescreenAnswersForDisplay } from "@/lib/screening/fetch-prescreen-answers-display";
import { isHoldRestoreAllowed } from "@/lib/v2/decision-sync";

type RouteContext = { params: Promise<{ id: string }> };
const APPLICATION_SELECT_COLUMNS = `
  id, candidate_id, job_id, fit_score_id, interest, cover_note, status, viewed_at, created_at, updated_at,
  source, referral_link_id, direct_referrer_id, parent_referrer_id, current_ctc_lpa, expected_ctc_lpa,
  notice_period_days, offers_in_hand, available_from, relocation_willingness, app_close_reminder_7d_sent_at,
  app_close_reminder_24h_sent_at, stage_type, billing_ctc_required, offer_accepted_at, confidential_apply,
  rejection_reason
`;
type ApplicationWithRelations = {
  candidate_id?: string | null;
  job_id?: string | null;
  status?: string | null;
  rejection_reason?: string | null;
  jobs?:
    | { organisation_id?: string | null; hiring_manager_id?: string | null }
    | Array<{ organisation_id?: string | null; hiring_manager_id?: string | null }>
    | null;
  candidates?: { user_id?: string | null } | Array<{ user_id?: string | null }> | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (
      !hasRole(
        ctx,
        "candidate_pro",
        "candidate_free",
        "hiring_manager",
        "leadership",
        "recruiter",
        "agency",
        "super_admin",
      )
    ) {
      return jsonError("Forbidden", 403);
    }

    const { id } = await context.params;
    const supabase = await createSupabaseServerClient();
    const data = await ApplicationRepository.getById(supabase, id);
    if (!data) return jsonError("Application not found", 404);

    const app = data as ApplicationWithRelations;

    const accessError = await assertApplicationRouteAccess(ctx, id, app);
    if (accessError) return accessError;

    // Screening answers may contain knockout responses that the candidate
    // would not expect to be visible cross-role. Gate to roles that own
    // recruiting decisions: recruiter / agency / leadership / super_admin.
    // Hiring managers and candidates do not need to see other applicants'
    // raw screening answers for the application detail page.
    const admin = createSupabaseAdmin();
    const canViewScreening = hasRole(ctx, "recruiter", "agency", "leadership", "super_admin");
    const screeningAnswers = canViewScreening
      ? await fetchApplicationScreeningAnswersForDisplay(admin, id).catch((err) => {
          logger.warn("Application GET: screening answers load failed", {
            applicationId: id,
            err: String(err),
          });
          return [] as Awaited<ReturnType<typeof fetchApplicationScreeningAnswersForDisplay>>;
        })
      : ([] as Awaited<ReturnType<typeof fetchApplicationScreeningAnswersForDisplay>>);

    const jobId = (app as { job_id?: string | null }).job_id;
    const candidateId = (app as { candidate_id?: string | null }).candidate_id;
    const prescreenAnswers =
      canViewScreening && jobId && candidateId
        ? await fetchPrescreenAnswersForDisplay(admin, jobId, candidateId).catch((err) => {
            logger.warn("Application GET: prescreen answers load failed", {
              applicationId: id,
              err: String(err),
            });
            return [] as Awaited<ReturnType<typeof fetchPrescreenAnswersForDisplay>>;
          })
        : ([] as Awaited<ReturnType<typeof fetchPrescreenAnswersForDisplay>>);

    return jsonSuccess({ application: data, screeningAnswers, prescreenAnswers });
  } catch (err) {
    return handleApiError(err, "Failed to fetch application", {
      route: "GET /api/applications/[id]",
    });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    const { id } = await context.params;
    const supabase = await createSupabaseServerClient();
    const existing = (await ApplicationRepository.getById(
      supabase,
      id,
    )) as ApplicationWithRelations | null;
    if (!existing) return jsonError("Application not found", 404);
    const existingJob = firstRelation(existing.jobs);
    const existingCandidate = firstRelation(existing.candidates);
    const existingOrgId = existingJob?.organisation_id ?? null;
    const existingCandidateUserId = existingCandidate?.user_id ?? null;

    if (hasRole(ctx, "candidate_pro", "candidate_free")) {
      const parsed = await parseJsonBody<{ status?: string }>(
        request,
        "PATCH /api/applications/[id]",
      );
      if (parsed.errorResponse) return parsed.errorResponse;
      const { body } = parsed;
      if (body.status !== "withdrawn") {
        return jsonError("Candidates can only withdraw applications", 400);
      }
      if (!existingCandidateUserId || existingCandidateUserId !== ctx.userId) {
        return jsonError("Forbidden", 403);
      }
      const app = await ApplicationService.updateStatus(supabase, id, "withdrawn", ctx.userId);
      const admin = createSupabaseAdmin();
      const { data: jobRow } = await admin
        .from("jobs")
        .select("created_by, title")
        .eq("id", app.job_id)
        .single();
      const { data: candidateRow } = await admin
        .from("candidates")
        .select("name")
        .eq("id", app.candidate_id)
        .single();
      const candidateName = candidateRow?.name ?? "A candidate";
      const jobTitle = jobRow?.title ?? "your role";
      if (jobRow?.created_by) {
        await NotificationRepository.create(admin, {
          userId: jobRow.created_by,
          type: "application_update",
          title: "Application withdrawn",
          body: `${candidateName} withdrew their application for "${jobTitle}".`,
          link: "/recruit/applications",
        });
        try {
          const {
            data: { user: recruiterUser },
          } = await admin.auth.admin.getUserById(jobRow.created_by);
          if (recruiterUser?.email) {
            await sendApplicationWithdrawnToRecruiter({
              recruiterEmail: recruiterUser.email,
              candidateName,
              jobTitle,
            });
          }
        } catch (emailErr) {
          logger.warn("Failed to send withdrawal email to recruiter", {
            created_by: jobRow.created_by,
            error: String(emailErr),
          });
        }
      }
      return jsonSuccess({ application: app });
    }

    if (!hasRole(ctx, "leadership", "recruiter", "agency", "super_admin", "hiring_manager")) {
      return jsonError("Forbidden", 403);
    }

    const patchAccessError = await assertApplicationRouteAccess(ctx, id, existing);
    if (patchAccessError) return patchAccessError;

    const { body, errorResponse } = await parseJsonBody(request, "PATCH /api/applications/[id]");
    if (errorResponse) return errorResponse;
    const parsed = updateApplicationSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    if (
      parsed.data.status === "applied" &&
      !isHoldRestoreAllowed(existing.status ?? "", parsed.data.status)
    ) {
      return jsonError("Only a hold can be restored to applied", 409);
    }

    const hireabilityPatch: Record<string, unknown> = {};
    if ("currentCtcLpa" in parsed.data)
      hireabilityPatch.current_ctc_lpa = parsed.data.currentCtcLpa;
    if ("expectedCtcLpa" in parsed.data)
      hireabilityPatch.expected_ctc_lpa = parsed.data.expectedCtcLpa;
    if ("noticePeriodDays" in parsed.data)
      hireabilityPatch.notice_period_days = parsed.data.noticePeriodDays;
    if ("offersInHand" in parsed.data) hireabilityPatch.offers_in_hand = parsed.data.offersInHand;
    if ("availableFrom" in parsed.data) hireabilityPatch.available_from = parsed.data.availableFrom;
    if ("relocationWillingness" in parsed.data)
      hireabilityPatch.relocation_willingness = parsed.data.relocationWillingness;

    if (!parsed.data.status && Object.keys(hireabilityPatch).length === 0) {
      return jsonError("No update fields provided", 422);
    }

    type UpdatedApplication = Record<string, unknown> & {
      candidate_id?: string | null;
      job_id?: string | null;
    };
    let app: UpdatedApplication | null = null;

    if (parsed.data.status) {
      app = (await ApplicationService.updateStatus(
        supabase,
        id,
        parsed.data.status,
        ctx.userId,
      )) as UpdatedApplication;
    }

    /**
     * The reject reason, written here rather than by widening the status RPC.
     *
     * The review queue has always demanded a structured reason, validated it,
     * and then had it stripped by this route — so the three features that read
     * it (the talent pool grouped by reason, the fairness report's reason
     * distribution, and the agency close-reason) rendered empty for every row.
     * That reads as "nobody gave reasons" rather than "the product threw them
     * away", which is the more damaging of the two.
     *
     * Un-rejecting clears the reason: a stale one would keep surfacing a live
     * candidate in the talent pool as though they had been passed over.
     */
    if (parsed.data.status) {
      const reason =
        parsed.data.status === "rejected" ? (parsed.data.rejection_reason ?? null) : null;
      const stale = (existing.rejection_reason ?? null) !== null;
      if (reason !== null || stale) {
        const { error: reasonErr } = await supabase
          .from("applications")
          .update({ rejection_reason: reason, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (reasonErr) {
          // Degraded, not fatal: the decision itself landed. Warn distinctly so
          // an empty fairness report is traceable to this and not to recruiters
          // skipping the reason prompt.
          logger.warn("Application status updated but reject reason was not saved", {
            applicationId: id,
            status: parsed.data.status,
            error: reasonErr.message,
          });
        } else if (app) {
          app.rejection_reason = reason;
        }
      }
    }

    if (Object.keys(hireabilityPatch).length > 0) {
      const { data: updated, error: updateErr } = await supabase
        .from("applications")
        .update({
          ...hireabilityPatch,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select(APPLICATION_SELECT_COLUMNS)
        .maybeSingle();

      if (updateErr) {
        // Surface the real Postgres error instead of masking every failure as a
        // generic 500 (Candidates #2 — the reported "500 on saving Hireability
        // data" was an unlogged cause).
        const pgErr = updateErr as {
          code?: string;
          message?: string;
          details?: string;
          hint?: string;
        };
        logger.error("Failed to update hireability fields", {
          applicationId: id,
          code: pgErr.code,
          error: pgErr.message ?? String(updateErr),
          details: pgErr.details,
          hint: pgErr.hint,
        });
        return jsonError("Failed to update application", 500);
      }
      if (!updated) {
        // No row affected → RLS denied the write or the application is outside
        // the caller's org scope. Report 403, not a misleading 500.
        logger.warn("Hireability update affected no rows (RLS or scope denied)", {
          applicationId: id,
          userId: ctx.userId,
        });
        return jsonError("You do not have permission to edit this application", 403);
      }
      app = updated as UpdatedApplication;
    }

    const notifyStatuses = ["shortlisted", "hired", "rejected"];
    if (parsed.data.status && notifyStatuses.includes(parsed.data.status)) {
      try {
        const candidateId = app?.candidate_id ?? existing.candidate_id ?? null;
        const jobId = app?.job_id ?? existing.job_id ?? null;
        if (!candidateId || !jobId) {
          logger.warn("Skipping status notification due to missing IDs", {
            applicationId: id,
            candidateId,
            jobId,
          });
          return jsonSuccess({ application: app });
        }
        const admin = createSupabaseAdmin();
        const { data: candidateRow } = await admin
          .from("candidates")
          .select("email, name, phone")
          .eq("id", candidateId)
          .single();
        const { data: jobRow } = await admin
          .from("jobs")
          .select("title, organisation_id")
          .eq("id", jobId)
          .single();
        const { data: orgRow } = jobRow?.organisation_id
          ? await admin
              .from("organisations")
              .select("name")
              .eq("id", jobRow.organisation_id)
              .single()
          : { data: null };
        const candidateName = candidateRow?.name ?? "Candidate";
        const jobTitle = jobRow?.title ?? "the role";
        const companyName = orgRow?.name ?? "the company";

        if (candidateRow?.email && jobRow?.title) {
          await sendApplicationStatusUpdate({
            candidateEmail: candidateRow.email,
            candidateName,
            jobTitle,
            companyName,
            status: parsed.data.status as "shortlisted" | "hired" | "rejected",
          });
        }

        if (candidateRow?.phone) {
          const waParams = {
            phone: candidateRow.phone,
            candidateName,
            jobTitle,
            companyName,
            applicationId: id,
          };
          if (parsed.data.status === "shortlisted") {
            await notifyCandidateShortlisted(waParams);
          } else if (parsed.data.status === "rejected") {
            await notifyCandidateRejected(waParams);
          } else if (parsed.data.status === "hired") {
            await notifyCandidateOffer(waParams);
          }
        }
      } catch (notifyErr) {
        logger.warn("Failed to send application status notification", {
          applicationId: id,
          error: String(notifyErr),
        });
      }
    }

    return jsonSuccess({ application: app });
  } catch (err) {
    return handleApiError(err, "Failed to update application", {
      route: "PATCH /api/applications/[id]",
    });
  }
}
