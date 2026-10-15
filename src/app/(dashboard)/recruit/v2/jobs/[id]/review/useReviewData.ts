"use client";

import { useMemo } from "react";
import { useApiQuery } from "@/lib/hooks/use-api";
import type { ReviewAppRow } from "./useEvidencePack";

/** The score shape as stored, fetched by job rather than via the empty join. */
export interface JobScore {
  candidate_id?: string | null;
  overall_score?: number | null;
  scoring_method?: string | null;
  ideal_match_pct?: number | null;
  market_percentile?: number | null;
  market_label?: string | null;
  criteria_breakdown?: unknown;
  green_flags?: (string | null)[] | null;
  amber_flags?: (string | null)[] | null;
  red_flags?: (string | null)[] | null;
  evidence_json?: { quotes?: { quote?: string; location_hint?: string }[] } | null;
}

/**
 * Everything the review queue needs to load, in one place.
 *
 * The rubric's must-haves ride along with the applications so the evidence
 * pack can turn "no evidence found for this must-have" into an explicit probe
 * for the interview, instead of leaving a silent gap.
 */
export function useReviewData(jobId: string | undefined) {
  const {
    data,
    loading: applicationsLoading,
    error: applicationsError,
    refetch,
  } = useApiQuery<{ applications: ReviewAppRow[]; pagination?: { total: number } }>(
    jobId ? "/api/applications" : null,
    jobId ? { jobId, status: "applied", limit: 100, fields: "review", order: "score" } : undefined,
    { persistToSessionStorage: true },
  );

  const { data: jdBase, error: requirementsError } = useApiQuery<{
    jdBase?: { idealCandidateProfile?: { must_haves?: string[] | null } | null } | null;
  }>(jobId ? "/api/fitscore/jd-base" : null, jobId ? { jobId } : undefined, {
    persistToSessionStorage: true,
  });

  const scoresByCandidate = useMemo(() => {
    const m = new Map<string, JobScore>();
    for (const row of data?.applications ?? []) {
      const s = row.fit_scores;
      if (!s) continue;
      // Keep the first (most recent) score per candidate.
      m.set(row.candidate_id, { ...s, candidate_id: row.candidate_id });
    }
    return m;
  }, [data]);

  return {
    data,
    loading: applicationsLoading,
    error: applicationsError,
    refetch,
    scoresByCandidate,
    requirementsUnavailable: Boolean(requirementsError),
    mustHaves: jdBase?.jdBase?.idealCandidateProfile?.must_haves ?? [],
  };
}
