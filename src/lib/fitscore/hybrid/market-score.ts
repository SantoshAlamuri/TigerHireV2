/**
 * Market Score — percentile ranking within the same role category pool.
 *
 * The pool is scoped to the candidate's own organisation (no cross-tenant data in
 * rankings) and excludes the candidate's own persisted fit_scores rows so a rescore
 * never ranks a candidate against themselves.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface MarketScore {
  percentile: number | null;
  topPct: number | null;
  label: string;
  poolSize: number;
}

/** Below this pool size we make no percentile claim at all. */
const COLD_START_THRESHOLD = 25;

/** Below this pool size we never claim better than the "Top 25%" tier and qualify the label. */
const SMALL_POOL_THRESHOLD = 50;

function marketLabel(topPct: number, poolSize: number): string {
  if (poolSize >= SMALL_POOL_THRESHOLD) {
    if (topPct <= 5) return "Top 5% - Exceptional";
    if (topPct <= 10) return "Top 10% - Rare";
    if (topPct <= 25) return "Top 25% - Strong";
    if (topPct <= 50) return "Above Average";
    if (topPct <= 75) return "Average";
    return "Below Average";
  }
  // Small pool: percentiles are too noisy to support "Top 5%/10%" claims.
  let base: string;
  if (topPct <= 25) base = "Top 25% - Strong";
  else if (topPct <= 50) base = "Above Average";
  else if (topPct <= 75) base = "Average";
  else base = "Below Average";
  return `${base} (pool of ${poolSize})`;
}

export interface MarketScoreContext {
  /** Organisation whose candidates form the ranking pool — never rank across tenants. */
  organisationId: string;
  /** Candidate being scored — their own persisted rows are excluded from the pool. */
  candidateId: string;
}

export async function computeMarketScore(
  candidateScore: number,
  jobId: string,
  supabase: SupabaseClient,
  context: MarketScoreContext,
): Promise<MarketScore> {
  const { data: job } = await supabase
    .from("jobs")
    .select("role_function")
    .eq("id", jobId)
    .single();

  if (!job?.role_function) {
    return {
      percentile: null,
      topPct: null,
      label: "Market data building...",
      poolSize: 0,
    };
  }

  const { data: jobIds } = await supabase
    .from("jobs")
    .select("id")
    .eq("role_function", job.role_function)
    .eq("organisation_id", context.organisationId);

  if (!jobIds || jobIds.length === 0) {
    return {
      percentile: null,
      topPct: null,
      label: "Market data building...",
      poolSize: 0,
    };
  }

  const { data: pool } = await supabase
    .from("fit_scores")
    .select("overall_score")
    .eq("scoring_version", 2)
    .eq("is_test_run", false)
    .is("superseded_at", null)
    .neq("candidate_id", context.candidateId)
    .in(
      "job_id",
      jobIds.map((j) => j.id),
    );

  if (!pool || pool.length < COLD_START_THRESHOLD) {
    return {
      percentile: null,
      topPct: null,
      label: "Market data building...",
      poolSize: pool?.length ?? 0,
    };
  }

  const scores = pool.map((p) => p.overall_score as number);
  const below = scores.filter((s) => s < candidateScore).length;
  const percentile = Math.round((below / scores.length) * 100);
  const topPct = 100 - percentile;

  return {
    percentile,
    topPct,
    label: marketLabel(topPct, scores.length),
    poolSize: scores.length,
  };
}
