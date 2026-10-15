import type { SupabaseClient } from "@supabase/supabase-js";
import { ApplicationApplyError } from "@/lib/applications/application-apply-error";
import {
  fetchApplicationForJob,
  fetchLatestTerminalApplicationAtOrg,
  getApplicationCoolingOffDays,
  isCoolingOffActive,
  coolingOffEndMs,
} from "@/lib/applications/cooling-off";
import {
  ApplicationRepository,
  type ApplicationListParams,
} from "@/lib/repositories/ApplicationRepository";
import { NotificationRepository } from "@/lib/repositories/NotificationRepository";
import { EmployeeRepository } from "@/lib/repositories/EmployeeRepository";
import { logger } from "@/lib/observability/logger";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { deleteCachedAuthProfile } from "@/lib/redis/auth-profile-cache";
import { upsertHiringOutcome } from "@/lib/services/hiring-outcomes";
import { triggerPayoutIfEligible } from "@/lib/agents/payout-trigger";
import { logApplicationEvent } from "@/lib/analytics/log-application-event";
import {
  fetchActiveScreeningQuestions,
  evaluateScreeningAnswers,
} from "@/lib/screening/job-screening";
import type { ScreeningAnswerItem } from "@/lib/screening/job-screening";
import { upsertApplicationScreeningAnswers } from "@/lib/screening/application-screening-answers";
import { startPrescreenGateBestEffort } from "@/lib/prescreen/start-gate";

function enqueueEmployeeReferralSync(
  supabase: SupabaseClient,
  candidateId: string,
  jobId: string,
  applicationStatus: string,
) {
  void (async () => {
    try {
      const { syncEmployeeReferralFromApplication } =
        await import("@/lib/referrals/sync-employee-referral-from-application");
      await syncEmployeeReferralFromApplication(supabase, candidateId, jobId, applicationStatus);
    } catch (err) {
      logger.warn("ApplicationService: employee_referral sync failed", {
        candidateId,
        jobId,
        applicationStatus,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}

export const ApplicationService = {
  async listForCandidate(
    supabase: SupabaseClient,
    candidateId: string,
    params: ApplicationListParams,
  ) {
    const { applications, total, nextCursor } = await ApplicationRepository.listForCandidate(
      supabase,
      candidateId,
      params,
    );
    return {
      applications,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
        nextCursor,
      },
    };
  },

  async listForRecruiter(supabase: SupabaseClient, params: ApplicationListParams) {
    const { applications, total, nextCursor } = await ApplicationRepository.listForRecruiter(
      supabase,
      params,
    );
    return {
      applications,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
        nextCursor,
      },
    };
  },

  async listForRecruiterReview(supabase: SupabaseClient, params: ApplicationListParams) {
    const { applications, total, nextCursor } = await ApplicationRepository.listForRecruiterReview(
      supabase,
      params,
    );
    return {
      applications,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
        nextCursor,
      },
    };
  },

  async create(
    supabase: SupabaseClient,
    candidateId: string,
    payload: {
      jobId: string;
      fitScoreId?: string;
      interest: string;
      coverNote?: string;
      source?: string;
      confidentialApply?: boolean;
      screeningAnswers?: ScreeningAnswerItem[];
      directReferrerId?: string;
      parentReferrerId?: string;
      referralLinkId?: string;
    },
  ) {
    const { data: jobRow, error: jobErr } = await supabase
      .from("jobs")
      .select("id, organisation_id")
      .eq("id", payload.jobId)
      .single();

    if (jobErr || !jobRow) {
      throw new Error("Job not found");
    }

    const organisationId = jobRow.organisation_id as string;

    let storeScreeningAnswers: ScreeningAnswerItem[] = [];
    {
      const qRows = await fetchActiveScreeningQuestions(supabase, payload.jobId);
      if (qRows.length > 0) {
        const ev = evaluateScreeningAnswers(qRows, payload.screeningAnswers);
        if (!ev.ok) {
          throw new ApplicationApplyError(
            ev.message,
            ev.reason === "incomplete" ? "screening_incomplete" : "screening_not_passed",
          );
        }
        storeScreeningAnswers = payload.screeningAnswers ?? [];
      }
    }
    const days = getApplicationCoolingOffDays();

    if (days > 0) {
      const latestTerminal = await fetchLatestTerminalApplicationAtOrg(
        supabase,
        candidateId,
        organisationId,
      );
      if (latestTerminal && isCoolingOffActive(latestTerminal.updated_at, Date.now(), days)) {
        const retry = new Date(coolingOffEndMs(latestTerminal.updated_at, days)).toISOString();
        throw new ApplicationApplyError(
          `You can apply again to this company after ${new Date(retry).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })}.`,
          "cooling_off",
          retry,
        );
      }
    }

    const existing = await fetchApplicationForJob(supabase, candidateId, payload.jobId);
    if (existing) {
      if (existing.status === "hired") {
        throw new ApplicationApplyError("You were already hired for this role.", "hired");
      }
      if (["applied", "viewed", "shortlisted"].includes(existing.status)) {
        throw new ApplicationApplyError("You have already applied to this job.", "already_applied");
      }
      if (existing.status === "rejected" || existing.status === "withdrawn") {
        let scoreId = payload.fitScoreId ?? null;
        if (!scoreId) {
          scoreId = await ApplicationRepository.findExistingScore(
            supabase,
            candidateId,
            payload.jobId,
          );
        }
        const reapplied = await ApplicationRepository.updateStatus(supabase, existing.id, {
          status: "applied",
          interest: payload.interest ?? "interested",
          cover_note: payload.coverNote ?? null,
          fit_score_id: scoreId,
          source: payload.source ?? "direct",
          confidential_apply: payload.confidentialApply ?? false,
          ...(payload.referralLinkId ? { referral_link_id: payload.referralLinkId } : {}),
          ...(payload.directReferrerId ? { direct_referrer_id: payload.directReferrerId } : {}),
          ...(payload.parentReferrerId ? { parent_referrer_id: payload.parentReferrerId } : {}),
        });
        logApplicationEvent(supabase, {
          applicationId: reapplied.id as string,
          jobId: payload.jobId,
          candidateId,
          orgId: organisationId,
          event: "applied",
          metadata: { source: payload.source ?? "direct", reapplied: true },
        });
        if (storeScreeningAnswers.length > 0) {
          const admin = createSupabaseAdmin();
          await upsertApplicationScreeningAnswers(
            admin,
            reapplied.id as string,
            storeScreeningAnswers,
          );
        }
        if (payload.directReferrerId) {
          const { enqueueCampaignAttribution } =
            await import("@/lib/referrers/campaign-attribution");
          enqueueCampaignAttribution({
            applicationId: reapplied.id as string,
            referrerId: payload.directReferrerId,
            jobId: payload.jobId,
          });
        }
        enqueueEmployeeReferralSync(supabase, candidateId, payload.jobId, "applied");
        await startPrescreenGateBestEffort(supabase, {
          jobId: payload.jobId,
          candidateId,
          applicationId: reapplied.id as string,
          organisationId,
          source: payload.source,
        });
        return reapplied;
      }
      throw new ApplicationApplyError("You have already applied to this job.", "already_applied");
    }

    let scoreId = payload.fitScoreId ?? null;
    if (!scoreId) {
      scoreId = await ApplicationRepository.findExistingScore(supabase, candidateId, payload.jobId);
    }

    const created = await ApplicationRepository.create(supabase, {
      candidate_id: candidateId,
      job_id: payload.jobId,
      fit_score_id: scoreId,
      interest: payload.interest ?? "interested",
      cover_note: payload.coverNote ?? null,
      status: "applied",
      source: payload.source ?? "direct",
      confidential_apply: payload.confidentialApply ?? false,
      referral_link_id: payload.referralLinkId ?? null,
      direct_referrer_id: payload.directReferrerId ?? null,
      parent_referrer_id: payload.parentReferrerId ?? null,
    });
    logApplicationEvent(supabase, {
      applicationId: created.id as string,
      jobId: payload.jobId,
      candidateId,
      orgId: organisationId,
      event: "applied",
      metadata: { source: payload.source ?? "direct" },
    });
    if (storeScreeningAnswers.length > 0) {
      const admin = createSupabaseAdmin();
      await upsertApplicationScreeningAnswers(admin, created.id as string, storeScreeningAnswers);
    }
    if (payload.directReferrerId) {
      const { enqueueCampaignAttribution } = await import("@/lib/referrers/campaign-attribution");
      enqueueCampaignAttribution({
        applicationId: created.id as string,
        referrerId: payload.directReferrerId,
        jobId: payload.jobId,
      });
    }
    enqueueEmployeeReferralSync(supabase, candidateId, payload.jobId, "applied");
    await startPrescreenGateBestEffort(supabase, {
      jobId: payload.jobId,
      candidateId,
      applicationId: created.id as string,
      organisationId,
      source: payload.source,
    });
    return created;
  },

  async updateStatus(
    supabase: SupabaseClient,
    applicationId: string,
    status: string,
    userId: string,
  ) {
    const adminSupabase = createSupabaseAdmin();
    const { data: txResult, error: txError } = await adminSupabase.rpc(
      "update_application_status_tx",
      { p_application_id: applicationId, p_status: status, p_user_id: userId },
    );

    if (!txError && txResult) {
      if (status === "hired" && txResult.candidate_user_id) {
        await deleteCachedAuthProfile(txResult.candidate_user_id);
      }
      if (status === "hired" || status === "rejected") {
        const tr = txResult as { job_id?: string; candidate_id?: string };
        if (tr.job_id && tr.candidate_id) {
          await upsertHiringOutcome(adminSupabase, {
            jobId: tr.job_id,
            candidateId: tr.candidate_id,
            outcome: status,
            recordedByUserId: userId,
            source: "application_service",
            sourceEventId: `application:${applicationId}:${status}`,
          });
        }
      }
      if (status === "shortlisted" || status === "hired") {
        const tr = txResult as { job_id?: string; candidate_id?: string };
        if (tr.job_id && tr.candidate_id) {
          void (async () => {
            try {
              await triggerPayoutIfEligible({
                supabase: adminSupabase,
                candidateId: tr.candidate_id as string,
                jobId: tr.job_id as string,
                newStatus: status,
              });
            } catch (err) {
              logger.warn("ApplicationService: payout trigger failed (tx path)", {
                applicationId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          })();
        }
      }
      if (status === "withdrawn") {
        const tr = txResult as { job_id?: string; candidate_id?: string };
        if (tr.job_id && tr.candidate_id) {
          void (async () => {
            try {
              const { data: jr } = await supabase
                .from("jobs")
                .select("organisation_id")
                .eq("id", tr.job_id as string)
                .maybeSingle();
              logApplicationEvent(supabase, {
                applicationId,
                jobId: tr.job_id as string,
                candidateId: tr.candidate_id as string,
                orgId: (jr?.organisation_id as string) ?? "",
                event: "withdrawn",
              });
            } catch {
              logApplicationEvent(supabase, {
                applicationId,
                jobId: tr.job_id as string,
                candidateId: tr.candidate_id as string,
                orgId: "",
                event: "withdrawn",
              });
            }
          })();
        }
      }
      if (status === "shortlisted" || status === "hired") {
        const { enqueueCampaignStatusAttribution } =
          await import("@/lib/referrers/campaign-attribution");
        enqueueCampaignStatusAttribution({ applicationId, status });
      }
      const tr = txResult as { job_id?: string; candidate_id?: string };
      if (tr.job_id && tr.candidate_id) {
        enqueueEmployeeReferralSync(
          adminSupabase,
          tr.candidate_id as string,
          tr.job_id as string,
          status,
        );
      }
      logger.info("Application status updated (transaction)", {
        application_id: applicationId,
        status,
        user_id: userId,
      });
      return txResult;
    }

    logger.warn("Application status TX unavailable, using fallback", {
      error: txError?.message,
    });

    const updatePayload: Record<string, unknown> = { status };
    if (status === "viewed") {
      updatePayload.viewed_at = new Date().toISOString();
    }

    const app = await ApplicationRepository.updateStatus(supabase, applicationId, updatePayload);

    if (status === "hired" || status === "rejected") {
      await supabase.from("delivery_feedback").upsert(
        {
          job_id: app.job_id,
          candidate_id: app.candidate_id,
          outcome: status,
        },
        { onConflict: "job_id,candidate_id" },
      );
      await upsertHiringOutcome(adminSupabase, {
        jobId: app.job_id,
        candidateId: app.candidate_id,
        outcome: status,
        recordedByUserId: userId,
        source: "application_service",
        sourceEventId: `application:${applicationId}:${status}`,
      });
    }

    if (status === "shortlisted" || status === "hired") {
      void (async () => {
        try {
          await triggerPayoutIfEligible({
            supabase: adminSupabase,
            candidateId: app.candidate_id,
            jobId: app.job_id,
            newStatus: status,
          });
        } catch (err) {
          logger.warn("ApplicationService: payout trigger failed (fallback path)", {
            applicationId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
    }

    enqueueEmployeeReferralSync(adminSupabase, app.candidate_id, app.job_id, status);

    if (status === "hired") {
      const { data: jobData } = await supabase
        .from("jobs")
        .select("organisation_id")
        .eq("id", app.job_id)
        .single();

      if (jobData?.organisation_id) {
        try {
          await EmployeeRepository.onboardAsEmployee(supabase, {
            candidateId: app.candidate_id,
            companyId: jobData.organisation_id,
          });
        } catch (err) {
          logger.error("Employee onboarding failed during hire", {
            candidateId: app.candidate_id,
            jobId: app.job_id,
            error: String(err),
          });
        }
      }
    }

    const statusLabels: Record<string, string> = {
      viewed: "viewed",
      shortlisted: "shortlisted",
      rejected: "not selected",
      hired: "hired",
    };

    if (status === "shortlisted" || status === "hired") {
      const { enqueueCampaignStatusAttribution } =
        await import("@/lib/referrers/campaign-attribution");
      enqueueCampaignStatusAttribution({ applicationId, status });
    }

    if (statusLabels[status]) {
      const { data: candidate } = await supabase
        .from("candidates")
        .select("user_id")
        .eq("id", app.candidate_id)
        .single();

      if (candidate?.user_id) {
        const { data: jobData } = await supabase
          .from("jobs")
          .select("title")
          .eq("id", app.job_id)
          .single();

        await NotificationRepository.create(supabase, {
          userId: candidate.user_id,
          type: "application_update",
          title: `Application ${statusLabels[status]}`,
          body: `Your application for "${jobData?.title ?? "a role"}" has been ${statusLabels[status]}.`,
          link: "/candidate/applications",
        });
      }
    }

    if (status === "withdrawn") {
      const { data: jr } = await supabase
        .from("jobs")
        .select("organisation_id")
        .eq("id", app.job_id)
        .maybeSingle();
      logApplicationEvent(supabase, {
        applicationId,
        jobId: app.job_id,
        candidateId: app.candidate_id,
        orgId: (jr?.organisation_id as string) ?? "",
        event: "withdrawn",
      });
    }

    logger.info("Application status updated", {
      application_id: applicationId,
      status,
      user_id: userId,
    });
    return app;
  },
};
