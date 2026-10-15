"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Briefcase,
  Users,
  TrendingUp,
  Calendar,
  Activity,
  BarChart3,
  Globe,
  Timer,
  Filter,
  FileSpreadsheet,
  ClipboardList,
  Sparkles,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { PlanDocumentLegacyRedirect } from "@/components/navigation/PlanDocumentLegacyRedirect";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import StatCard from "@/components/dashboard/StatCard";
import { useApiQuery } from "@/lib/hooks/use-api";
import { filterPillClass } from "@/components/ui/filter-pill";
import {
  combineApplicationFunnelRows,
  type ApplicationFunnelRow,
  type ApplicationSourceRow,
} from "@/lib/analytics/application-funnel";
import { getDistributionStatusTone } from "@/lib/status-tones";
import {
  formatTrendChip,
  type AnalyticsKpiTrends,
  type AnalyticsKpiSeries,
} from "@/lib/analytics/kpi-trends";
import type { FitScoreAnalytics } from "@/lib/analytics/fitscore-analytics";
import { AnalyticsAdvancedReportsSection } from "../components/AnalyticsAdvancedReportsSection";
import ExecutiveKpiCard from "../components/ExecutiveKpiCard";

type PeriodKey = "30d" | "90d" | "12mo" | "custom";
const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "12mo", label: "Last 12 months" },
  { key: "custom", label: "Custom" },
];
const PERIOD_CHIP_LABEL: Record<PeriodKey, string> = {
  "30d": "30d",
  "90d": "90d",
  "12mo": "12mo",
  custom: "range",
};

const CHART_COLORS = ["#f97316", "#ea580c", "#c2410c", "#9a3412", "#7c2d12"];
const REPORT_CARD_CLASS = "card-lifted p-5 transition-colors duration-200";
const REPORT_EXPORT_LINK_CLASS =
  "inline-flex items-center rounded-md border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/65 transition-colors duration-200 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20";
const REPORT_TABLE_ROW_CLASS =
  "border-b border-[var(--border)]/60 text-[var(--text)] transition-colors duration-150 hover:bg-white/[0.04]";
const REPORT_ACTIVITY_ROW_CLASS =
  "flex flex-wrap items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm transition-colors duration-150 hover:border-white/20 hover:bg-white/[0.04]";

interface OverviewData {
  overview: {
    activeJobs: number;
    totalApplications: number;
    hiredCount: number;
    pendingApplications: number;
    applicationsThisMonth: number;
  };
}

interface TimeToHireRow {
  job_id?: string;
  job_title: string;
  avg_days_to_hire: number;
  min_days: number;
  max_days: number;
  hired_count: number;
}

interface PipelineRow {
  job_id?: string;
  job_title: string;
  total_applications: number;
  viewed: number;
  shortlisted: number;
  hired: number;
  rejected: number;
  withdrawn: number;
  hire_rate_pct: number;
}

interface SourceRow {
  source: string;
  candidate_count: number;
}

interface ActivityRow {
  event_id?: string | null;
  job_id?: string | null;
  event_type: string;
  event_detail: string;
  job_title: string | null;
  event_at: string;
}

interface BoardSummary {
  board: string;
  pushed: number;
  failed: number;
  removed: number;
  active: number;
}

interface DistributionRow {
  id: string;
  jobId: string;
  board: string;
  status: string;
  pushedAt: string | null;
  removedAt: string | null;
  error: string | null;
  jobTitle: string;
}

interface StageDwellRow {
  job_id: string;
  job_title: string;
  to_stage: string;
  median_days: number | null;
  p90_days: number | null;
  avg_days: number | null;
  candidate_count: number;
  sample_size: number;
}

interface JobsListResponse {
  jobs: { id: string; title?: string | null }[];
}

interface OfferOutcomesData {
  offer_outcomes: {
    total_offers: number;
    sent_count: number;
    viewed_count: number;
    accepted_count: number;
    declined_count: number;
    expired_count: number;
    awaiting_response_count: number;
    acceptance_rate: number | null;
    drop_off_rate: number | null;
    response_rate: number | null;
  };
}

interface RecruiterProductivityData {
  recruiters: {
    recruiter_id: string;
    recruiter_name: string;
    jobs_owned: number;
    applications_reviewed: number;
    hires_closed: number;
    interviews_scheduled: number;
    close_rate: number | null;
  }[];
}

interface CostPerHireData {
  cost_per_hire: {
    total_cost_usd: number | null;
    invoiced_cost_usd: number | null;
    estimated_cost_usd: number | null;
    hired_count: number;
    cost_per_hire_usd: number | null;
    note: string | null;
  };
}

type ViewMode = "executive" | "operational";

function ChartTooltipCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="rounded-lg border border-white/15 bg-[#121212]/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="mb-1 text-xs font-semibold text-white">{title}</p>
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="text-white/65">{row.label}</span>
            <span className="font-semibold text-white">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [jobFilter, setJobFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [medianSortDesc, setMedianSortDesc] = useState(true);
  const [reportMetric, setReportMetric] = useState("pipeline");
  const [viewMode, setViewMode] = useState<ViewMode>("executive");
  const [period, setPeriod] = useState<PeriodKey>("30d");

  const analyticsDateRangeInvalid = useMemo(() => {
    if (!dateFrom.trim() || !dateTo.trim()) return false;
    const a = Date.parse(dateFrom);
    const b = Date.parse(dateTo);
    if (Number.isNaN(a) || Number.isNaN(b)) return true;
    return a > b;
  }, [dateFrom, dateTo]);

  const analyticsSliceParams = useMemo(
    () => ({
      ...(jobFilter ? { jobId: jobFilter } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    }),
    [jobFilter, dateFrom, dateTo],
  );

  const jobScopedAnalyticsParams = useMemo(
    () => ({
      ...(jobFilter ? { jobId: jobFilter } : {}),
    }),
    [jobFilter],
  );

  const datedAnalyticsParams = analyticsDateRangeInvalid
    ? jobScopedAnalyticsParams
    : analyticsSliceParams;

  const { data: overviewData, loading: overviewLoading } = useApiQuery<{
    overview: OverviewData["overview"] & {
      fitScoreStrongMatchRate?: number | null;
    };
    fitScore?: FitScoreAnalytics | null;
    trends?: AnalyticsKpiTrends | null;
    series?: AnalyticsKpiSeries | null;
  }>("/api/analytics", {
    metric: "overview",
    period,
    // Custom window: explicit from/to anchor the KPI comparison; invalid/missing
    // dates fall back server-side to the default 30d window.
    ...(period === "custom" && dateFrom && dateTo && !analyticsDateRangeInvalid
      ? { from: dateFrom, to: dateTo }
      : {}),
  });
  const { data: tthData, loading: tthLoading } = useApiQuery<{
    time_to_hire: TimeToHireRow[];
  }>("/api/analytics", { metric: "time_to_hire", ...jobScopedAnalyticsParams });
  const { data: pipelineData, loading: pipelineLoading } = useApiQuery<{
    pipeline: PipelineRow[];
  }>("/api/analytics", { metric: "pipeline", ...jobScopedAnalyticsParams });
  const { data: sourcesData, loading: sourcesLoading } = useApiQuery<{
    sources: SourceRow[];
  }>("/api/analytics", { metric: "sources" });
  const { data: activityData, loading: activityLoading } = useApiQuery<{
    activity: ActivityRow[];
  }>("/api/analytics", { metric: "activity", ...datedAnalyticsParams });
  const { data: boardsData, loading: boardsLoading } = useApiQuery<{
    boards: BoardSummary[];
    distributions: DistributionRow[];
  }>("/api/analytics", { metric: "boards", ...datedAnalyticsParams });

  const funnelQueryUrl = analyticsDateRangeInvalid ? null : "/api/analytics/application-funnel";
  const dwellQueryUrl = analyticsDateRangeInvalid ? null : "/api/analytics/stage-dwell";

  const { data: funnelData, loading: funnelLoading } = useApiQuery<{
    funnel: ApplicationFunnelRow[];
    sources: ApplicationSourceRow[];
    generatedAt: string;
  }>(funnelQueryUrl, analyticsSliceParams);

  const { data: dwellData, loading: dwellLoading } = useApiQuery<{
    data: StageDwellRow[];
    generatedAt: string;
  }>(dwellQueryUrl, analyticsSliceParams);

  const { data: fitScoreData, loading: fitScoreLoading } = useApiQuery<{
    fitscore: FitScoreAnalytics;
  }>("/api/analytics", { metric: "fitscore", ...jobScopedAnalyticsParams });

  const { data: offerOutcomesData, loading: offerOutcomesLoading } = useApiQuery<OfferOutcomesData>(
    "/api/analytics",
    {
      metric: "offer_outcomes",
      ...jobScopedAnalyticsParams,
    },
  );
  const { data: recruiterProductivityData, loading: recruiterProductivityLoading } =
    useApiQuery<RecruiterProductivityData>("/api/analytics", {
      metric: "recruiter_productivity",
      ...analyticsSliceParams,
    });
  const { data: costPerHireData, loading: costPerHireLoading } = useApiQuery<CostPerHireData>(
    "/api/analytics",
    {
      metric: "cost_per_hire",
      ...jobScopedAnalyticsParams,
    },
  );

  const funnelSummary = useMemo(() => {
    const rows = funnelData?.funnel ?? [];
    return combineApplicationFunnelRows(rows);
  }, [funnelData?.funnel]);

  const loading =
    overviewLoading ||
    tthLoading ||
    pipelineLoading ||
    sourcesLoading ||
    activityLoading ||
    boardsLoading;
  const { data: jobsForFilter } = useApiQuery<JobsListResponse>("/api/jobs", {
    status: "open",
    limit: 100,
    page: 1,
  });

  const dwellRowsSorted = useMemo(() => {
    const rows = [...(dwellData?.data ?? [])];
    rows.sort((a, b) => {
      const av = a.median_days ?? -1;
      const bv = b.median_days ?? -1;
      return medianSortDesc ? bv - av : av - bv;
    });
    return rows;
  }, [dwellData?.data, medianSortDesc]);
  const overview = overviewData?.overview;
  const kpiTrends = overviewData?.trends;
  const kpiSeries = overviewData?.series ?? null;
  const periodChipLabel = PERIOD_CHIP_LABEL[period];
  const fitScore = fitScoreData?.fitscore ?? overviewData?.fitScore ?? null;
  const timeToHire = tthData?.time_to_hire ?? [];
  const pipeline = pipelineData?.pipeline ?? [];
  const sources = sourcesData?.sources ?? [];
  const activity = activityData?.activity ?? [];
  const boards = boardsData?.boards ?? [];
  const distributions = boardsData?.distributions ?? [];
  const offerOutcomes = offerOutcomesData?.offer_outcomes;
  const recruiterRows = recruiterProductivityData?.recruiters ?? [];
  const costPerHire = costPerHireData?.cost_per_hire;
  const exportHref = (metric: string) => {
    const params = new URLSearchParams();
    params.set("metric", metric);
    if (jobFilter) params.set("jobId", jobFilter);
    if (dateFrom) {
      params.set("from", dateFrom);
      params.set("dateFrom", dateFrom);
    }
    if (dateTo) {
      params.set("to", dateTo);
      params.set("dateTo", dateTo);
    }
    return `/api/analytics/export?${params.toString()}`;
  };
  const reportExportHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("metric", reportMetric);
    if (jobFilter) params.set("jobId", jobFilter);
    if (dateFrom) {
      params.set("from", dateFrom);
      params.set("dateFrom", dateFrom);
    }
    if (dateTo) {
      params.set("to", dateTo);
      params.set("dateTo", dateTo);
    }
    return `/api/analytics/export?${params.toString()}`;
  }, [dateFrom, dateTo, jobFilter, reportMetric]);
  const formatRate = (value: number | null | undefined) =>
    value == null ? "—" : `${(value * 100).toFixed(1)}%`;
  const formatUsd = (value: number | null | undefined) =>
    value == null ? "—" : `$${value.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
  const formatPipelineLabel = (jobTitle: string) => {
    if (jobTitle.length <= 22) return jobTitle;
    return `${jobTitle.slice(0, 12)}...${jobTitle.slice(-7)}`;
  };
  const pipelineChartData = pipeline.slice(0, 6).map((row) => {
    const hired = Math.max(row.hired, 0);
    const shortlistedOnly = Math.max(row.shortlisted - hired, 0);
    const remaining = Math.max(row.total_applications - row.shortlisted, 0);

    return {
      name: formatPipelineLabel(row.job_title),
      fullName: row.job_title,
      remaining,
      shortlistedOnly,
      hired,
      applications: row.total_applications,
      shortlisted: row.shortlisted,
    };
  });

  return (
    <>
      <PlanDocumentLegacyRedirect />
      <PageHeader
        title="Analytics"
        subtitle="Hiring metrics, funnel health, and exports — use filters below to narrow by job or time range"
      />
      {loading ? (
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="card-lifted space-y-2 p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-16" />
              </div>
            ))}
          </div>
          <div className="card-lifted space-y-3 p-5">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="card-lifted flex flex-wrap items-center justify-between gap-4 p-3">
            <div className="flex items-center gap-3">
              <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("executive")}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    viewMode === "executive"
                      ? "bg-[var(--accent)] text-black"
                      : "text-white/65 hover:text-white"
                  }`}
                >
                  Executive
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("operational")}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    viewMode === "operational"
                      ? "bg-[var(--accent)] text-black"
                      : "text-white/65 hover:text-white"
                  }`}
                >
                  Operational
                </button>
              </div>
              <p className="hidden text-sm text-white/60 sm:block">
                {viewMode === "executive"
                  ? "High-level KPIs with trend and status — scannable in seconds."
                  : "Detailed drill-down: charts, dwell times, activity, and exports."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-white/45">
                KPI window
              </span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="KPI trend window">
                {PERIOD_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    aria-pressed={period === opt.key}
                    onClick={() => setPeriod(opt.key)}
                    className={filterPillClass(period === opt.key, "sm")}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {period === "custom" ? (
                <div className="flex items-center gap-1.5">
                  <label className="sr-only" htmlFor="kpi-window-from">
                    From
                  </label>
                  <input
                    id="kpi-window-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
                  />
                  <span className="text-xs text-white/45">→</span>
                  <label className="sr-only" htmlFor="kpi-window-to">
                    To
                  </label>
                  <input
                    id="kpi-window-to"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
                  />
                  {analyticsDateRangeInvalid ? (
                    <span className="text-xs text-rose-300">from must be before to</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* Executive KPI row — trend-led, benchmarked vs the prior equal window */}
          {overview && kpiTrends && (
            <div>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="heading-section text-lg text-[var(--text)]">Executive summary</h2>
                <p className="text-xs text-white/45">
                  {period === "custom" && dateFrom && dateTo && !analyticsDateRangeInvalid
                    ? `${dateFrom} → ${dateTo}`
                    : PERIOD_OPTIONS.find((o) => o.key === period)?.label}{" "}
                  vs the prior equal window. Sparklines show applications and hires over time; other
                  KPIs show period-over-period change.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <ExecutiveKpiCard
                  label="Applications"
                  value={(kpiTrends.applications30d.current ?? 0).toLocaleString()}
                  trend={formatTrendChip(kpiTrends.applications30d, {
                    periodLabel: periodChipLabel,
                  })}
                  series={kpiSeries?.applications}
                  seriesLabel="Applications over time"
                  icon={<Users size={20} />}
                />
                <ExecutiveKpiCard
                  label="Hired"
                  value={(kpiTrends.hired30d.current ?? 0).toLocaleString()}
                  trend={formatTrendChip(kpiTrends.hired30d, { periodLabel: periodChipLabel })}
                  series={kpiSeries?.hired}
                  seriesLabel="Hires over time"
                  icon={<TrendingUp size={20} />}
                />
                <ExecutiveKpiCard
                  label="Avg FitScore"
                  value={fitScore?.avg_overall != null ? fitScore.avg_overall : "—"}
                  trend={formatTrendChip(kpiTrends.avgFitScore, {
                    unit: "pts",
                    periodLabel: periodChipLabel,
                  })}
                  icon={<Sparkles size={20} />}
                />
                <ExecutiveKpiCard
                  label="Time to hire"
                  value={
                    kpiTrends.avgTimeToHireDays.current != null
                      ? `${kpiTrends.avgTimeToHireDays.current} days`
                      : "—"
                  }
                  trend={formatTrendChip(kpiTrends.avgTimeToHireDays, {
                    unit: "days",
                    lowerIsBetter: true,
                    periodLabel: periodChipLabel,
                  })}
                  icon={<Timer size={20} />}
                />
                <ExecutiveKpiCard
                  label="Offer acceptance"
                  value={
                    offerOutcomes?.acceptance_rate != null
                      ? formatRate(offerOutcomes.acceptance_rate)
                      : kpiTrends.offerAcceptanceRate.current != null
                        ? formatRate(kpiTrends.offerAcceptanceRate.current)
                        : "—"
                  }
                  trend={formatTrendChip(kpiTrends.offerAcceptanceRate, {
                    percentPoints: true,
                    periodLabel: periodChipLabel,
                  })}
                  icon={<TrendingUp size={20} />}
                />
                <ExecutiveKpiCard
                  label="Cost per hire"
                  value={
                    costPerHire?.cost_per_hire_usd != null
                      ? formatUsd(costPerHire.cost_per_hire_usd)
                      : kpiTrends.costPerHireUsd.current != null
                        ? formatUsd(kpiTrends.costPerHireUsd.current)
                        : "—"
                  }
                  trend={formatTrendChip(kpiTrends.costPerHireUsd, {
                    currency: true,
                    lowerIsBetter: true,
                    periodLabel: periodChipLabel,
                  })}
                  icon={<BarChart3 size={20} />}
                />
              </div>
            </div>
          )}

          {viewMode === "operational" && overview && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <StatCard
                label="Active Jobs"
                value={overview.activeJobs.toLocaleString()}
                icon={<Briefcase size={20} />}
              />
              <StatCard
                label="Total Applications"
                value={overview.totalApplications.toLocaleString()}
                trend={kpiTrends ? formatTrendChip(kpiTrends.applications30d) : undefined}
                icon={<Users size={20} />}
              />
              <StatCard
                label="Hired (all time)"
                value={overview.hiredCount.toLocaleString()}
                icon={<TrendingUp size={20} />}
              />
              <StatCard
                label="New applications (applied)"
                value={overview.pendingApplications.toLocaleString()}
                icon={<Calendar size={20} />}
              />
              <StatCard
                label="Applications This Month"
                value={overview.applicationsThisMonth.toLocaleString()}
                icon={<Activity size={20} />}
              />
            </div>
          )}

          <AnalyticsAdvancedReportsSection
            reportCardClass={REPORT_CARD_CLASS}
            reportTableRowClass={REPORT_TABLE_ROW_CLASS}
            reportActivityRowClass={REPORT_ACTIVITY_ROW_CLASS}
            reportExportLinkClass={REPORT_EXPORT_LINK_CLASS}
            showExtendedReports={viewMode === "operational"}
            analyticsDateRangeInvalid={analyticsDateRangeInvalid}
            jobFilter={jobFilter}
            setJobFilter={setJobFilter}
            dateFrom={dateFrom}
            setDateFrom={setDateFrom}
            dateTo={dateTo}
            setDateTo={setDateTo}
            jobsForFilter={jobsForFilter}
            funnelLoading={funnelLoading}
            funnelSummary={funnelSummary}
            funnelData={
              funnelData
                ? {
                    sources: funnelData.sources,
                    generatedAt: funnelData.generatedAt,
                  }
                : undefined
            }
            dwellLoading={dwellLoading}
            dwellRowsSorted={dwellRowsSorted}
            medianSortDesc={medianSortDesc}
            setMedianSortDesc={setMedianSortDesc}
            dwellGeneratedAt={dwellData?.generatedAt}
            activity={activity}
            exportHref={exportHref}
          />

          {/* FitScore intelligence */}
          <div className={REPORT_CARD_CLASS}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                  02 · Quality
                </p>
                <h2 className="heading-section flex items-center gap-2 text-lg text-[var(--text)]">
                  <Sparkles size={20} className="text-[var(--accent)]" />
                  FitScore intelligence
                </h2>
              </div>
            </div>
            {fitScoreLoading && !fitScore ? (
              <div className="space-y-3 py-2">
                <Skeleton className="h-8 w-1/3" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : !fitScore || fitScore.pair_count === 0 ? (
              <p className="text-body text-sm text-white/60">
                No FitScore data yet. Run FitScore on candidates to see match quality by job and
                score distribution.
              </p>
            ) : (
              <>
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="card-lifted p-3">
                    <p className="text-xs text-white/60">Scored pairs</p>
                    <p className="text-xl font-semibold text-[var(--text)]">
                      {fitScore.pair_count.toLocaleString()}
                    </p>
                  </div>
                  <div className="card-lifted p-3">
                    <p className="text-xs text-white/60">Unique candidates</p>
                    <p className="text-xl font-semibold text-[var(--text)]">
                      {fitScore.unique_candidate_count.toLocaleString()}
                    </p>
                  </div>
                  <div className="card-lifted p-3">
                    <p className="text-xs text-white/60">Strong matches (80+)</p>
                    <p className="text-xl font-semibold text-emerald-400">
                      {fitScore.strong_match_count.toLocaleString()}
                    </p>
                  </div>
                  <div className="card-lifted p-3">
                    <p className="text-xs text-white/60">Org avg score</p>
                    <p className="text-xl font-semibold text-[var(--accent)]">
                      {fitScore.avg_overall ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">
                      Score distribution
                    </h3>
                    <div className="h-48 min-h-48 min-w-0 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={fitScore.distribution.map((b) => ({
                            name: b.label,
                            count: b.count,
                          }))}
                          margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-[var(--border)]" />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 10 }}
                            stroke="var(--text-muted)"
                          />
                          <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                          <Tooltip
                            content={({ active, payload }) => {
                              const row = payload?.[0]?.payload as
                                | { name?: string; count?: number }
                                | undefined;
                              if (!active || !row) return null;
                              return (
                                <ChartTooltipCard
                                  title={row.name ?? "Bucket"}
                                  rows={[
                                    {
                                      label: "Candidates",
                                      value: (row.count ?? 0).toLocaleString(),
                                    },
                                  ]}
                                />
                              );
                            }}
                          />
                          <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">
                      Avg FitScore by job
                    </h3>
                    {fitScore.by_job.length === 0 ? (
                      <p className="text-sm text-white/60">No per-job scores in this scope.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[420px] text-left text-sm">
                          <thead>
                            <tr className="border-b border-[var(--border)] text-white/60">
                              <th className="pb-2 pr-4 font-medium">Job</th>
                              <th className="pb-2 pr-4 font-medium">Avg score</th>
                              <th className="pb-2 pr-4 font-medium">Scored</th>
                              <th className="pb-2 font-medium">Strong match</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fitScore.by_job.slice(0, 8).map((row) => (
                              <tr key={row.job_id} className={REPORT_TABLE_ROW_CLASS}>
                                <td className="py-2 pr-4">
                                  <Link
                                    href={`/recruit/jobs/${row.job_id}`}
                                    className="hover:underline"
                                  >
                                    {row.job_title}
                                  </Link>
                                </td>
                                <td className="py-2 pr-4 font-medium text-[var(--accent)]">
                                  {row.avg_overall ?? "—"}
                                </td>
                                <td className="py-2 pr-4">{row.scored_count}</td>
                                <td className="py-2">
                                  {row.strong_match_rate != null
                                    ? `${row.strong_match_rate}%`
                                    : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {viewMode === "operational" ? (
            <div className={REPORT_CARD_CLASS}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                    05 · Reports &amp; export
                  </p>
                  <h2 className="heading-section flex items-center gap-2 text-lg text-[var(--text)]">
                    <ClipboardList size={20} className="text-[var(--accent)]" />
                    Report builder
                  </h2>
                </div>
                <a href={reportExportHref} className={REPORT_EXPORT_LINK_CLASS}>
                  <FileSpreadsheet size={14} className="mr-1" />
                  Download CSV
                </a>
              </div>
              <p className="mb-4 text-sm text-white/60">
                Build focused exports using a report type plus optional job/date filters.
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="report-metric"
                    className="text-xs font-medium uppercase tracking-wide text-white/60"
                  >
                    Report type
                  </label>
                  <select
                    id="report-metric"
                    className="card-lifted px-3 py-2 text-sm text-[var(--text)]"
                    value={reportMetric}
                    onChange={(e) => setReportMetric(e.target.value)}
                  >
                    <option value="pipeline">Pipeline conversion</option>
                    <option value="time_to_hire">Time to hire</option>
                    <option value="sources">Source effectiveness</option>
                    <option value="activity">Recent activity</option>
                    <option value="boards">Job board distribution</option>
                    <option value="offer_outcomes">Offer acceptance / drop-off</option>
                    <option value="recruiter_productivity">Recruiter productivity</option>
                    <option value="cost_per_hire">Cost per hire</option>
                    <option value="overview">Overview snapshot</option>
                  </select>
                </div>
                <div className="rounded-xl border border-[var(--border)]/80 bg-[var(--bg-elevated)] p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-white/60">
                    Filter scope
                  </p>
                  <p className="mt-1 text-sm text-[var(--text)]">
                    {jobFilter ? "Single job selected" : "All open jobs"}
                    {" · "}
                    {dateFrom || dateTo ? "Date filtered" : "No date filter"}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--border)]/80 bg-[var(--bg-elevated)] p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-white/60">
                    Suggested reports
                  </p>
                  <p className="mt-1 text-sm text-[var(--text)]">
                    Weekly funnel, monthly offer outcomes, and stage dwell bottlenecks.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {viewMode === "operational" ? (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Time to hire - Bar chart */}
              <div className={REPORT_CARD_CLASS}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="heading-section flex items-center gap-2 text-lg text-[var(--text)]">
                    <BarChart3 size={20} className="text-[var(--accent)]" />
                    Time to hire
                  </h2>
                  <a href={exportHref("time_to_hire")} className={REPORT_EXPORT_LINK_CLASS}>
                    Export CSV
                  </a>
                </div>
                {timeToHire.length === 0 ? (
                  <p className="text-body text-sm text-white/60">No time-to-hire data yet.</p>
                ) : (
                  <div className="h-64 min-h-64 min-w-0 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={timeToHire.slice(0, 6).map((row) => ({
                          name:
                            row.job_title.length > 18
                              ? row.job_title.slice(0, 18) + "…"
                              : row.job_title,
                          days: row.avg_days_to_hire,
                          fullName: row.job_title,
                        }))}
                        margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-[var(--border)]" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                        <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                        <Tooltip
                          cursor={{ fill: "rgba(249, 115, 22, 0.04)" }}
                          content={({ active, payload }) => {
                            const row = payload?.[0]?.payload as
                              | { fullName?: string; days?: number }
                              | undefined;
                            if (!active || !row) return null;
                            return (
                              <ChartTooltipCard
                                title={row.fullName ?? "Job"}
                                rows={[
                                  {
                                    label: "Avg time to hire",
                                    value:
                                      typeof row.days === "number"
                                        ? `${row.days.toFixed(1)} days`
                                        : "—",
                                  },
                                ]}
                              />
                            );
                          }}
                        />
                        <Bar
                          dataKey="days"
                          fill="var(--accent)"
                          radius={[4, 4, 0, 0]}
                          activeBar={{ fill: "#fb923c" }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Candidates by source - Pie chart */}
              <div className={REPORT_CARD_CLASS}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="heading-section flex items-center gap-2 text-lg text-[var(--text)]">
                    <Users size={20} className="text-[var(--accent)]" />
                    Candidates by source
                  </h2>
                  <a href={exportHref("sources")} className={REPORT_EXPORT_LINK_CLASS}>
                    Export CSV
                  </a>
                </div>
                {sources.length === 0 ? (
                  <p className="text-body text-sm text-white/60">No source data yet.</p>
                ) : (
                  <div className="h-64 min-h-64 min-w-0 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={sources.slice(0, 8).map((row, i) => ({
                            name: row.source || "Unknown",
                            value: row.candidate_count,
                          }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                          stroke="none"
                        >
                          {(sources.slice(0, 8) as { source: string }[]).map((_, i) => (
                            <Cell
                              key={i}
                              fill={CHART_COLORS[i % CHART_COLORS.length]}
                              stroke="transparent"
                              strokeWidth={0}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          content={({ active, payload }) => {
                            const row = payload?.[0];
                            if (!active || !row) return null;
                            return (
                              <ChartTooltipCard
                                title={String(row.name ?? "Source")}
                                rows={[
                                  {
                                    label: "Candidates",
                                    value:
                                      typeof row.value === "number"
                                        ? row.value.toLocaleString()
                                        : "—",
                                  },
                                ]}
                              />
                            );
                          }}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div className={REPORT_CARD_CLASS}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="heading-section flex items-center gap-2 text-lg text-[var(--text)]">
                <TrendingUp size={20} className="text-[var(--accent)]" />
                Offer acceptance / drop-off
              </h2>
              <a href={exportHref("offer_outcomes")} className={REPORT_EXPORT_LINK_CLASS}>
                Export CSV
              </a>
            </div>
            {offerOutcomesLoading ? (
              <div className="space-y-3 py-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : !offerOutcomes || offerOutcomes.total_offers === 0 ? (
              <p className="text-body text-sm text-white/60">
                No offer lifecycle data yet. Send offers to start tracking acceptance and drop-off.
              </p>
            ) : (
              <>
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="card-lifted p-3">
                    <p className="text-xs text-white/60">Acceptance rate</p>
                    <p className="text-xl font-semibold text-emerald-400">
                      {formatRate(offerOutcomes.acceptance_rate)}
                    </p>
                  </div>
                  <div className="card-lifted p-3">
                    <p className="text-xs text-white/60">Drop-off rate</p>
                    <p className="text-xl font-semibold text-amber-300">
                      {formatRate(offerOutcomes.drop_off_rate)}
                    </p>
                  </div>
                  <div className="card-lifted p-3">
                    <p className="text-xs text-white/60">Response rate</p>
                    <p className="text-xl font-semibold text-[var(--accent)]">
                      {formatRate(offerOutcomes.response_rate)}
                    </p>
                  </div>
                  <div className="card-lifted p-3">
                    <p className="text-xs text-white/60">Offers sent</p>
                    <p className="text-xl font-semibold text-[var(--text)]">
                      {offerOutcomes.sent_count}
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-white/60">
                        <th className="pb-2 pr-4 font-medium">Metric</th>
                        <th className="pb-2 pr-4 font-medium">Count</th>
                        <th className="pb-2 font-medium">Rate of sent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["Viewed", offerOutcomes.viewed_count],
                        ["Accepted", offerOutcomes.accepted_count],
                        ["Declined", offerOutcomes.declined_count],
                        ["Expired", offerOutcomes.expired_count],
                        ["Awaiting response", offerOutcomes.awaiting_response_count],
                      ].map(([label, count]) => (
                        <tr key={label} className={REPORT_TABLE_ROW_CLASS}>
                          <td className="py-2 pr-4 font-medium">{label}</td>
                          <td className="py-2 pr-4">{count}</td>
                          <td className="py-2">
                            {offerOutcomes.sent_count > 0
                              ? `${((Number(count) / offerOutcomes.sent_count) * 100).toFixed(1)}%`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <div className={REPORT_CARD_CLASS}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="heading-section flex items-center gap-2 text-lg text-[var(--text)]">
                <BarChart3 size={20} className="text-[var(--accent)]" />
                Cost per hire
              </h2>
              <a href={exportHref("cost_per_hire")} className={REPORT_EXPORT_LINK_CLASS}>
                Export CSV
              </a>
            </div>
            {costPerHireLoading ? (
              <div className="space-y-3 py-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : !costPerHire ? (
              <p className="text-body text-sm text-white/60">
                Cost ledger data is not available for this scope.
              </p>
            ) : (
              <>
                {costPerHire.note ? (
                  <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                    {costPerHire.note}
                  </p>
                ) : null}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="card-lifted p-3">
                    <p className="text-xs text-white/60">Total spend</p>
                    <p className="text-lg font-semibold text-[var(--text)]">
                      {formatUsd(costPerHire.total_cost_usd)}
                    </p>
                  </div>
                  <div className="card-lifted p-3">
                    <p className="text-xs text-white/60">Hired count</p>
                    <p className="text-lg font-semibold text-[var(--text)]">
                      {costPerHire.hired_count}
                    </p>
                  </div>
                  <div className="card-lifted p-3">
                    <p className="text-xs text-white/60">Cost per hire</p>
                    <p className="text-lg font-semibold text-[var(--accent)]">
                      {formatUsd(costPerHire.cost_per_hire_usd)}
                    </p>
                  </div>
                  <div className="card-lifted p-3">
                    <p className="text-xs text-white/60">Invoiced vs estimated</p>
                    <p className="text-sm text-[var(--text)]">
                      {formatUsd(costPerHire.invoiced_cost_usd)} invoiced
                      <br />
                      {formatUsd(costPerHire.estimated_cost_usd)} estimated
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className={REPORT_CARD_CLASS}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="heading-section flex items-center gap-2 text-lg text-[var(--text)]">
                <Users size={20} className="text-[var(--accent)]" />
                Recruiter productivity
              </h2>
              <a href={exportHref("recruiter_productivity")} className={REPORT_EXPORT_LINK_CLASS}>
                Export CSV
              </a>
            </div>
            {recruiterProductivityLoading ? (
              <div className="space-y-3 py-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-4/5" />
              </div>
            ) : recruiterRows.length === 0 ? (
              <p className="text-body text-sm text-white/60">
                No recruiter productivity rows for this filter scope.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-white/60">
                      <th className="pb-2 pr-4 font-medium">Recruiter</th>
                      <th className="pb-2 pr-4 font-medium">Jobs owned</th>
                      <th className="pb-2 pr-4 font-medium">Applications in scope</th>
                      <th className="pb-2 pr-4 font-medium">Interviews</th>
                      <th className="pb-2 pr-4 font-medium">Hires</th>
                      <th className="pb-2 font-medium">Close rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recruiterRows.map((row) => (
                      <tr key={row.recruiter_id} className={REPORT_TABLE_ROW_CLASS}>
                        <td className="py-2 pr-4 font-medium text-[var(--text)]">
                          {row.recruiter_name}
                        </td>
                        <td className="py-2 pr-4">{row.jobs_owned}</td>
                        <td className="py-2 pr-4">{row.applications_reviewed}</td>
                        <td className="py-2 pr-4">{row.interviews_scheduled}</td>
                        <td className="py-2 pr-4">{row.hires_closed}</td>
                        <td className="py-2">{formatRate(row.close_rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pipeline funnel bar chart */}
          {pipeline.length > 0 && (
            <div className={REPORT_CARD_CLASS}>
              <h2 className="heading-section mb-4 flex items-center gap-2 text-lg text-[var(--text)]">
                <TrendingUp size={20} className="text-[var(--accent)]" />
                Pipeline funnel
              </h2>
              <div className="h-80 min-h-80 min-w-0 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={pipelineChartData}
                    layout="vertical"
                    margin={{ top: 8, right: 24, left: 90, bottom: 8 }}
                    barCategoryGap="28%"
                  >
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="3 3"
                      className="stroke-[var(--border)]"
                    />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={86}
                      tick={{ fontSize: 11 }}
                      stroke="var(--text-muted)"
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(148, 163, 184, 0.04)" }}
                      content={({ active, payload }) => {
                        const row = payload?.[0]?.payload as
                          | {
                              fullName?: string;
                              applications?: number;
                              shortlisted?: number;
                              hired?: number;
                              remaining?: number;
                            }
                          | undefined;
                        if (!active || !row) return null;
                        return (
                          <ChartTooltipCard
                            title={row.fullName ?? "Job"}
                            rows={[
                              {
                                label: "Applications",
                                value: (row.applications ?? 0).toLocaleString(),
                              },
                              {
                                label: "Shortlisted",
                                value: (row.shortlisted ?? 0).toLocaleString(),
                              },
                              {
                                label: "Hired",
                                value: (row.hired ?? 0).toLocaleString(),
                              },
                              {
                                label: "Other stages",
                                value: (row.remaining ?? 0).toLocaleString(),
                              },
                            ]}
                          />
                        );
                      }}
                    />
                    <Legend
                      formatter={(name) =>
                        name === "remaining"
                          ? "Other stages"
                          : name === "shortlistedOnly"
                            ? "Shortlisted"
                            : "Hired"
                      }
                      wrapperStyle={{ color: "var(--text-muted)" }}
                    />
                    <Bar
                      dataKey="remaining"
                      stackId="pipeline"
                      name="remaining"
                      fill="rgba(148, 163, 184, 0.32)"
                      radius={[0, 4, 4, 0]}
                    />
                    <Bar
                      dataKey="shortlistedOnly"
                      stackId="pipeline"
                      name="shortlistedOnly"
                      fill="#f97316"
                      radius={[0, 4, 4, 0]}
                    />
                    <Bar
                      dataKey="hired"
                      stackId="pipeline"
                      name="hired"
                      fill="#22c55e"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Pipeline conversion */}
          {viewMode === "operational" ? (
            <div className={REPORT_CARD_CLASS}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="heading-section flex items-center gap-2 text-lg text-[var(--text)]">
                  <TrendingUp size={20} className="text-[var(--accent)]" />
                  Pipeline conversion
                </h2>
                <a href={exportHref("pipeline")} className={REPORT_EXPORT_LINK_CLASS}>
                  Export CSV
                </a>
              </div>
              {pipeline.length === 0 ? (
                <p className="text-body text-sm text-white/60">No pipeline data yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[500px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-white/60">
                        <th className="pb-2 pr-4 font-medium">Job</th>
                        <th className="pb-2 pr-4 font-medium">Applications</th>
                        <th className="pb-2 pr-4 font-medium">Viewed</th>
                        <th className="pb-2 pr-4 font-medium">Shortlisted</th>
                        <th className="pb-2 pr-4 font-medium">Hired</th>
                        <th className="pb-2 pr-4 font-medium">Hire rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pipeline.slice(0, 10).map((row, i) => (
                        <tr key={i} className={REPORT_TABLE_ROW_CLASS}>
                          <td className="py-2 pr-4">
                            {row.job_id ? (
                              <Link
                                href={`/recruit/jobs/${row.job_id}`}
                                className="hover:underline"
                              >
                                {row.job_title}
                              </Link>
                            ) : (
                              row.job_title
                            )}
                          </td>
                          <td className="py-2 pr-4">{row.total_applications}</td>
                          <td className="py-2 pr-4">{row.viewed}</td>
                          <td className="py-2 pr-4">{row.shortlisted}</td>
                          <td className="py-2 pr-4">{row.hired}</td>
                          <td className="py-2 pr-4 font-medium text-[var(--accent)]">
                            {row.hire_rate_pct != null ? `${row.hire_rate_pct}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}

          {/* Job Board Performance */}
          {viewMode === "operational" ? (
            <div className={REPORT_CARD_CLASS}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="heading-section flex items-center gap-2 text-lg text-[var(--text)]">
                  <Globe size={20} className="text-[var(--accent)]" />
                  Job Board Distribution
                </h2>
                <a href={exportHref("boards")} className={REPORT_EXPORT_LINK_CLASS}>
                  Export CSV
                </a>
              </div>
              {boards.length === 0 ? (
                <p className="text-body text-sm text-white/60">
                  No job board distributions yet. Configure Adzuna or Indeed in Settings to start
                  posting jobs to external boards.
                </p>
              ) : (
                <>
                  <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {boards.map((b) => (
                      <div
                        key={b.board}
                        className="card-lifted p-4 transition-colors duration-150 hover:border-[var(--accent)]/20 hover:bg-white/[0.04]"
                      >
                        <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
                          {b.board}
                        </p>
                        <div className="mt-2 flex items-baseline gap-3">
                          <span className="text-2xl font-bold text-[var(--accent)]">
                            {b.active}
                          </span>
                          <span className="text-xs text-white/60">active</span>
                        </div>
                        <div className="mt-2 flex gap-3 text-xs text-white/60">
                          <span>{b.pushed} pushed</span>
                          <span>{b.removed} removed</span>
                          {b.failed > 0 && <span className="text-red-400">{b.failed} failed</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  {distributions.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[500px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border)] text-white/60">
                            <th className="pb-2 pr-4 font-medium">Job</th>
                            <th className="pb-2 pr-4 font-medium">Board</th>
                            <th className="pb-2 pr-4 font-medium">Status</th>
                            <th className="pb-2 pr-4 font-medium">Pushed</th>
                          </tr>
                        </thead>
                        <tbody>
                          {distributions.slice(0, 15).map((d) => (
                            <tr key={d.id} className={REPORT_TABLE_ROW_CLASS}>
                              <td className="py-2 pr-4">{d.jobTitle}</td>
                              <td className="py-2 pr-4 capitalize">{d.board}</td>
                              <td className="py-2 pr-4">
                                <StatusBadge tone={getDistributionStatusTone(d.status)} size="sm">
                                  {d.status}
                                </StatusBadge>
                              </td>
                              <td className="py-2 pr-4 text-white/60">
                                {d.pushedAt
                                  ? new Date(d.pushedAt).toLocaleDateString("en-GB", {
                                      day: "numeric",
                                      month: "short",
                                    })
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
