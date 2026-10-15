"use client";

import { useApiQuery } from "@/lib/hooks/use-api";
import { periodParams } from "@/lib/v2/analytics-fusion";
import type { Period } from "@/lib/v2/period";
import type {
  TimeToHireRow,
  PipelineRow,
  OfferOutcomes,
  CostPerHire,
} from "@/lib/v2/analytics-fusion";

/**
 * Reads the v1 analytics endpoints for the v2 screens.
 *
 * These already aggregate SQL views over the whole org, cache their responses
 * and restrict what a hiring manager can see. v2 was recomputing weaker
 * versions of the same numbers from the first 100 application rows, which made
 * the new screen less accurate than the one it replaces. Same endpoints, same
 * `from`/`to` contract — only the presentation is new.
 */
export interface V1Analytics {
  timeToHire: TimeToHireRow[];
  pipeline: PipelineRow[];
  sources: { source?: string | null; candidate_count?: number | null }[];
  offers: OfferOutcomes | null;
  cost: CostPerHire | null;
  recruiters: { user_id?: string }[];
  /** job_id → % of scored applicants clearing the rubric bar (score >= 80). */
  clearRateByJob: Record<string, number>;
  /** Screening messages actually sent, and how many were answered. */
  reach: { sent: number; replied: number; declined: number; replyRate: number | null } | null;
  loading: boolean;
}

export function useV1Analytics(period: Period): V1Analytics {
  const range = periodParams(period);

  const tth = useApiQuery<{ time_to_hire: TimeToHireRow[] }>("/api/analytics", {
    metric: "time_to_hire",
    ...range,
  });
  const pipeline = useApiQuery<{ pipeline: PipelineRow[] }>("/api/analytics", {
    metric: "pipeline",
    ...range,
  });
  const sources = useApiQuery<{ sources: { source?: string | null; candidate_count?: number }[] }>(
    "/api/analytics",
    { metric: "sources", ...range },
  );
  const offers = useApiQuery<{ offer_outcomes: OfferOutcomes }>("/api/analytics", {
    metric: "offer_outcomes",
    ...range,
  });
  const cost = useApiQuery<{ cost_per_hire: CostPerHire }>("/api/analytics", {
    metric: "cost_per_hire",
    ...range,
  });
  const recruiters = useApiQuery<{ recruiters: { user_id?: string }[] }>("/api/analytics", {
    metric: "recruiter_productivity",
    ...range,
  });
  // "Clears the rubric" is the share of SCORED applicants at or above the strong
  // band — a different question from how many were actually shortlisted, which is
  // why the design shows both columns.
  const fitscore = useApiQuery<{
    fitscore: { by_job: { job_id: string; scored_count: number; strong_match_count: number }[] };
  }>("/api/analytics", { metric: "fitscore", ...range });
  // The denominator for reply rate — how many candidates were actually messaged.
  const reach = useApiQuery<{
    reach: { sent: number; replied: number; declined: number; replyRate: number | null };
  }>("/api/analytics/screening-reach", range);

  return {
    timeToHire: tth.data?.time_to_hire ?? [],
    pipeline: pipeline.data?.pipeline ?? [],
    sources: sources.data?.sources ?? [],
    offers: offers.data?.offer_outcomes ?? null,
    cost: cost.data?.cost_per_hire ?? null,
    recruiters: recruiters.data?.recruiters ?? [],
    clearRateByJob: Object.fromEntries(
      (fitscore.data?.fitscore?.by_job ?? [])
        .filter((j) => j.scored_count > 0)
        .map((j) => [j.job_id, Math.round((j.strong_match_count / j.scored_count) * 100)]),
    ),
    reach: reach.data?.reach ?? null,
    // Anything still in flight means the numbers on screen are incomplete, and
    // a partial total looks exactly like a real one.
    loading: tth.loading || pipeline.loading || offers.loading || cost.loading,
  };
}
