"use client";

import { useCallback, useMemo } from "react";
import { invalidateQueries, useApiQuery } from "@/lib/hooks/use-api";
import { jobPublicationState } from "@/lib/jobs/publication-state";
import { isJdPublished } from "@/lib/jobs/job-readiness";
import { hiringRequestRef } from "@/lib/v2/setup-sequence";
import { offerState } from "@/lib/v2/offer-state";
import type { JobApplicantCounts } from "@/lib/v2/ta-portfolio";
import { buildJourney, type Journey, type JourneyFacts } from "./journey";

export interface WorkJob {
  id?: string;
  title?: string;
  description?: string;
  jd_sections?: unknown;
  location?: string | null;
  status?: string;
  is_active?: boolean;
  list_on_public_job_board?: boolean;
  hiring_request_id?: string | null;
  hiring_requests?:
    | { id?: string; status?: string }
    | Array<{ id?: string; status?: string }>
    | null;
}

interface Interview {
  scheduledStart?: string | null;
  feedbackSubmitted?: boolean;
}

interface ApiOffer {
  id: string;
  status?: string | null;
  signing_status?: string | null;
  sent_at?: string | null;
  first_viewed_at?: string | null;
  view_count?: number | null;
  signed_at?: string | null;
  declined_at?: string | null;
  expires_at?: string | null;
  applications?: { job_id?: string } | null;
}

/** Every endpoint the journey reads, so a completed action can refresh all of them. */
export function journeyQueryPrefixes(jobId: string): string[] {
  return [
    `/api/jobs/${jobId}`,
    "/api/fitscore/jd-base",
    "/api/portfolio",
    "/api/interviews/aggregate",
    "/api/offers",
    "/api/applications",
  ];
}

/**
 * Reads what the journey needs from existing endpoints. No new backend: the
 * point of the work-driven UI is a new way to move through the same work.
 */
export function useJobJourney(jobId: string | undefined) {
  // Same rule as useIdealProfileGate, read here so a rubric approval can be refetched.
  const jdBase = useApiQuery<{
    jdBase?: {
      approvedBy?: string | null;
      idealCandidateProfile?: { must_haves?: string[] | null } | null;
    };
  }>(jobId ? "/api/fitscore/jd-base" : null, jobId ? { jobId } : undefined);
  const gate = useMemo(() => {
    const err = jdBase.error ?? "";
    const hybridDisabled = err.includes("not enabled") || err.includes("Hybrid FitScore");
    return {
      hybridDisabled,
      approved: Boolean(jdBase.data?.jdBase?.approvedBy),
      mustHaveCount: (jdBase.data?.jdBase?.idealCandidateProfile?.must_haves ?? []).filter(
        (m) => typeof m === "string" && m.trim().length > 0,
      ).length,
      loading: jdBase.loading && !jdBase.data && !jdBase.error,
    };
  }, [jdBase.data, jdBase.error, jdBase.loading]);
  const job = useApiQuery<{ job: WorkJob; orgSlug?: string }>(jobId ? `/api/jobs/${jobId}` : null);
  const summary = useApiQuery<{
    total: number;
    applied: number;
    shortlisted: number;
    rejected: number;
    hired: number;
    screened: number;
  }>(jobId ? `/api/jobs/${jobId}/application-summary` : null);
  const screening = useApiQuery<{ applyQuestions?: { id: string }[] }>(
    jobId ? `/api/jobs/${jobId}/whatsapp-screening` : null,
  );
  const portfolio = useApiQuery<{ jobs: { id: string; counts: JobApplicantCounts }[] }>(
    jobId ? "/api/portfolio" : null,
  );
  const interviews = useApiQuery<{ interviews: Interview[] }>(
    jobId ? "/api/interviews/aggregate" : null,
    jobId ? { job_id: jobId } : undefined,
  );
  const offers = useApiQuery<{ offers: ApiOffer[] }>(jobId ? "/api/offers" : null);

  const facts = useMemo<JourneyFacts | null>(() => {
    const j = job.data?.job;
    if (!j) return null;
    const now = Date.now();
    const counts = portfolio.data?.jobs?.find((p) => p.id === jobId)?.counts;
    const s = summary.data;
    const ivs = interviews.data?.interviews ?? [];
    const mine = (offers.data?.offers ?? []).filter((o) => o.applications?.job_id === jobId);
    const states = mine.map((o) =>
      offerState(
        {
          id: o.id,
          candidateName: "",
          status: o.status ?? "",
          signingStatus: o.signing_status ?? null,
          sentAt: o.sent_at ?? null,
          firstViewedAt: o.first_viewed_at ?? null,
          viewCount: o.view_count ?? 0,
          signedAt: o.signed_at ?? null,
          declinedAt: o.declined_at ?? null,
          expiresAt: o.expires_at ?? null,
        },
        now,
      ),
    );
    const publication = jobPublicationState(j);
    const req = hiringRequestRef(j);
    return {
      hiringRequestId: req.id,
      hiringRequestStatus: req.status,
      jdPublished: isJdPublished(j.description, j.jd_sections).published,
      rubricApproved: gate.approved,
      rubricNotRequired: gate.hybridDisabled,
      mustHaveCount: gate.mustHaveCount,
      roleOpen: j.status === "open",
      publicApplications: publication.publicApplications,
      screeningQuestionCount: screening.data?.applyQuestions?.length ?? 0,
      applicants: counts?.applicants ?? s?.total ?? 0,
      unscored: counts?.unscored ?? 0,
      awaitingReview: counts?.awaitingReview ?? s?.applied ?? 0,
      shortlisted: s?.shortlisted ?? 0,
      hired: s?.hired ?? 0,
      interviewsUpcoming: ivs.filter((i) => i.scheduledStart && Date.parse(i.scheduledStart) > now)
        .length,
      interviewsAwaitingFeedback: ivs.filter(
        (i) => i.scheduledStart && Date.parse(i.scheduledStart) <= now && !i.feedbackSubmitted,
      ).length,
      offersOut: mine.filter((o) => o.sent_at && !o.signed_at && !o.declined_at).length,
      offersNeedingAction: states.filter((st) => st.needsAction).length,
      offersSigned: mine.filter((o) => o.signed_at).length,
    };
  }, [
    job.data,
    gate.approved,
    gate.hybridDisabled,
    gate.mustHaveCount,
    portfolio.data,
    summary.data,
    screening.data,
    interviews.data,
    offers.data,
    jobId,
  ]);

  const journey = useMemo<Journey | null>(() => (facts ? buildJourney(facts) : null), [facts]);

  const { refetch: refetchJdBase } = jdBase;
  const { refetch: refetchJob } = job;
  const { refetch: refetchSummary } = summary;
  const { refetch: refetchScreening } = screening;
  const { refetch: refetchPortfolio } = portfolio;
  const { refetch: refetchInterviews } = interviews;
  const { refetch: refetchOffers } = offers;
  /** Re-read everything after the person finishes something, without a spinner. */
  const refresh = useCallback(async () => {
    if (!jobId) return;
    journeyQueryPrefixes(jobId).forEach(invalidateQueries);
    await Promise.all([
      refetchJdBase({ silent: true }),
      refetchJob({ silent: true }),
      refetchSummary({ silent: true }),
      refetchScreening({ silent: true }),
      refetchPortfolio({ silent: true }),
      refetchInterviews({ silent: true }),
      refetchOffers({ silent: true }),
    ]);
  }, [
    jobId,
    refetchJdBase,
    refetchJob,
    refetchSummary,
    refetchScreening,
    refetchPortfolio,
    refetchInterviews,
    refetchOffers,
  ]);

  return {
    job: job.data?.job ?? null,
    orgSlug: job.data?.orgSlug,
    facts,
    journey,
    loading: (job.loading && !job.data) || gate.loading,
    error: job.error,
    refresh,
  };
}
