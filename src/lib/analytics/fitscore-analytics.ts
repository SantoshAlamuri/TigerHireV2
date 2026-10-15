import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllSupabasePages } from "@/lib/analytics/fetch-paged";

export type FitScoreJobRow = {
  job_id: string;
  job_title: string;
  scored_count: number;
  strong_match_count: number;
  avg_overall: number | null;
  strong_match_rate: number | null;
};

export type FitScoreDistributionBucket = {
  bucket: string;
  label: string;
  count: number;
};

export type FitScoreAnalytics = {
  pair_count: number;
  unique_candidate_count: number;
  strong_match_count: number;
  avg_overall: number | null;
  strong_match_rate: number | null;
  by_job: FitScoreJobRow[];
  distribution: FitScoreDistributionBucket[];
};

type RawFitScoreRow = {
  job_id: string;
  candidate_id: string;
  overall_score: number | string | null;
  created_at: string | null;
  jobs: { title?: string | null; organisation_id?: string } | Array<{ title?: string | null }>;
};

const DISTRIBUTION_BUCKETS: Array<{ bucket: string; label: string; min: number; max: number }> = [
  { bucket: "0-49", label: "Below 50", min: 0, max: 49 },
  { bucket: "50-69", label: "50–69", min: 50, max: 69 },
  { bucket: "70-79", label: "70–79", min: 70, max: 79 },
  { bucket: "80-100", label: "80+ (strong)", min: 80, max: 100 },
];

function firstJoinedTitle(jobs: RawFitScoreRow["jobs"]): string {
  if (!jobs) return "Unknown";
  const row = Array.isArray(jobs) ? jobs[0] : jobs;
  return (row?.title && String(row.title).trim()) || "Unknown";
}

function scoreNum(v: number | string | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function latestScoresByPair(rows: RawFitScoreRow[]): Array<{
  job_id: string;
  job_title: string;
  score: number;
}> {
  const latest = new Map<
    string,
    { job_id: string; job_title: string; score: number; at: number }
  >();

  for (const row of rows) {
    const score = scoreNum(row.overall_score);
    if (score == null) continue;
    const key = `${row.job_id}\0${row.candidate_id}`;
    const at = row.created_at ? Date.parse(row.created_at) : 0;
    const existing = latest.get(key);
    if (!existing || at >= existing.at) {
      latest.set(key, {
        job_id: row.job_id,
        job_title: firstJoinedTitle(row.jobs),
        score,
        at,
      });
    }
  }

  return [...latest.values()].map(({ job_id, job_title, score }) => ({
    job_id,
    job_title,
    score,
  }));
}

export async function getFitScoreAnalytics(
  supabase: SupabaseClient,
  orgId: string,
  filters?: { jobId?: string; jobIds?: string[] },
): Promise<FitScoreAnalytics> {
  const buildQuery = () => {
    let q = supabase
      .from("fit_scores")
      .select("job_id, candidate_id, overall_score, created_at, jobs!inner(title, organisation_id)")
      .eq("jobs.organisation_id", orgId)
      .or("is_test_run.is.null,is_test_run.eq.false")
      .order("created_at", { ascending: false });
    if (filters?.jobId) {
      q = q.eq("job_id", filters.jobId);
    } else if (filters?.jobIds && filters.jobIds.length > 0) {
      q = q.in("job_id", filters.jobIds);
    }
    return q;
  };

  const { data, error } = await fetchAllSupabasePages((from, to) => buildQuery().range(from, to));
  if (error) {
    throw new Error(String(error));
  }

  const pairs = latestScoresByPair((data ?? []) as RawFitScoreRow[]);
  const uniqueCandidates = new Set<string>();
  for (const row of (data ?? []) as RawFitScoreRow[]) {
    uniqueCandidates.add(row.candidate_id);
  }

  const distribution = DISTRIBUTION_BUCKETS.map(({ bucket, label, min, max }) => ({
    bucket,
    label,
    count: pairs.filter((p) => p.score >= min && p.score <= max).length,
  }));

  const byJobMap = new Map<string, { job_title: string; scores: number[]; strong: number }>();
  for (const p of pairs) {
    let g = byJobMap.get(p.job_id);
    if (!g) {
      g = { job_title: p.job_title, scores: [], strong: 0 };
      byJobMap.set(p.job_id, g);
    }
    g.scores.push(p.score);
    if (p.score >= 80) g.strong += 1;
  }

  const by_job: FitScoreJobRow[] = [...byJobMap.entries()]
    .map(([job_id, g]) => {
      const scored = g.scores.length;
      const avg = scored > 0 ? g.scores.reduce((a, b) => a + b, 0) / scored : null;
      return {
        job_id,
        job_title: g.job_title,
        scored_count: scored,
        strong_match_count: g.strong,
        avg_overall: avg != null ? Math.round(avg) : null,
        strong_match_rate: scored > 0 ? Math.round((g.strong / scored) * 1000) / 10 : null,
      };
    })
    .sort((a, b) => b.scored_count - a.scored_count);

  const pair_count = pairs.length;
  const strong_match_count = pairs.filter((p) => p.score >= 80).length;
  const avg_overall =
    pair_count > 0 ? Math.round(pairs.reduce((s, p) => s + p.score, 0) / pair_count) : null;

  return {
    pair_count,
    unique_candidate_count: uniqueCandidates.size,
    strong_match_count,
    avg_overall,
    strong_match_rate:
      pair_count > 0 ? Math.round((strong_match_count / pair_count) * 1000) / 10 : null,
    by_job,
    distribution,
  };
}
