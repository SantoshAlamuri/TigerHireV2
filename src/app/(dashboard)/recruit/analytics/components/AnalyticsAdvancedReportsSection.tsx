"use client";

import Link from "next/link";
import { type Dispatch, type SetStateAction } from "react";
import { Activity, BarChart3, Filter, Loader2, Timer } from "lucide-react";
import {
  combineApplicationFunnelRows,
  type ApplicationSourceRow,
} from "@/lib/analytics/application-funnel";
import { Skeleton } from "@/components/ui/Skeleton";
import { QualityOfHireSection } from "./QualityOfHireSection";

type FunnelSummary = ReturnType<typeof combineApplicationFunnelRows>;

type JobsListResponse = {
  jobs: { id: string; title?: string | null }[];
};

type FunnelPayload = {
  sources: ApplicationSourceRow[];
  generatedAt: string;
};

type StageDwellRow = {
  job_id: string;
  job_title: string;
  to_stage: string;
  median_days: number | null;
  p90_days: number | null;
  avg_days: number | null;
  candidate_count: number;
  sample_size: number;
};

type ActivityRow = {
  job_id?: string | null;
  event_type: string;
  event_detail: string;
  job_title: string | null;
  event_at: string;
};

export function AnalyticsAdvancedReportsSection(props: {
  reportCardClass: string;
  reportTableRowClass: string;
  reportActivityRowClass: string;
  reportExportLinkClass: string;
  /** When false, only filters + application funnel render (Executive view). */
  showExtendedReports?: boolean;
  analyticsDateRangeInvalid: boolean;
  jobFilter: string;
  setJobFilter: Dispatch<SetStateAction<string>>;
  dateFrom: string;
  setDateFrom: Dispatch<SetStateAction<string>>;
  dateTo: string;
  setDateTo: Dispatch<SetStateAction<string>>;
  jobsForFilter: JobsListResponse | null | undefined;
  funnelLoading: boolean;
  funnelSummary: FunnelSummary | null;
  funnelData: FunnelPayload | null | undefined;
  dwellLoading: boolean;
  dwellRowsSorted: StageDwellRow[];
  medianSortDesc: boolean;
  setMedianSortDesc: Dispatch<SetStateAction<boolean>>;
  dwellGeneratedAt?: string;
  activity: ActivityRow[];
  exportHref: (metric: string) => string;
}) {
  const {
    reportCardClass,
    reportTableRowClass,
    reportActivityRowClass,
    reportExportLinkClass,
    showExtendedReports = true,
    analyticsDateRangeInvalid,
    jobFilter,
    setJobFilter,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    jobsForFilter,
    funnelLoading,
    funnelSummary,
    funnelData,
    dwellLoading,
    dwellRowsSorted,
    medianSortDesc,
    setMedianSortDesc,
    dwellGeneratedAt,
    activity,
    exportHref,
  } = props;

  return (
    <>
      <div className={reportCardClass}>
        <div className="mb-3 flex items-center gap-2 text-[var(--text)]">
          <Filter size={18} className="text-[var(--accent)]" />
          <h2 className="heading-section text-lg">Analytics filters</h2>
        </div>
        <p className="mb-4 text-xs text-white/60">
          Applies to pipeline charts, offer outcomes, recruiter productivity, and the reports below.
          Date range filters applications by <span className="font-medium">submitted at</span>{" "}
          (funnel) and stage transitions by <span className="font-medium">entered at</span> (dwell).
        </p>
        {analyticsDateRangeInvalid && (
          <p
            className="mb-4 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
            role="alert"
          >
            &quot;From&quot; must be on or before &quot;To&quot;. Funnel and dwell requests are
            paused until the range is valid (API returns 400 if both dates are set in reverse
            order).
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="analytics-job-filter" className="text-xs font-medium text-white/60">
              Job
            </label>
            <select
              id="analytics-job-filter"
              className="card-lifted px-3 py-2 text-sm text-[var(--text)]"
              value={jobFilter}
              onChange={(e) => setJobFilter(e.target.value)}
            >
              <option value="">All open jobs</option>
              {(jobsForFilter?.jobs ?? []).map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title ?? job.id}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="analytics-date-from" className="text-xs font-medium text-white/60">
              From (applications / dwell)
            </label>
            <input
              id="analytics-date-from"
              type="date"
              className="card-lifted px-3 py-2 text-sm text-[var(--text)]"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="analytics-date-to" className="text-xs font-medium text-white/60">
              To (applications / dwell)
            </label>
            <input
              id="analytics-date-to"
              type="date"
              className="card-lifted px-3 py-2 text-sm text-[var(--text)]"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className={reportCardClass}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
          01 · Funnel — where candidates drop off
        </p>
        <h2 className="heading-section mb-2 flex items-center gap-2 text-lg text-[var(--text)]">
          <BarChart3 size={20} className="text-[var(--accent)]" />
          Application funnel
        </h2>
        <p className="mb-4 text-xs text-white/60">
          Stage reach is derived from canonical stage ranking of pipeline transition names, so
          custom stage names (e.g. &quot;Technical Round&quot;, &quot;Proposal&quot;) still count —
          and reaching a later stage implies all earlier ones. Generated{" "}
          {funnelData?.generatedAt
            ? new Date(funnelData.generatedAt).toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
          .
        </p>
        {funnelLoading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        ) : analyticsDateRangeInvalid ? (
          <p className="text-body text-sm text-white/60">
            Correct the date range in Analytics filters to load funnel data.
          </p>
        ) : !funnelSummary || funnelSummary.applied_count === 0 ? (
          <p className="text-body text-sm text-white/60">
            No applications in this scope yet. Adjust filters or open jobs to collect funnel data.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-white/60">
                    <th className="pb-2 pr-4 font-medium">Stage</th>
                    <th className="pb-2 pr-4 font-medium">Count</th>
                    <th className="pb-2 font-medium">% of applied</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["Applied", funnelSummary.applied_count],
                      ["Screened", funnelSummary.screened_count],
                      ["Shortlisted", funnelSummary.shortlisted_count],
                      ["Interviewed", funnelSummary.interviewed_count],
                      ["Offered", funnelSummary.offered_count],
                      ["Hired", funnelSummary.hired_count],
                    ] as const
                  ).map(([label, count]) => (
                    <tr key={label} className={reportTableRowClass}>
                      <td className="py-2 pr-4 font-medium text-[var(--text)]">{label}</td>
                      <td className="py-2 pr-4">{count}</td>
                      <td className="py-2">
                        {funnelSummary.applied_count > 0
                          ? `${((count / funnelSummary.applied_count) * 100).toFixed(1)}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-white/60">
              Also in scope:{" "}
              <span className="font-medium text-white/60">
                {funnelSummary.withdrawn_count} withdrawn
              </span>
              ,{" "}
              <span className="font-medium text-white/60">
                {funnelSummary.rejected_count} rejected
              </span>
              {funnelSummary.conversion_rate != null ? (
                <>
                  {" "}
                  · Overall hire rate (hired ÷ applied):{" "}
                  <span className="font-medium text-[var(--accent)]">
                    {(funnelSummary.conversion_rate * 100).toFixed(1)}%
                  </span>
                </>
              ) : null}
            </p>
            {(funnelData?.sources?.length ?? 0) > 0 && (
              <details className="mt-6 border-t border-[var(--border)]/80 pt-5">
                <summary className="mb-3 cursor-pointer select-none text-sm font-semibold text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35">
                  View data — source quality (hire rate by channel)
                </summary>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-white/60">
                        <th className="pb-2 pr-4 font-medium">Source</th>
                        <th className="pb-2 pr-4 font-medium">Applications</th>
                        <th className="pb-2 pr-4 font-medium">Hired</th>
                        <th className="pb-2 font-medium">Hire rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...(funnelData?.sources ?? [])]
                        .sort((a, b) => (b.conversion_rate ?? 0) - (a.conversion_rate ?? 0))
                        .map((source) => (
                          <tr key={source.source} className={reportTableRowClass}>
                            <td className="py-2 pr-4 capitalize">{source.source}</td>
                            <td className="py-2 pr-4">{source.count}</td>
                            <td className="py-2 pr-4">{source.hired_count}</td>
                            <td className="py-2 font-medium text-[var(--accent)]">
                              {source.conversion_rate != null
                                ? `${(source.conversion_rate * 100).toFixed(1)}%`
                                : "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </>
        )}
      </div>

      {showExtendedReports ? (
        <>
          <div className={reportCardClass}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
              03 · Speed — where the process slows down
            </p>
            <h2 className="heading-section mb-4 flex items-center gap-2 text-lg text-[var(--text)]">
              <Timer size={20} className="text-[var(--accent)]" />
              Time in stage
            </h2>
            <p className="mb-3 text-xs text-white/60">
              Median, p90, and average days spent in each stage after a move, for candidates who
              have since moved again (completed dwell). Generated{" "}
              {dwellGeneratedAt
                ? new Date(dwellGeneratedAt).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}
              .
            </p>
            {dwellLoading ? (
              <div className="space-y-3 py-2">
                <Skeleton className="h-8 w-2/5" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-4/5" />
              </div>
            ) : analyticsDateRangeInvalid ? (
              <p className="text-body text-sm text-white/60">
                Correct the date range in Analytics filters to load dwell data.
              </p>
            ) : dwellRowsSorted.length === 0 ? (
              <p className="text-body text-sm text-white/60">
                No stage dwell samples yet. Moves are logged automatically when you change pipeline
                stages.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-white/60">
                      <th className="pb-2 pr-4 font-medium">Job</th>
                      <th className="pb-2 pr-4 font-medium">Stage</th>
                      <th className="pb-2 pr-4 font-medium">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-medium text-[var(--accent)] hover:underline"
                          onClick={() => setMedianSortDesc((d) => !d)}
                        >
                          Median (days)
                          <span className="text-white/60" aria-hidden>
                            {medianSortDesc ? "↓" : "↑"}
                          </span>
                        </button>
                      </th>
                      <th className="pb-2 pr-4 font-medium">p90 (days)</th>
                      <th className="pb-2 pr-4 font-medium">Avg (days)</th>
                      <th className="pb-2 pr-4 font-medium">Candidates</th>
                      <th className="pb-2 font-medium text-white/60">Samples</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dwellRowsSorted.map((row, i) => (
                      <tr
                        key={`${row.job_id}-${row.to_stage}-${i}`}
                        className={reportTableRowClass}
                      >
                        <td className="py-2 pr-4">
                          <Link href={`/recruit/jobs/${row.job_id}`} className="hover:underline">
                            {row.job_title}
                          </Link>
                        </td>
                        <td className="py-2 pr-4">{row.to_stage}</td>
                        <td className="py-2 pr-4 font-medium text-[var(--accent)]">
                          {row.median_days != null ? row.median_days : "—"}
                        </td>
                        <td className="py-2 pr-4">{row.p90_days != null ? row.p90_days : "—"}</td>
                        <td className="py-2 pr-4">{row.avg_days != null ? row.avg_days : "—"}</td>
                        <td className="py-2 pr-4">{row.candidate_count}</td>
                        <td className="py-2 text-white/60">{row.sample_size}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className={reportCardClass}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                  04 · Activity — what just happened
                </p>
                <h2 className="heading-section flex items-center gap-2 text-lg text-[var(--text)]">
                  <Activity size={20} className="text-[var(--accent)]" />
                  Recent activity
                </h2>
              </div>
              <a href={exportHref("activity")} className={reportExportLinkClass}>
                Export CSV
              </a>
            </div>
            {activity.length === 0 ? (
              <p className="text-body text-sm text-white/60">No recent activity.</p>
            ) : (
              <ul className="space-y-2">
                {activity.slice(0, 20).map((row, i) => (
                  <li key={i} className={reportActivityRowClass}>
                    <span className="font-medium text-[var(--accent)]">{row.event_type}</span>
                    <span className="text-white/60">{row.event_detail}</span>
                    {row.job_title && row.job_id ? (
                      <Link
                        href={`/recruit/jobs/${row.job_id}`}
                        className="text-white/60 hover:underline"
                      >
                        · {row.job_title}
                      </Link>
                    ) : row.job_title ? (
                      <span className="text-white/60">· {row.job_title}</span>
                    ) : null}
                    <span className="ml-auto text-xs text-white/60">
                      {new Date(row.event_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <QualityOfHireSection
            reportCardClass={reportCardClass}
            reportTableRowClass={reportTableRowClass}
            jobFilter={jobFilter}
          />
        </>
      ) : null}
    </>
  );
}
