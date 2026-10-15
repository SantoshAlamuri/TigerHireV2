import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchAllSupabasePages } from "@/lib/analytics/fetch-paged";

export interface CostRange {
  fromIso: string;
  toIso: string;
}

export interface SummaryResult {
  totalUsd: number;
  estimatedUsd: number;
  invoicedUsd: number;
  /** Super-admin manual USD rows (invoices entered when APIs are unavailable). */
  manualUsd: number;
  eventsCount: number;
}

export function getRangeFromDays(rangeDaysRaw: string | null, fallbackDays = 30): CostRange {
  const rangeDays = Number.parseInt(rangeDaysRaw ?? `${fallbackDays}`, 10);
  const safeDays = Number.isFinite(rangeDays)
    ? Math.min(Math.max(rangeDays, 1), 365)
    : fallbackDays;
  const to = new Date();
  const from = new Date(to.getTime() - safeDays * 24 * 60 * 60 * 1000);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

/** UTC calendar month key `YYYY-MM` from an ISO-8601 instant. */
export function getUtcMonthKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "1970-01";
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Most recent `count` UTC month keys (current month first). */
export function listRecentUtcMonthKeys(count: number): string[] {
  const n = Number.isFinite(count) ? Math.min(Math.max(Math.floor(count), 1), 60) : 12;
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return out;
}

/** Start of UTC month `monthKey` (`YYYY-MM`) as ISO string. */
export function getUtcMonthStartIso(monthKey: string): string {
  const [ys, ms] = monthKey.split("-");
  const y = Number(ys);
  const m0 = Number(ms) - 1;
  if (!Number.isFinite(y) || m0 < 0 || m0 > 11) {
    return new Date(Date.UTC(1970, 0, 1, 0, 0, 0, 0)).toISOString();
  }
  return new Date(Date.UTC(y, m0, 1, 0, 0, 0, 0)).toISOString();
}

export async function getCostSummary(range: CostRange): Promise<SummaryResult> {
  const admin = createSupabaseAdmin();
  // Page through every event — a single PostgREST query caps at ~1k rows and
  // silently under-counts the totals once a window exceeds that.
  const { data, error } = await fetchAllSupabasePages<{
    amount_usd: number | null;
    status: string | null;
  }>((from, to) =>
    admin
      .from("platform_cost_events")
      .select("amount_usd, status")
      .gte("occurred_at", range.fromIso)
      .lt("occurred_at", range.toIso)
      .order("occurred_at", { ascending: true })
      .range(from, to),
  );
  if (error) throw error;

  const events = data ?? [];
  let totalUsd = 0;
  let estimatedUsd = 0;
  let invoicedUsd = 0;
  let manualUsd = 0;
  for (const row of events) {
    const amount = Number((row.amount_usd as number) ?? 0);
    totalUsd += amount;
    if (row.status === "invoiced") invoicedUsd += amount;
    else if (row.status === "manual") manualUsd += amount;
    else estimatedUsd += amount;
  }

  return {
    totalUsd: Number(totalUsd.toFixed(6)),
    estimatedUsd: Number(estimatedUsd.toFixed(6)),
    invoicedUsd: Number(invoicedUsd.toFixed(6)),
    manualUsd: Number(manualUsd.toFixed(6)),
    eventsCount: events.length,
  };
}

export async function getCostByProvider(
  range: CostRange,
): Promise<Array<{ provider: string; totalUsd: number; eventsCount: number }>> {
  const admin = createSupabaseAdmin();
  const { data, error } = await fetchAllSupabasePages<{
    provider: string | null;
    amount_usd: number | null;
  }>((from, to) =>
    admin
      .from("platform_cost_events")
      .select("provider, amount_usd")
      .gte("occurred_at", range.fromIso)
      .lt("occurred_at", range.toIso)
      .order("occurred_at", { ascending: true })
      .range(from, to),
  );
  if (error) throw error;

  const map = new Map<string, { totalUsd: number; eventsCount: number }>();
  for (const row of data ?? []) {
    const provider = (row.provider as string) ?? "unknown";
    const existing = map.get(provider) ?? { totalUsd: 0, eventsCount: 0 };
    existing.totalUsd += Number((row.amount_usd as number) ?? 0);
    existing.eventsCount += 1;
    map.set(provider, existing);
  }

  return [...map.entries()]
    .map(([provider, value]) => ({
      provider,
      totalUsd: Number(value.totalUsd.toFixed(6)),
      eventsCount: value.eventsCount,
    }))
    .sort((a, b) => b.totalUsd - a.totalUsd);
}

export interface JobCostRow {
  jobId: string;
  jobTitle: string | null;
  organisationId: string | null;
  totalUsd: number;
  estimatedUsd: number;
  invoicedUsd: number;
  manualUsd: number;
  eventsCount: number;
  /** Distinct candidates who incurred AI spend on this job within the range. */
  candidateCount: number;
  lastActivityAt: string | null;
  byLabel: Array<{ label: string; usd: number; events: number }>;
}

/**
 * Aggregate platform_cost_events by job_id within a window. Joins jobs.title
 * for human-readable rows. Used by /admin/costs per-job report and the
 * top-jobs panel on the costs dashboard.
 */
export async function getCostByJob(range: CostRange, limit = 50): Promise<JobCostRow[]> {
  const admin = createSupabaseAdmin();
  const { data, error } = await fetchAllSupabasePages<{
    job_id: string;
    candidate_id: string | null;
    amount_usd: number | string | null;
    status: string | null;
    occurred_at: string;
    metadata: Record<string, unknown> | null;
  }>((from, to) =>
    admin
      .from("platform_cost_events")
      .select("job_id, candidate_id, amount_usd, status, occurred_at, metadata")
      .gte("occurred_at", range.fromIso)
      .lt("occurred_at", range.toIso)
      .not("job_id", "is", null)
      .order("occurred_at", { ascending: true })
      .range(from, to),
  );
  if (error) throw error;

  type Row = {
    job_id: string;
    candidate_id: string | null;
    amount_usd: number | string | null;
    status: string | null;
    occurred_at: string;
    metadata: Record<string, unknown> | null;
  };

  const rows = (data ?? []) as Row[];
  const byJob = new Map<
    string,
    {
      totalUsd: number;
      estimatedUsd: number;
      invoicedUsd: number;
      manualUsd: number;
      eventsCount: number;
      candidates: Set<string>;
      lastActivityAt: string | null;
      labels: Map<string, { usd: number; events: number }>;
    }
  >();

  for (const row of rows) {
    if (!row.job_id) continue;
    const amount = Number(row.amount_usd ?? 0);
    const acc = byJob.get(row.job_id) ?? {
      totalUsd: 0,
      estimatedUsd: 0,
      invoicedUsd: 0,
      manualUsd: 0,
      eventsCount: 0,
      candidates: new Set<string>(),
      lastActivityAt: null as string | null,
      labels: new Map<string, { usd: number; events: number }>(),
    };
    acc.totalUsd += amount;
    if (row.status === "invoiced") acc.invoicedUsd += amount;
    else if (row.status === "manual") acc.manualUsd += amount;
    else acc.estimatedUsd += amount;
    acc.eventsCount += 1;
    if (row.candidate_id) acc.candidates.add(row.candidate_id);
    if (!acc.lastActivityAt || row.occurred_at > acc.lastActivityAt) {
      acc.lastActivityAt = row.occurred_at;
    }
    const label = String(row.metadata?.label ?? row.metadata?.service ?? "other");
    const labelAcc = acc.labels.get(label) ?? { usd: 0, events: 0 };
    labelAcc.usd += amount;
    labelAcc.events += 1;
    acc.labels.set(label, labelAcc);
    byJob.set(row.job_id, acc);
  }

  const jobIds = [...byJob.keys()];
  if (jobIds.length === 0) return [];

  const { data: jobsData } = await admin
    .from("jobs")
    .select("id, title, organisation_id")
    .in("id", jobIds);
  const jobMeta = new Map<string, { title: string | null; organisationId: string | null }>();
  for (const job of (jobsData ?? []) as Array<{
    id: string;
    title: string | null;
    organisation_id: string | null;
  }>) {
    jobMeta.set(job.id, { title: job.title ?? null, organisationId: job.organisation_id ?? null });
  }

  const result: JobCostRow[] = jobIds.map((jobId) => {
    const acc = byJob.get(jobId)!;
    const meta = jobMeta.get(jobId);
    return {
      jobId,
      jobTitle: meta?.title ?? null,
      organisationId: meta?.organisationId ?? null,
      totalUsd: Number(acc.totalUsd.toFixed(6)),
      estimatedUsd: Number(acc.estimatedUsd.toFixed(6)),
      invoicedUsd: Number(acc.invoicedUsd.toFixed(6)),
      manualUsd: Number(acc.manualUsd.toFixed(6)),
      eventsCount: acc.eventsCount,
      candidateCount: acc.candidates.size,
      lastActivityAt: acc.lastActivityAt,
      byLabel: [...acc.labels.entries()]
        .map(([label, value]) => ({
          label,
          usd: Number(value.usd.toFixed(6)),
          events: value.events,
        }))
        .sort((a, b) => b.usd - a.usd),
    };
  });

  return result.sort((a, b) => b.totalUsd - a.totalUsd).slice(0, limit);
}

/**
 * Anthropic ledger rows in the window with no job_id. Matches gaps between
 * provider totals and "Top jobs" (e.g. QA batch spend recorded before attribution).
 */
export async function getAnthropicCostWithoutJobAttribution(
  range: CostRange,
): Promise<{ totalUsd: number; eventsCount: number }> {
  const admin = createSupabaseAdmin();
  const { data, error } = await fetchAllSupabasePages<{ amount_usd: number | null }>((from, to) =>
    admin
      .from("platform_cost_events")
      .select("amount_usd")
      .gte("occurred_at", range.fromIso)
      .lt("occurred_at", range.toIso)
      .eq("provider", "anthropic")
      .is("job_id", null)
      .order("occurred_at", { ascending: true })
      .range(from, to),
  );
  if (error) throw error;
  let totalUsd = 0;
  const rows = data ?? [];
  for (const row of rows) {
    totalUsd += Number((row.amount_usd as number) ?? 0);
  }
  return {
    totalUsd: Number(totalUsd.toFixed(6)),
    eventsCount: rows.length,
  };
}

export async function getCostTrend(
  range: CostRange,
): Promise<Array<{ day: string; amountUsd: number; eventsCount: number }>> {
  const admin = createSupabaseAdmin();
  // platform_cost_daily is one row per (day, provider, service, status, currency). Without merging,
  // the chart gets duplicate X labels and wrong lines; PostgREST also caps pages (~1k rows) so recent
  // days can disappear. Page through everything, then one point per UTC calendar day.
  const { data: rows, error } = await fetchAllSupabasePages<{
    bucket_day: string;
    amount_usd: number | null;
    events_count: number | null;
  }>((from, to) =>
    admin
      .from("platform_cost_daily")
      .select("bucket_day, amount_usd, events_count")
      .gte("bucket_day", range.fromIso)
      .lt("bucket_day", range.toIso)
      .order("bucket_day", { ascending: true })
      .order("provider", { ascending: true })
      .order("service", { ascending: true })
      .order("status", { ascending: true })
      .order("currency", { ascending: true })
      .range(from, to),
  );
  if (error) throw error;

  const merged = new Map<string, { amountUsd: number; eventsCount: number }>();
  for (const row of rows) {
    const bucket = String(row.bucket_day ?? "");
    const d = new Date(bucket);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    const acc = merged.get(key) ?? { amountUsd: 0, eventsCount: 0 };
    acc.amountUsd += Number(row.amount_usd ?? 0);
    acc.eventsCount += Number(row.events_count ?? 0);
    merged.set(key, acc);
  }

  return [...merged.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, acc]) => ({
      day: `${key}T00:00:00.000Z`,
      amountUsd: Number(acc.amountUsd.toFixed(6)),
      eventsCount: acc.eventsCount,
    }));
}
