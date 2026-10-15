import type { SupabaseClient } from "@supabase/supabase-js";

export type ApplicationFunnelRow = {
  job_id: string;
  organisation_id: string;
  job_title: string;
  applied_count: number;
  screened_count: number;
  shortlisted_count: number;
  interviewed_count: number;
  offered_count: number;
  hired_count: number;
  withdrawn_count: number;
  rejected_count: number;
  conversion_rate: number | null;
};

export type ApplicationSourceRow = {
  source: string;
  count: number;
  hired_count: number;
  conversion_rate: number | null;
};

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

type FunnelViewRow = {
  job_id: string;
  organisation_id: string;
  job_title: string | null;
  applied_count: number | string | null;
  screened_count: number | string | null;
  shortlisted_count: number | string | null;
  interviewed_count: number | string | null;
  offered_count: number | string | null;
  hired_count: number | string | null;
  withdrawn_count: number | string | null;
  rejected_count: number | string | null;
  conversion_rate: number | string | null;
};

function mapFunnelRow(r: FunnelViewRow): ApplicationFunnelRow {
  const applied = num(r.applied_count);
  const hired = num(r.hired_count);
  return {
    job_id: r.job_id,
    organisation_id: r.organisation_id,
    job_title: r.job_title ?? "Unknown",
    applied_count: applied,
    screened_count: num(r.screened_count),
    shortlisted_count: num(r.shortlisted_count),
    interviewed_count: num(r.interviewed_count),
    offered_count: num(r.offered_count),
    hired_count: hired,
    withdrawn_count: num(r.withdrawn_count),
    rejected_count: num(r.rejected_count),
    conversion_rate:
      numOrNull(r.conversion_rate) ??
      (applied > 0 ? Math.round((hired / applied) * 1e6) / 1e6 : null),
  };
}

type AppForFunnel = {
  id: string;
  job_id: string;
  candidate_id: string;
  status: string;
  created_at: string;
  jobs: { organisation_id: string; title: string | null };
};

type TransitionRow = {
  job_id: string;
  candidate_id: string;
  to_stage: string | null;
};

function pairKey(jobId: string, candidateId: string): string {
  return `${jobId}\0${candidateId}`;
}

function addStageKeys(
  sets: {
    screen: Set<string>;
    shortlist: Set<string>;
    interview: Set<string>;
    offer: Set<string>;
  },
  jobId: string,
  candidateId: string,
  toStage: string,
): void {
  const k = pairKey(jobId, candidateId);
  const s = toStage.toLowerCase();
  if (s.includes("screen")) sets.screen.add(k);
  if (s.includes("shortlist")) sets.shortlist.add(k);
  if (s.includes("interview")) sets.interview.add(k);
  if (s.includes("offer")) sets.offer.add(k);
}

function aggregateAppsToFunnel(
  apps: AppForFunnel[],
  stageSets: TransitionRow[],
): ApplicationFunnelRow[] {
  const sets = {
    screen: new Set<string>(),
    shortlist: new Set<string>(),
    interview: new Set<string>(),
    offer: new Set<string>(),
  };
  for (const t of stageSets) {
    if (!t.to_stage) continue;
    addStageKeys(sets, t.job_id, t.candidate_id, t.to_stage);
  }

  const byJob = new Map<
    string,
    {
      organisation_id: string;
      job_title: string;
      applied: number;
      screened: number;
      shortlisted: number;
      interviewed: number;
      offered: number;
      hired: number;
      withdrawn: number;
      rejected: number;
    }
  >();

  for (const a of apps) {
    const orgId = a.jobs.organisation_id;
    const title = a.jobs.title ?? "Unknown";
    let g = byJob.get(a.job_id);
    if (!g) {
      g = {
        organisation_id: orgId,
        job_title: title,
        applied: 0,
        screened: 0,
        shortlisted: 0,
        interviewed: 0,
        offered: 0,
        hired: 0,
        withdrawn: 0,
        rejected: 0,
      };
      byJob.set(a.job_id, g);
    }

    const k = pairKey(a.job_id, a.candidate_id);
    const st = a.status;

    if (st === "withdrawn") {
      g.withdrawn += 1;
      continue;
    }

    g.applied += 1;
    if (sets.screen.has(k)) g.screened += 1;
    if (sets.shortlist.has(k)) g.shortlisted += 1;
    if (sets.interview.has(k)) g.interviewed += 1;
    if (sets.offer.has(k)) g.offered += 1;
    if (st === "hired") g.hired += 1;
    if (st === "rejected") g.rejected += 1;
  }

  const out: ApplicationFunnelRow[] = [];
  for (const [jobId, g] of byJob) {
    const conv = g.applied > 0 ? g.hired / g.applied : null;
    out.push({
      job_id: jobId,
      organisation_id: g.organisation_id,
      job_title: g.job_title,
      applied_count: g.applied,
      screened_count: g.screened,
      shortlisted_count: g.shortlisted,
      interviewed_count: g.interviewed,
      offered_count: g.offered,
      hired_count: g.hired,
      withdrawn_count: g.withdrawn,
      rejected_count: g.rejected,
      conversion_rate: conv != null ? Math.round(conv * 1e6) / 1e6 : null,
    });
  }

  out.sort((a, b) => b.applied_count - a.applied_count);
  return out;
}

/** Combine per-job funnel rows (e.g. “all open jobs”) for a single summary row. */
export function combineApplicationFunnelRows(
  rows: ApplicationFunnelRow[],
): ApplicationFunnelRow | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0]!;

  const applied = rows.reduce((s, r) => s + r.applied_count, 0);
  const hired = rows.reduce((s, r) => s + r.hired_count, 0);
  const conv = applied > 0 ? Math.round((hired / applied) * 1e6) / 1e6 : null;

  return {
    job_id: "",
    organisation_id: rows[0]!.organisation_id,
    job_title: "All filtered jobs",
    applied_count: applied,
    screened_count: rows.reduce((s, r) => s + r.screened_count, 0),
    shortlisted_count: rows.reduce((s, r) => s + r.shortlisted_count, 0),
    interviewed_count: rows.reduce((s, r) => s + r.interviewed_count, 0),
    offered_count: rows.reduce((s, r) => s + r.offered_count, 0),
    hired_count: hired,
    withdrawn_count: rows.reduce((s, r) => s + r.withdrawn_count, 0),
    rejected_count: rows.reduce((s, r) => s + r.rejected_count, 0),
    conversion_rate: conv,
  };
}

async function getApplicationFunnelWithDateFilter(
  supabase: SupabaseClient,
  orgId: string,
  filters: { jobId?: string; jobIds?: string[]; dateFrom?: string; dateTo?: string },
): Promise<ApplicationFunnelRow[]> {
  let q = supabase
    .from("applications")
    .select("id, job_id, candidate_id, status, created_at, jobs!inner(organisation_id, title)")
    .eq("jobs.organisation_id", orgId);

  if (filters.jobId) {
    q = q.eq("job_id", filters.jobId);
  } else if (filters.jobIds && filters.jobIds.length > 0) {
    q = q.in("job_id", filters.jobIds);
  }
  if (filters.dateFrom) {
    q = q.gte("created_at", filters.dateFrom);
  }
  if (filters.dateTo) {
    q = q.lte("created_at", filters.dateTo);
  }

  const { data: apps, error: appErr } = await q;
  if (appErr) {
    throw new Error(appErr.message);
  }
  const list = (apps ?? []) as unknown as AppForFunnel[];
  if (list.length === 0) {
    return [];
  }

  const jobIds = [...new Set(list.map((a) => a.job_id))];
  const { data: trans, error: transErr } = await supabase
    .from("pipeline_stage_transitions")
    .select("job_id, candidate_id, to_stage")
    .in("job_id", jobIds);

  if (transErr) {
    throw new Error(transErr.message);
  }

  const pairSet = new Set(list.map((a) => pairKey(a.job_id, a.candidate_id)));
  const stageRows = ((trans ?? []) as TransitionRow[]).filter((t) =>
    pairSet.has(pairKey(t.job_id, t.candidate_id)),
  );

  return aggregateAppsToFunnel(list, stageRows);
}

/**
 * Application funnel metrics per job. Uses `application_funnel` when no application date range is set;
 * otherwise filters `applications.created_at` and recomputes in-process (same rules as the view).
 */
export async function getApplicationFunnel(
  supabase: SupabaseClient,
  orgId: string,
  filters?: { jobId?: string; jobIds?: string[]; dateFrom?: string; dateTo?: string },
): Promise<ApplicationFunnelRow[]> {
  const f = filters ?? {};
  if (f.dateFrom || f.dateTo) {
    return getApplicationFunnelWithDateFilter(supabase, orgId, f);
  }

  let q = supabase.from("application_funnel").select("*").eq("organisation_id", orgId);
  if (f.jobId) {
    q = q.eq("job_id", f.jobId);
  } else if (f.jobIds && f.jobIds.length > 0) {
    q = q.in("job_id", f.jobIds);
  }

  const { data, error } = await q;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as FunnelViewRow[];
  return rows.map(mapFunnelRow);
}

type SourceViewRow = {
  job_id: string;
  organisation_id: string;
  job_title: string | null;
  source: string;
  count: number | string | null;
  hired_count: number | string | null;
  conversion_rate: number | string | null;
};

type AppForSource = {
  job_id: string;
  source: string | null;
  status: string;
  created_at: string;
  jobs: { organisation_id: string };
};

/**
 * Source breakdown from `applications.source`, scoped by org and optional job / created_at range.
 * Returns [] if the query fails (e.g. missing column in an old DB snapshot).
 */
export async function getSourceSummary(
  supabase: SupabaseClient,
  orgId: string,
  filters?: { jobId?: string; jobIds?: string[]; dateFrom?: string; dateTo?: string },
): Promise<ApplicationSourceRow[]> {
  try {
    const f = filters ?? {};
    if (f.dateFrom || f.dateTo || f.jobId || (f.jobIds && f.jobIds.length > 0)) {
      let q = supabase
        .from("applications")
        .select("job_id, source, status, created_at, jobs!inner(organisation_id)")
        .eq("jobs.organisation_id", orgId);

      if (f.jobId) {
        q = q.eq("job_id", f.jobId);
      } else if (f.jobIds && f.jobIds.length > 0) {
        q = q.in("job_id", f.jobIds);
      }
      if (f.dateFrom) {
        q = q.gte("created_at", f.dateFrom);
      }
      if (f.dateTo) {
        q = q.lte("created_at", f.dateTo);
      }

      const { data, error } = await q;
      if (error) {
        return [];
      }

      const bySource = new Map<string, { count: number; hired: number }>();
      for (const raw of data ?? []) {
        const a = raw as unknown as AppForSource;
        const src = (a.source && String(a.source).trim()) || "unknown";
        let g = bySource.get(src);
        if (!g) {
          g = { count: 0, hired: 0 };
          bySource.set(src, g);
        }
        g.count += 1;
        if (a.status === "hired") g.hired += 1;
      }

      const out: ApplicationSourceRow[] = [];
      for (const [source, g] of bySource) {
        out.push({
          source,
          count: g.count,
          hired_count: g.hired,
          conversion_rate: g.count > 0 ? Math.round((g.hired / g.count) * 1e6) / 1e6 : null,
        });
      }
      out.sort((a, b) => b.count - a.count);
      return out;
    }

    const q = supabase.from("application_source_summary").select("*").eq("organisation_id", orgId);

    const { data, error } = await q;
    if (error) {
      return [];
    }

    const bySource = new Map<string, { count: number; hired: number }>();
    for (const raw of data ?? []) {
      const r = raw as SourceViewRow;
      const src = r.source || "unknown";
      let g = bySource.get(src);
      if (!g) {
        g = { count: 0, hired: 0 };
        bySource.set(src, g);
      }
      g.count += num(r.count);
      g.hired += num(r.hired_count);
    }

    const out: ApplicationSourceRow[] = [];
    for (const [source, g] of bySource) {
      out.push({
        source,
        count: g.count,
        hired_count: g.hired,
        conversion_rate: g.count > 0 ? Math.round((g.hired / g.count) * 1e6) / 1e6 : null,
      });
    }
    out.sort((a, b) => b.count - a.count);
    return out;
  } catch {
    return [];
  }
}
