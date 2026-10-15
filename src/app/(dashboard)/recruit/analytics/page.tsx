"use client";

import Link from "next/link";

import { useMemo, useState } from "react";
import {
  computeTimeMetrics,
  computeJobTable,
  computeScoreBands,
  type TimingRow,
} from "@/lib/v2/analytics";
import { TimingCards, ScoreDistribution, JobTable } from "./JobPerformance";
import { TalentMetricsGrid } from "./TalentMetrics";
import { Trends } from "./Trends";
import { ByJobDepth } from "./ByJobDepth";
import { Quality } from "./Quality";
import { SourceTable } from "./SourceTable";
import { PeriodPicker } from "./PeriodPicker";
import { Fairness } from "./Fairness";
import { Overview } from "./Overview";
import { useAnalyticsRows } from "./useAnalyticsRows";
import { useV1Analytics } from "./useV1Analytics";
import { resolvePeriod, resolveCustomPeriod, type PeriodKey } from "@/lib/v2/period";
import { periodParams } from "@/lib/v2/analytics-fusion";
import type { AnalyticsRollup } from "@/lib/v2/analytics-rollup";
import { fuseJobTable } from "@/lib/v2/analytics-jobs";
import { FunnelBars } from "./FunnelBars";
import { Bar } from "./Bar";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Skeleton } from "@/components/ui/Skeleton";
import { computeFunnel, computeRejectMix, computeSourceOfHire } from "@/lib/v2/analytics";
import { REJECT_REASONS } from "@/lib/v2/review-queue";

/**
 * Analytics — org overview, funnel conversion, source of hire, and the
 * fairness view. Every number derives from application rows, so the dashboard
 * and the lists behind it cannot disagree.
 */
import { REASON_LABEL, Stat, TABS, type Row, type Tab } from "./analytics-shell";

export default function RecruitV2AnalyticsPage() {
  const { user } = useAuth();
  // The analytics endpoints scope a hiring manager to jobs they own, and return
  // empty arrays when they own none. Rendering that as "No applications yet" or
  // "No recruiters on record for this org" states something false about the
  // ORGANISATION when the truth is only about this viewer's scope.
  const isHiringManager = user?.role === "hiring_manager";
  const [tab, setTab] = useState<Tab>("Org overview");
  const [periodKey, setPeriodKey] = useState<PeriodKey>("this_fy");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const period = useMemo(
    () =>
      periodKey === "custom"
        ? resolveCustomPeriod(customFrom, customTo, Date.now())
        : resolvePeriod(periodKey, Date.now()),
    [periodKey, customFrom, customTo],
  );
  const v1 = useV1Analytics(period);

  // Was `/api/applications?limit=100` — a route that hard-caps `limit` at 100 —
  // so the funnel, source-of-hire table, reject mix, score bands, the by-job
  // table and time-to-decision below were each computed over whatever hundred
  // rows came back first and then labelled as the organisation's. The rollup
  // pages to the end of the period, and reports when it could not.
  const { data, loading } = useApiQuery<AnalyticsRollup>(
    "/api/analytics/rollup",
    periodParams(period),
  );
  // A period that reaches these numbers as well as the v1 ones. Until now the
  // picker moved the server-side reports while every client-derived figure
  // beside them stayed on all-time, so the two halves of the screen described
  // different windows.
  const rows: Row[] = useMemo(
    () =>
      (data?.rows ?? []).map((r) => ({
        status: r.status,
        source: r.source,
        rejection_reason: r.rejectionReason,
        job_id: r.jobId,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
        offer_accepted_at: r.offerAcceptedAt,
        // Titles and job creation dates are sent once and rejoined here rather
        // than repeated on every application row.
        jobs: data?.jobs?.[r.jobId]
          ? {
              title: data.jobs[r.jobId].title,
              created_at: data.jobs[r.jobId].createdAt,
            }
          : null,
        fit_scores: r.score === null ? null : { overall_score: r.score },
      })),
    [data],
  );
  const complete = data?.complete ?? true;

  // Same source data, richer shape — timing, per-job and score distribution.
  const timingRows: TimingRow[] = useMemo(
    () =>
      rows.map((a) => ({
        jobId: a.job_id ?? "",
        jobTitle: a.jobs?.title ?? "",
        status: a.status ?? "applied",
        score: a.fit_scores?.overall_score ?? null,
        createdAt: a.created_at ?? null,
        // Approximation, stated on screen: applications carry no decided_at
        // column and no status-change history exists, so the last update is
        // the closest available proxy for when the decision was taken.
        decidedAt:
          a.status === "shortlisted" || a.status === "rejected" || a.status === "hired"
            ? (a.updated_at ?? a.created_at ?? null)
            : null,
      })),
    [rows],
  );
  const timing = useMemo(() => computeTimeMetrics(timingRows), [timingRows]);
  const jobRows = useMemo(() => computeJobTable(timingRows), [timingRows]);
  const bands = useMemo(() => computeScoreBands(timingRows), [timingRows]);

  const { trendRows, diagRows, qualityRows, fusedJobs } = useAnalyticsRows(rows, v1);
  // Counted server-side with `head: true`. Deriving it from the rows counts jobs
  // that RECEIVED an application in the period, which is a different question
  // from how many roles are open — and it is the denominator under fill rate.
  const openJobCount = data?.openJobCount ?? 0;
  const funnel = useMemo(
    () => computeFunnel(rows.map((r) => ({ status: r.status ?? "applied" }))),
    [rows],
  );
  const sources = useMemo(
    () =>
      computeSourceOfHire(
        rows.map((r) => ({ source: r.source ?? null, status: r.status ?? "applied" })),
      ),
    [rows],
  );
  const rejects = useMemo(
    () => computeRejectMix(rows.filter((r) => r.status === "rejected")),
    [rows],
  );

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold text-[var(--text)]">Analytics</h1>
        {/* The nav now lands here rather than on the old report. Until this has
            soaked, the previous one stays one click away — a migration that
            removes the fallback on day one has nowhere to go when something is
            missing. */}
        <Link
          href="/recruit/analytics/legacy"
          className="text-[11px] text-white/35 hover:text-white/70"
        >
          Previous report →
        </Link>
      </div>
      <p className="mb-4 text-sm text-white/55">
        {loading || v1.loading
          ? "Loading…"
          : isHiringManager
            ? `${period.label} · scoped to the jobs you own — org-wide figures are restricted for hiring managers`
            : `${period.label} · org-wide reports over every one of the ${rows.length} application${rows.length === 1 ? "" : "s"} in this period`}
      </p>

      {!loading && !complete ? (
        <div className="mb-3 rounded-xl border border-amber-400/25 bg-amber-500/[0.05] px-4 py-3 text-[12px] leading-relaxed text-amber-200/80">
          This period holds more applications than one report reads at a time, so every count and
          rate below is computed over the first {rows.length.toLocaleString()} and is a floor, not a
          total. Narrow the period to get exact figures.
        </div>
      ) : null}

      {isHiringManager && v1.pipeline.length === 0 && !v1.loading ? (
        <div className="mb-3 rounded-xl border border-amber-400/25 bg-amber-500/[0.05] px-4 py-3 text-[12px] leading-relaxed text-amber-200/80">
          You do not own any jobs in this period, so there is nothing scoped to you to report. These
          blanks describe your scope, not the organisation — a recruiter or head of talent will see
          the org-wide figures.
        </div>
      ) : null}

      <div className="mb-3">
        <PeriodPicker
          value={periodKey}
          onChange={setPeriodKey}
          from={customFrom}
          to={customTo}
          onFrom={setCustomFrom}
          onTo={setCustomTo}
          invalid={periodKey === "custom" && period.key !== "custom"}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              tab === t
                ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                : "border-[var(--border)] text-white/60"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : tab === "Org overview" ? (
        <Overview
          v1={v1}
          period={period}
          funnel={funnel}
          sources={sources}
          rollupRows={data?.rows ?? []}
          jobs={data?.jobs ?? {}}
          openJobCount={data?.openJobCount ?? null}
          seatScope={isHiringManager ? "own-jobs" : "org"}
        />
      ) : tab === "Trends" ? (
        <Trends rows={trendRows} />
      ) : tab === "By job" ? (
        <div className="space-y-3">
          <ByJobDepth rows={diagRows} fused={fusedJobs} />
          <FunnelBars funnel={funnel} />
        </div>
      ) : (
        <>
          <Quality rows={qualityRows} totalJobs={openJobCount} />
          <Fairness rejects={rejects} />
        </>
      )}
    </section>
  );
}
