"use client";

import { Award, HeartPulse, Loader2, TrendingUp } from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { Skeleton } from "@/components/ui/Skeleton";

type QualityByJobRow = {
  job_id: string;
  job_title: string | null;
  hires_count: number;
  avg_performance_rating: number | null;
  rated_count: number;
  retained_6m_count: number;
  retention_6m_known: number;
  retained_12m_count: number;
  retention_12m_known: number;
  avg_hire_fitscore: number | null;
};

type PulseByJobRow = {
  job_id: string;
  job_title: string | null;
  pulses_tracked: number;
  pulses_responded: number;
  left_count: number;
  avg_pulse_score: number | null;
};

type PredictiveValidityRow = {
  fitscore_band: string;
  hires: number;
  avg_performance_rating: number | null;
  retention_6m_rate: number | null;
};

type QoHResponse = {
  qualityByJob: QualityByJobRow[];
  pulseByJob: PulseByJobRow[];
  predictiveValidity: PredictiveValidityRow[];
  generatedAt: string;
};

const num = (v: number | null | undefined, digits = 1) =>
  v == null || Number.isNaN(v) ? "—" : Number(v).toFixed(digits);

const pct = (numer: number, denom: number) =>
  denom > 0 ? `${((numer / denom) * 100).toFixed(0)}%` : "—";

export function QualityOfHireSection(props: {
  reportCardClass: string;
  reportTableRowClass: string;
  jobFilter: string;
}) {
  const { reportCardClass, reportTableRowClass, jobFilter } = props;
  const { data, loading } = useApiQuery<QoHResponse>(
    "/api/analytics/quality-of-hire",
    jobFilter ? { jobId: jobFilter } : {},
  );

  const qualityByJob = data?.qualityByJob ?? [];
  const pulseByJob = data?.pulseByJob ?? [];
  const validity = data?.predictiveValidity ?? [];
  const hasAnything = qualityByJob.length > 0 || pulseByJob.length > 0 || validity.length > 0;

  return (
    <div className={reportCardClass}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
        05 · Quality of hire — did the hire work out
      </p>
      <h2 className="heading-section mb-2 flex items-center gap-2 text-lg text-[var(--text)]">
        <Award size={20} className="text-[var(--accent)]" />
        Quality of hire
      </h2>
      <p className="mb-4 text-xs text-white/60">
        Post-hire performance (1–5), 6/12-month retention, and the 30/60/90-day pulse — plus whether
        a higher FitScore actually predicted a better hire. Populates from recorded hiring outcomes
        and manager pulse replies. Generated{" "}
        {data?.generatedAt
          ? new Date(data.generatedAt).toLocaleString("en-GB", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—"}
        .
      </p>

      {loading ? (
        <div className="space-y-3 py-2">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      ) : !hasAnything ? (
        <p className="text-body text-sm text-white/60">
          No hire-quality data yet. This fills in as hiring outcomes are recorded and hiring
          managers answer the automated 30/60/90-day pulse.
        </p>
      ) : (
        <div className="space-y-6">
          {/* FitScore predictive validity — the headline: does the score predict the hire? */}
          {validity.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                <TrendingUp size={16} className="text-[var(--accent)]" />
                FitScore predictive validity — avg performance by score band
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-white/60">
                      <th className="pb-2 pr-4 font-medium">FitScore band</th>
                      <th className="pb-2 pr-4 font-medium">Hires</th>
                      <th className="pb-2 pr-4 font-medium">Avg performance (1–5)</th>
                      <th className="pb-2 font-medium">6-mo retention</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validity.map((row) => (
                      <tr key={row.fitscore_band} className={reportTableRowClass}>
                        <td className="py-2 pr-4 font-medium text-[var(--text)]">
                          {row.fitscore_band}
                        </td>
                        <td className="py-2 pr-4">{row.hires}</td>
                        <td className="py-2 pr-4 font-medium text-[var(--accent)]">
                          {num(row.avg_performance_rating)}
                        </td>
                        <td className="py-2">
                          {row.retention_6m_rate != null
                            ? `${(row.retention_6m_rate * 100).toFixed(0)}%`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Quality of hire per job */}
          {qualityByJob.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">Per job</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-white/60">
                      <th className="pb-2 pr-4 font-medium">Job</th>
                      <th className="pb-2 pr-4 font-medium">Hires</th>
                      <th className="pb-2 pr-4 font-medium">Avg perf (rated)</th>
                      <th className="pb-2 pr-4 font-medium">6-mo retention</th>
                      <th className="pb-2 pr-4 font-medium">12-mo retention</th>
                      <th className="pb-2 font-medium">Avg hire FitScore</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qualityByJob.map((row) => (
                      <tr key={row.job_id} className={reportTableRowClass}>
                        <td className="py-2 pr-4 font-medium text-[var(--text)]">
                          {row.job_title ?? row.job_id}
                        </td>
                        <td className="py-2 pr-4">{row.hires_count}</td>
                        <td className="py-2 pr-4 font-medium text-[var(--accent)]">
                          {num(row.avg_performance_rating)}
                          <span className="ml-1 text-xs text-white/50">({row.rated_count})</span>
                        </td>
                        <td className="py-2 pr-4">
                          {pct(row.retained_6m_count, row.retention_6m_known)}
                        </td>
                        <td className="py-2 pr-4">
                          {pct(row.retained_12m_count, row.retention_12m_known)}
                        </td>
                        <td className="py-2">{num(row.avg_hire_fitscore, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Post-hire pulse rollup */}
          {pulseByJob.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                <HeartPulse size={16} className="text-[var(--accent)]" />
                Post-hire pulse (30/60/90-day)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-white/60">
                      <th className="pb-2 pr-4 font-medium">Job</th>
                      <th className="pb-2 pr-4 font-medium">Tracked</th>
                      <th className="pb-2 pr-4 font-medium">Response rate</th>
                      <th className="pb-2 pr-4 font-medium">Left (early attrition)</th>
                      <th className="pb-2 font-medium">Avg pulse (1–5)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pulseByJob.map((row) => (
                      <tr key={row.job_id} className={reportTableRowClass}>
                        <td className="py-2 pr-4 font-medium text-[var(--text)]">
                          {row.job_title ?? row.job_id}
                        </td>
                        <td className="py-2 pr-4">{row.pulses_tracked}</td>
                        <td className="py-2 pr-4">
                          {pct(row.pulses_responded, row.pulses_tracked)}
                        </td>
                        <td className="py-2 pr-4">
                          {row.left_count > 0 ? (
                            <span className="font-medium text-amber-300">{row.left_count}</span>
                          ) : (
                            row.left_count
                          )}
                        </td>
                        <td className="py-2 font-medium text-[var(--accent)]">
                          {num(row.avg_pulse_score)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
