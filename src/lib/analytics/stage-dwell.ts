import type { SupabaseClient } from "@supabase/supabase-js";

export type StageDwellRow = {
  job_id: string;
  job_title: string;
  to_stage: string;
  median_days: number | null;
  p90_days: number | null;
  avg_days: number | null;
  candidate_count: number;
  sample_size: number;
};

type SampleRow = {
  job_id: string;
  job_title: string | null;
  to_stage: string;
  candidate_id: string;
  entered_at: string;
  dwell_days: number | string | null;
};

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number | null): number | null {
  if (n == null) return null;
  return Math.round(n * 100) / 100;
}

function percentileLinear(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

/**
 * Completed dwell samples from `pipeline_stage_dwell_samples`, filtered by org (via view join),
 * optional job and entered_at range on the transition into `to_stage`.
 */
export async function getStageDwell(
  supabase: SupabaseClient,
  orgId: string,
  filters?: { jobId?: string; jobIds?: string[]; dateFrom?: string; dateTo?: string },
): Promise<StageDwellRow[]> {
  let q = supabase
    .from("pipeline_stage_dwell_samples")
    .select("job_id, job_title, to_stage, candidate_id, entered_at, dwell_days")
    .eq("organisation_id", orgId);

  if (filters?.jobId) {
    q = q.eq("job_id", filters.jobId);
  } else if (filters?.jobIds && filters.jobIds.length > 0) {
    q = q.in("job_id", filters.jobIds);
  }
  if (filters?.dateFrom) {
    q = q.gte("entered_at", filters.dateFrom);
  }
  if (filters?.dateTo) {
    q = q.lte("entered_at", filters.dateTo);
  }

  const { data, error } = await q;

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as SampleRow[];
  const groups = new Map<
    string,
    {
      job_id: string;
      job_title: string;
      to_stage: string;
      dwells: number[];
      candidates: Set<string>;
    }
  >();

  for (const r of rows) {
    const d = num(r.dwell_days);
    if (d == null) continue;
    const key = `${r.job_id}\0${r.to_stage}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        job_id: r.job_id,
        job_title: (r.job_title as string) || "Unknown",
        to_stage: r.to_stage,
        dwells: [],
        candidates: new Set(),
      };
      groups.set(key, g);
    }
    g.dwells.push(d);
    g.candidates.add(r.candidate_id);
  }

  const out: StageDwellRow[] = [];
  for (const g of groups.values()) {
    const sorted = [...g.dwells].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    out.push({
      job_id: g.job_id,
      job_title: g.job_title,
      to_stage: g.to_stage,
      sample_size: sorted.length,
      candidate_count: g.candidates.size,
      avg_days: round2(sum / sorted.length),
      median_days: round2(percentileLinear(sorted, 0.5)),
      p90_days: round2(percentileLinear(sorted, 0.9)),
    });
  }

  out.sort((a, b) => (b.median_days ?? -1) - (a.median_days ?? -1));
  return out;
}
