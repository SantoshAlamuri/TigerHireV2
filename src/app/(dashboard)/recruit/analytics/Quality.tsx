"use client";

import { useMemo } from "react";
import { qualityChecks } from "@/lib/v2/analytics-diagnostics";
import { useApiQuery } from "@/lib/hooks/use-api";
import {
  fuseQuality,
  type QualityByJob,
  type PulseByJob,
  type ValidityBand,
} from "@/lib/v2/quality-fusion";
import { talentMetrics, type Metric } from "@/lib/v2/ta-metrics";

/**
 * Quality — the four outcome metrics, and a checklist of what has to be true
 * before any of them can be believed.
 *
 * The checklist matters more than the metrics right now. Every one of the four
 * is unmeasurable until post-hire outcomes are collected, and a screen of four
 * dashes with no explanation reads as broken. The checks name what is missing
 * and what would have to happen to fill each one in.
 */
export interface QualityRow {
  status: string;
  createdAt: string | null;
  hiredAt: string | null;
  hasScore: boolean;
}

function Tile({ m }: { m: Metric }) {
  const missing = m.value === null;
  return (
    <div className="bg-[var(--sunk,var(--surface))] px-4 py-3">
      <div className="text-[9.5px] font-medium uppercase tracking-wider text-white/40">
        {m.label}
      </div>
      <div
        className={`font-mono text-2xl font-semibold tabular-nums ${
          missing ? "text-white/25" : "text-[var(--text)]"
        }`}
      >
        {missing ? "—" : m.value}
        {!missing && m.unit ? (
          <span className="ml-0.5 text-xs font-medium text-white/35">{m.unit}</span>
        ) : null}
      </div>
      <div className={`mt-0.5 text-[11px] ${missing ? "text-white/30" : "text-white/50"}`}>
        {m.note}
      </div>
    </div>
  );
}

const DOT: Record<string, string> = {
  pass: "bg-emerald-400",
  fail: "bg-amber-400",
  unknown: "bg-white/25",
};

export function Quality({ rows, totalJobs }: { rows: QualityRow[]; totalJobs: number }) {
  // The server already computes all four of these from quality_of_hire_by_job,
  // post_hire_pulse_by_job and fitscore_predictive_validity. They were rendering
  // a hardcoded null with a caption blaming missing data.
  const { data: qoh } = useApiQuery<{
    qualityByJob: QualityByJob[];
    pulseByJob: PulseByJob[];
    predictiveValidity: ValidityBand[];
  }>("/api/analytics/quality-of-hire");
  const fused = useMemo(
    () =>
      fuseQuality(qoh?.qualityByJob ?? [], qoh?.pulseByJob ?? [], qoh?.predictiveValidity ?? []),
    [qoh],
  );
  const m = useMemo(
    () =>
      talentMetrics({
        applications: rows.map((r) => ({
          status: r.status,
          createdAt: r.createdAt,
          hiredAt: r.hiredAt,
          jobCreatedAt: null,
          source: null,
        })),
        offers: [],
        openJobs: totalJobs,
        recruiters: 0,
        screeningAnswered: 0,
        screeningSent: 0,
        spend: null,
        retained: null,
        hmRatings: [],
      }),
    [rows, totalJobs],
  );

  const hires = rows.filter((r) => r.status === "hired" || r.hiredAt);
  const checks = useMemo(
    () =>
      qualityChecks({
        hires: hires.length,
        scoredHires: hires.filter((h) => h.hasScore).length,
        pulseResponses: (qoh?.pulseByJob ?? []).reduce((n, r) => n + (r.pulses_responded ?? 0), 0),
        // Rubric state is not on the applications payload. null says "not
        // checked" without claiming the org has no jobs.
        rubricJobs: null,
        totalJobs,
      }),
    [hires, totalJobs],
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-px overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-4">
        <Tile m={fused.qualityOfHire} />
        <Tile m={fused.retention90} />
        <Tile m={fused.hmSatisfaction} />
        <Tile m={fused.fitScoreValidity} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
        <table className="w-full min-w-[520px]">
          <thead>
            <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-white/40">
              <th className="px-4 py-2 text-left font-medium">Check</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((c) => (
              <tr key={c.check} className="border-b border-white/5 last:border-b-0">
                <td className="px-4 py-2 text-sm text-[var(--text)]">{c.check}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 text-xs capitalize text-white/70">
                    <span className={`h-1.5 w-1.5 rounded-full ${DOT[c.status]}`} />
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-white/50">{c.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
