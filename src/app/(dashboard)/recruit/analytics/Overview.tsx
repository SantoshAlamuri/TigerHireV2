"use client";

import { TalentMetricsGrid } from "./TalentMetrics";
import { SourceTable } from "./SourceTable";
import { SectionLabel, FunnelRow, Insight } from "./Chrome";
import { funnelIsMonotonic } from "@/lib/v2/viz";
import type { V1Analytics } from "./useV1Analytics";
import type { Period } from "@/lib/v2/period";
import type { RollupRow, RollupJob } from "@/lib/v2/analytics-rollup";

/**
 * Overview: the headline metric set, the stage counts, and source performance.
 *
 * The stage counts below the headline come from the org-wide pipeline report,
 * not from the applications this page happened to load. An earlier version read
 * "Applied 100" — which was the page limit, not the number of applicants.
 */
export function Overview({
  v1,
  period,
  funnel,
  sources,
  rollupRows,
  jobs,
  openJobCount,
  seatScope = "org",
}: {
  v1: V1Analytics;
  period: Period;
  seatScope?: "org" | "own-jobs";
  funnel: { applied: number; shortlisted: number; hired: number; reviewed: number };
  sources: { source: string; applicants: number; hires: number; conversion: number }[];
  /** Every application in the period, not a first page — see analytics-rollup. */
  rollupRows: RollupRow[];
  jobs: Record<string, RollupJob>;
  openJobCount: number | null;
}) {
  // Server totals across every job, so this cannot disagree with the By-job tab.
  const total = v1.pipeline.reduce<{
    applied: number;
    reviewed: number;
    shortlisted: number;
    hired: number;
  }>(
    (acc, p) => ({
      applied: acc.applied + (p.total_applications ?? 0),
      reviewed: acc.reviewed + (p.viewed ?? 0),
      shortlisted: acc.shortlisted + (p.shortlisted ?? 0),
      hired: acc.hired + (p.hired ?? 0),
    }),
    { applied: 0, reviewed: 0, shortlisted: 0, hired: 0 },
  );
  const usingServer = v1.pipeline.length > 0;
  const f = usingServer ? total : funnel;
  const monotonic = funnelIsMonotonic([f.applied, f.reviewed, f.shortlisted, f.hired]);
  const pct = (n: number) =>
    f.applied > 0 ? `${Math.round((n / f.applied) * 100)}% of applicants` : "—";

  return (
    <>
      <TalentMetricsGrid
        v1={v1}
        period={period}
        seatScope={seatScope}
        rows={rollupRows}
        jobs={jobs}
        openJobCount={openJobCount}
      />

      <SectionLabel hint={usingServer ? "org-wide totals" : "counted from application rows"}>
        Funnel
      </SectionLabel>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/30 px-4 py-3">
        <FunnelRow label="Applied" value={f.applied} max={f.applied} step={0} hint="all sources" />
        <FunnelRow
          label="Reviewed"
          value={f.reviewed}
          max={f.applied}
          step={1}
          hint={`${f.applied - f.reviewed} untouched`}
        />
        <FunnelRow
          label="Shortlisted"
          value={f.shortlisted}
          max={f.applied}
          step={2}
          hint={pct(f.shortlisted)}
        />
        <FunnelRow label="Hired" value={f.hired} max={f.applied} step={4} hint={pct(f.hired)} />
        {!monotonic ? (
          <p
            className="mt-2 border-t border-[var(--border)] pt-2 text-[11px]"
            style={{ color: "#fab219" }}
          >
            A later stage holds more people than an earlier one, so these counts came from different
            populations — read the shape with care rather than as a conversion rate.
          </p>
        ) : null}
      </div>

      <SectionLabel>Source performance</SectionLabel>
      <SourceTable rows={sources} />
    </>
  );
}
