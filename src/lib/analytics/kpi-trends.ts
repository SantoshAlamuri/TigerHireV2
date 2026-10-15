import type { SupabaseClient } from "@supabase/supabase-js";

export type KpiTrendPoint = {
  current: number | null;
  prior: number | null;
  delta: number | null;
};

export type AnalyticsKpiTrends = {
  /** The comparison window in days (30 / 90 / 365). Prior period is the equal window before it. */
  periodDays: number;
  applications30d: KpiTrendPoint;
  hired30d: KpiTrendPoint;
  avgTimeToHireDays: KpiTrendPoint;
  offerAcceptanceRate: KpiTrendPoint;
  costPerHireUsd: KpiTrendPoint;
  avgFitScore: KpiTrendPoint;
};

/** Supported executive trend windows. */
export const ANALYTICS_PERIOD_DAYS = { "30d": 30, "90d": 90, "12mo": 365 } as const;
export type AnalyticsPeriodKey = keyof typeof ANALYTICS_PERIOD_DAYS;

export function resolvePeriodDays(period: string | null | undefined): number {
  if (period && period in ANALYTICS_PERIOD_DAYS) {
    return ANALYTICS_PERIOD_DAYS[period as AnalyticsPeriodKey];
  }
  return ANALYTICS_PERIOD_DAYS["30d"];
}

/**
 * Custom date range → the same (periodDays, anchor) shape the trend/series queries already use:
 * the window is [anchor − periodDays, anchor], compared against the prior equal window.
 * Returns null when the range is missing/invalid; capped at 366 days.
 */
export function resolveCustomPeriod(
  from: string | null | undefined,
  to: string | null | undefined,
): { periodDays: number; anchor: Date } | null {
  if (!from || !to) return null;
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs) || toMs <= fromMs) return null;
  // Anchor at end-of-day so a same-day "to" includes that day's events.
  const anchor = new Date(toMs);
  anchor.setHours(23, 59, 59, 999);
  const periodDays = Math.min(366, Math.max(1, Math.ceil((toMs - fromMs) / 86_400_000)));
  return { periodDays, anchor };
}

type PeriodBounds = {
  currentFrom: string;
  currentTo: string;
  priorFrom: string;
  priorTo: string;
};

function periodBounds(periodDays = 30, now = new Date()): PeriodBounds {
  const currentTo = now.toISOString();
  const currentFromDate = new Date(now);
  currentFromDate.setDate(currentFromDate.getDate() - periodDays);
  const priorToDate = new Date(currentFromDate);
  const priorFromDate = new Date(now);
  priorFromDate.setDate(priorFromDate.getDate() - periodDays * 2);
  return {
    currentFrom: currentFromDate.toISOString(),
    currentTo,
    priorFrom: priorFromDate.toISOString(),
    priorTo: priorToDate.toISOString(),
  };
}

function trendPoint(current: number | null, prior: number | null): KpiTrendPoint {
  if (current == null && prior == null) {
    return { current: null, prior: null, delta: null };
  }
  const c = current ?? 0;
  const p = prior ?? 0;
  return { current, prior, delta: Math.round((c - p) * 100) / 100 };
}

type HmScope = {
  isHiringManager: boolean;
  userId: string;
  hmJobIds: string[];
};

async function countApplications(
  supabase: SupabaseClient,
  orgId: string,
  from: string,
  to: string,
  scope: HmScope,
): Promise<number> {
  const join = scope.isHiringManager
    ? "id, jobs!inner(organisation_id, hiring_manager_id)"
    : "id, jobs!inner(organisation_id)";

  let q = supabase
    .from("applications")
    .select(join, { count: "exact", head: true })
    .eq("jobs.organisation_id", orgId)
    .gte("created_at", from)
    .lte("created_at", to);

  if (scope.isHiringManager) {
    q = q.eq("jobs.hiring_manager_id", scope.userId) as typeof q;
  }

  const { count } = await q;
  return count ?? 0;
}

async function countHired(
  supabase: SupabaseClient,
  orgId: string,
  from: string,
  to: string,
  scope: HmScope,
): Promise<number> {
  const join = scope.isHiringManager
    ? "id, jobs!inner(organisation_id, hiring_manager_id)"
    : "id, jobs!inner(organisation_id)";

  let q = supabase
    .from("applications")
    .select(join, { count: "exact", head: true })
    .eq("jobs.organisation_id", orgId)
    .eq("status", "hired")
    .gte("updated_at", from)
    .lte("updated_at", to);

  if (scope.isHiringManager) {
    q = q.eq("jobs.hiring_manager_id", scope.userId) as typeof q;
  }

  const { count } = await q;
  return count ?? 0;
}

async function avgTimeToHireDays(
  supabase: SupabaseClient,
  orgId: string,
  from: string,
  to: string,
  scope: HmScope,
): Promise<number | null> {
  const join = scope.isHiringManager
    ? "created_at, updated_at, jobs!inner(organisation_id, hiring_manager_id)"
    : "created_at, updated_at, jobs!inner(organisation_id)";

  let q = supabase
    .from("applications")
    .select(join)
    .eq("jobs.organisation_id", orgId)
    .eq("status", "hired")
    .gte("updated_at", from)
    .lte("updated_at", to)
    .limit(500);

  if (scope.isHiringManager) {
    q = q.eq("jobs.hiring_manager_id", scope.userId) as typeof q;
  }

  const { data } = await q;
  const rows = (data ?? []) as Array<{ created_at?: string; updated_at?: string }>;
  if (rows.length === 0) return null;

  let totalDays = 0;
  let n = 0;
  for (const row of rows) {
    if (!row.created_at || !row.updated_at) continue;
    const days = (Date.parse(row.updated_at) - Date.parse(row.created_at)) / (1000 * 60 * 60 * 24);
    if (!Number.isFinite(days) || days < 0) continue;
    totalDays += days;
    n += 1;
  }
  if (n === 0) return null;
  return Math.round((totalDays / n) * 10) / 10;
}

async function offerAcceptanceRate(
  supabase: SupabaseClient,
  orgId: string,
  from: string,
  to: string,
  scope: HmScope,
): Promise<number | null> {
  let q = supabase
    .from("offers")
    .select(
      "sent_at, signed_at, declined_at, expired_at, status, signing_status, applications!inner(job_id, jobs!inner(organisation_id, hiring_manager_id))",
    )
    .eq("applications.jobs.organisation_id", orgId)
    .gte("sent_at", from)
    .lte("sent_at", to)
    .limit(500);

  if (scope.isHiringManager && scope.hmJobIds.length > 0) {
    q = q.in("applications.job_id", scope.hmJobIds);
  } else if (scope.isHiringManager) {
    return null;
  }

  const { data } = await q;
  const rows = (data ?? []) as Array<{
    sent_at?: string | null;
    signed_at?: string | null;
    status?: string | null;
    signing_status?: string | null;
  }>;
  const sent = rows.filter((r) => Boolean(r.sent_at));
  if (sent.length === 0) return null;
  const accepted = sent.filter(
    (r) => Boolean(r.signed_at) || r.status === "accepted" || r.signing_status === "signed",
  ).length;
  return Math.round((accepted / sent.length) * 1000) / 1000;
}

async function costPerHireUsd(
  supabase: SupabaseClient,
  orgId: string,
  from: string,
  to: string,
  scope: HmScope,
): Promise<number | null> {
  if (scope.isHiringManager) return null;

  const [{ data: costRows }, { count: hiredCount }] = await Promise.all([
    supabase
      .from("platform_cost_events")
      .select("amount_usd")
      .eq("organisation_id", orgId)
      .gte("occurred_at", from)
      .lte("occurred_at", to)
      .limit(2000),
    supabase
      .from("applications")
      .select("id, jobs!inner(organisation_id)", { count: "exact", head: true })
      .eq("status", "hired")
      .eq("jobs.organisation_id", orgId)
      .gte("updated_at", from)
      .lte("updated_at", to),
  ]);

  const hires = hiredCount ?? 0;
  if (hires === 0) return null;
  let total = 0;
  for (const row of costRows ?? []) {
    total += Number((row as { amount_usd?: number }).amount_usd ?? 0);
  }
  return Math.round((total / hires) * 100) / 100;
}

async function avgFitScoreInPeriod(
  supabase: SupabaseClient,
  orgId: string,
  from: string,
  to: string,
  scope: HmScope,
): Promise<number | null> {
  let q = supabase
    .from("fit_scores")
    .select("overall_score, jobs!inner(organisation_id)")
    .eq("jobs.organisation_id", orgId)
    .or("is_test_run.is.null,is_test_run.eq.false")
    .gte("created_at", from)
    .lte("created_at", to)
    .limit(2000);

  if (scope.isHiringManager && scope.hmJobIds.length > 0) {
    q = q.in("job_id", scope.hmJobIds);
  } else if (scope.isHiringManager) {
    return null;
  }

  const { data } = await q;
  const scores = (data ?? [])
    .map((r) => Number((r as { overall_score?: number | null }).overall_score))
    .filter((n) => Number.isFinite(n));
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export async function getAnalyticsKpiTrends(
  supabase: SupabaseClient,
  orgId: string,
  scope: HmScope,
  periodDays = 30,
  anchor?: Date,
): Promise<AnalyticsKpiTrends> {
  const bounds = periodBounds(periodDays, anchor ?? new Date());

  const [
    appsCurrent,
    appsPrior,
    hiredCurrent,
    hiredPrior,
    tthCurrent,
    tthPrior,
    offerCurrent,
    offerPrior,
    cphCurrent,
    cphPrior,
    fitCurrent,
    fitPrior,
  ] = await Promise.all([
    countApplications(supabase, orgId, bounds.currentFrom, bounds.currentTo, scope),
    countApplications(supabase, orgId, bounds.priorFrom, bounds.priorTo, scope),
    countHired(supabase, orgId, bounds.currentFrom, bounds.currentTo, scope),
    countHired(supabase, orgId, bounds.priorFrom, bounds.priorTo, scope),
    avgTimeToHireDays(supabase, orgId, bounds.currentFrom, bounds.currentTo, scope),
    avgTimeToHireDays(supabase, orgId, bounds.priorFrom, bounds.priorTo, scope),
    offerAcceptanceRate(supabase, orgId, bounds.currentFrom, bounds.currentTo, scope),
    offerAcceptanceRate(supabase, orgId, bounds.priorFrom, bounds.priorTo, scope),
    costPerHireUsd(supabase, orgId, bounds.currentFrom, bounds.currentTo, scope),
    costPerHireUsd(supabase, orgId, bounds.priorFrom, bounds.priorTo, scope),
    avgFitScoreInPeriod(supabase, orgId, bounds.currentFrom, bounds.currentTo, scope),
    avgFitScoreInPeriod(supabase, orgId, bounds.priorFrom, bounds.priorTo, scope),
  ]);

  return {
    periodDays,
    applications30d: trendPoint(appsCurrent, appsPrior),
    hired30d: trendPoint(hiredCurrent, hiredPrior),
    avgTimeToHireDays: trendPoint(tthCurrent, tthPrior),
    offerAcceptanceRate: trendPoint(offerCurrent, offerPrior),
    costPerHireUsd: trendPoint(cphCurrent, cphPrior),
    avgFitScore: trendPoint(fitCurrent, fitPrior),
  };
}

export type AnalyticsKpiSeries = {
  periodDays: number;
  /** ISO start timestamp of each bucket, oldest → newest. */
  buckets: string[];
  /** Applications created in each bucket (by created_at). */
  applications: number[];
  /** Applications that reached `hired` in each bucket (by updated_at). */
  hired: number[];
};

/** Bucket count tuned so each window yields a readable sparkline (≈10–13 points). */
function seriesBinCount(periodDays: number): number {
  if (periodDays <= 30) return 10;
  if (periodDays <= 90) return 13;
  return 12;
}

/**
 * Time-bucketed applications + hires over the current period, for executive sparklines.
 * Buckets are equal-width bins across [now - periodDays, now]. Genuinely sourced from
 * `applications.created_at` / `updated_at`; returns null (never faked) on query failure.
 */
export async function getAnalyticsKpiSeries(
  supabase: SupabaseClient,
  orgId: string,
  scope: HmScope,
  periodDays = 30,
  anchor?: Date,
): Promise<AnalyticsKpiSeries> {
  const now = anchor ?? new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - periodDays);
  const startMs = start.getTime();
  const spanMs = now.getTime() - startMs;
  const bins = seriesBinCount(periodDays);
  const binMs = spanMs / bins;

  const buckets: string[] = Array.from({ length: bins }, (_, i) =>
    new Date(startMs + i * binMs).toISOString(),
  );
  const applications = new Array<number>(bins).fill(0);
  const hired = new Array<number>(bins).fill(0);

  const binIndex = (iso: string | undefined | null): number | null => {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (!Number.isFinite(t) || t < startMs) return null;
    const idx = Math.floor((t - startMs) / binMs);
    return Math.min(Math.max(idx, 0), bins - 1);
  };

  const join = scope.isHiringManager
    ? "created_at, jobs!inner(organisation_id, hiring_manager_id)"
    : "created_at, jobs!inner(organisation_id)";
  const hiredJoin = scope.isHiringManager
    ? "updated_at, jobs!inner(organisation_id, hiring_manager_id)"
    : "updated_at, jobs!inner(organisation_id)";

  let appsQuery = supabase
    .from("applications")
    .select(join)
    .eq("jobs.organisation_id", orgId)
    .gte("created_at", start.toISOString())
    .lte("created_at", now.toISOString())
    .limit(5000);
  if (scope.isHiringManager) {
    appsQuery = appsQuery.eq("jobs.hiring_manager_id", scope.userId) as typeof appsQuery;
  }

  let hiredQuery = supabase
    .from("applications")
    .select(hiredJoin)
    .eq("jobs.organisation_id", orgId)
    .eq("status", "hired")
    .gte("updated_at", start.toISOString())
    .lte("updated_at", now.toISOString())
    .limit(5000);
  if (scope.isHiringManager) {
    hiredQuery = hiredQuery.eq("jobs.hiring_manager_id", scope.userId) as typeof hiredQuery;
  }

  const [appsRes, hiredRes] = await Promise.all([appsQuery, hiredQuery]);

  for (const row of (appsRes.data ?? []) as Array<{ created_at?: string }>) {
    const idx = binIndex(row.created_at);
    if (idx != null) applications[idx] += 1;
  }
  for (const row of (hiredRes.data ?? []) as Array<{ updated_at?: string }>) {
    const idx = binIndex(row.updated_at);
    if (idx != null) hired[idx] += 1;
  }

  return { periodDays, buckets, applications, hired };
}

export function formatTrendChip(
  trend: KpiTrendPoint,
  opts: {
    lowerIsBetter?: boolean;
    unit?: string;
    percentPoints?: boolean;
    currency?: boolean;
    /** Short label for the comparison window, e.g. "30d", "90d", "12mo". */
    periodLabel?: string;
  } = {},
): { value: string; positive: boolean } | undefined {
  const { current, prior, delta } = trend;
  const priorLabel = `vs prior ${opts.periodLabel ?? "30d"}`;
  if (current == null && prior == null) return undefined;
  if (delta == null || delta === 0) {
    return { value: `Flat ${priorLabel}`, positive: true };
  }

  const abs = Math.abs(delta);
  const arrow = delta > 0 ? "▲" : "▼";
  const lowerIsBetter = opts.lowerIsBetter === true;
  const positive = lowerIsBetter ? delta < 0 : delta > 0;

  let magnitude: string;
  if (opts.currency) {
    magnitude = `$${abs.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
  } else if (opts.percentPoints) {
    magnitude = `${(abs * 100).toFixed(1)} pts`;
  } else if (opts.unit) {
    magnitude = `${abs.toFixed(abs % 1 === 0 ? 0 : 1)} ${opts.unit}`;
  } else {
    magnitude = abs.toFixed(abs % 1 === 0 ? 0 : 1);
  }

  return {
    value: `${arrow} ${magnitude} ${priorLabel}`,
    positive,
  };
}
