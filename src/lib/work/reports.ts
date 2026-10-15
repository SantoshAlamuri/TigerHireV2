/**
 * Reports for the work-driven UI.
 *
 * Built on the same rollup and the same derivations as the analytics page, so
 * the two can never disagree; this file only shapes them for a calmer screen.
 */
import {
  computeFunnel,
  computeJobTable,
  computeRejectMix,
  computeScoreBands,
  computeSourceOfHire,
  computeTimeMetrics,
  type Funnel,
  type JobTableRow,
  type RejectMix,
  type ScoreBands,
  type SourceOfHire,
  type TimeMetrics,
  type TimingRow,
} from "@/lib/v2/analytics";
import type { RollupJob, RollupRow } from "@/lib/v2/analytics-rollup";
import { REJECT_REASONS } from "@/lib/v2/review-queue";

export const REPORT_PERIODS = [
  { key: "this_month", name: "This month" },
  { key: "this_quarter", name: "This quarter" },
  { key: "this_fy", name: "This financial year" },
  { key: "rolling_12", name: "Last 12 months" },
  { key: "all_time", name: "All time" },
] as const;

export type ReportPeriodKey = (typeof REPORT_PERIODS)[number]["key"];

export interface Report {
  applications: number;
  funnel: Funnel;
  timing: TimeMetrics;
  sources: SourceOfHire[];
  jobs: (JobTableRow & { waiting: number })[];
  scores: ScoreBands;
  rejects: (RejectMix["rows"][number] & { label: string })[];
  rejectsTotal: number;
  rejectCoverage: number;
  screened: number;
}

const DECIDED = new Set(["shortlisted", "rejected", "hired"]);

const REASON_LABEL: Record<string, string> = {
  ...Object.fromEntries(REJECT_REASONS.map((r) => [r.id, r.label])),
  unspecified: "No reason recorded",
};

/** Plain words for the sources applications arrive from. */
export function sourceName(source: string): string {
  const s = source.trim().toLowerCase();
  const known: Record<string, string> = {
    unknown: "Not recorded",
    linkedin: "LinkedIn",
    naukri: "Naukri",
    referral: "Referrals",
    careers_page: "Careers page",
    career_page: "Careers page",
    whatsapp: "WhatsApp",
    agency: "Agencies",
    direct: "Direct",
    upload: "Uploaded by recruiter",
    manual: "Added by recruiter",
  };
  return known[s] ?? s.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function buildReport(rows: RollupRow[], jobs: Record<string, RollupJob>): Report {
  const timingRows: TimingRow[] = rows.map((r) => ({
    jobId: r.jobId,
    jobTitle: jobs[r.jobId]?.title ?? "Untitled job",
    status: r.status ?? "applied",
    score: r.score,
    createdAt: r.createdAt,
    // Applications carry no decided_at, so the last update stands in for it,
    // exactly as the analytics page does.
    decidedAt: DECIDED.has(r.status ?? "") ? (r.updatedAt ?? r.createdAt) : null,
  }));

  const waitingByJob = new Map<string, number>();
  for (const r of rows) {
    const s = r.status ?? "applied";
    if (!DECIDED.has(s) && s !== "withdrawn")
      waitingByJob.set(r.jobId, (waitingByJob.get(r.jobId) ?? 0) + 1);
  }

  const mix = computeRejectMix(
    rows
      .filter((r) => r.status === "rejected")
      .map((r) => ({ rejection_reason: r.rejectionReason })),
  );

  return {
    applications: rows.length,
    funnel: computeFunnel(rows.map((r) => ({ status: r.status ?? "applied" }))),
    timing: computeTimeMetrics(timingRows),
    sources: computeSourceOfHire(
      rows.map((r) => ({ source: r.source, status: r.status ?? "applied" })),
    ),
    jobs: computeJobTable(timingRows)
      .map((j) => ({ ...j, waiting: waitingByJob.get(j.jobId) ?? 0 }))
      .sort((a, b) => b.applicants - a.applicants),
    scores: computeScoreBands(timingRows),
    rejects: mix.rows.map((r) => ({ ...r, label: REASON_LABEL[r.reason] ?? r.reason })),
    rejectsTotal: mix.total,
    rejectCoverage: mix.coveragePercent,
    screened: rows.filter((r) => r.screened).length,
  };
}

/** Width for a bar, as a share of the largest value, never zero-width for a real count. */
export function barWidth(value: number, max: number): string {
  if (max <= 0 || value <= 0) return "0%";
  return `${Math.max(2, Math.round((value / max) * 100))}%`;
}
