"use client";

import { useMemo } from "react";
import { groupCandidatesByJob, type CandidateRow } from "@/lib/v2/candidate-groups";
import { buildCandidateSummary } from "@/lib/v2/candidate-summary";
import { applyFilters, filterOptions, type Filters } from "@/lib/v2/candidate-filters";
import type { ApiRow } from "./page";

/**
 * Shapes application rows into the grouped, filtered candidate list.
 *
 * Filters narrow BEFORE grouping, so a group header counts what is actually
 * inside it — grouping first and filtering after would leave headers claiming
 * more people than the list shows.
 */
export function useCandidateRows(applications: ApiRow[], search: string, filters: Filters) {
  return useMemo(() => {
    const rows: CandidateRow[] = applications.map((a) => ({
      applicationId: a.id,
      candidateId: a.candidate_id,
      name: a.candidates?.name?.trim() || "Unknown candidate",
      jobId: a.job_id,
      jobTitle: a.jobs?.title ?? "",
      score: a.fit_scores?.overall_score == null ? null : Number(a.fit_scores.overall_score),
      isFallbackScore: a.fit_scores?.scoring_method === "deterministic_fallback",
      intentScore: a.candidates?.intent_score ?? null,
      status: a.status ?? "applied",
      rejectionReason: a.rejection_reason ?? null,
      phone: a.candidates?.phone ?? null,
      experienceYears: a.candidates?.experience_years ?? null,
      location: a.candidates?.location ?? null,
      noticeDays: a.notice_period_days ?? null,
      currentCtc: a.current_ctc_lpa ?? null,
      expectedCtc: a.expected_ctc_lpa ?? null,
      offers: a.offers_in_hand ?? null,
      summary: buildCandidateSummary({
        experienceYears: a.candidates?.experience_years,
        location: a.candidates?.location,
        noticePeriodDays: a.notice_period_days,
        expectedCtcLpa: a.expected_ctc_lpa,
        offersInHand: a.offers_in_hand,
        skills: a.candidates?.skills,
        appliedAt: a.created_at,
      }),
    }));
    const q = search.trim().toLowerCase();
    const searched = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
    // Filters narrow before grouping, so a group header counts what is in it.
    return {
      ...groupCandidatesByJob(applyFilters(searched, filters), true),
      options: filterOptions(rows),
      totalBeforeFilters: searched.length,
    };
  }, [applications, search, filters]);
}
