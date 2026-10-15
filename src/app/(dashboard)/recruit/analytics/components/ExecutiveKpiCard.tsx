"use client";

import type { ReactNode } from "react";
import { Sparkline } from "./Sparkline";

export type KpiTrendChip = { value: string; positive: boolean };

type StatusTone = "positive" | "negative" | "neutral";

function toneFromTrend(trend: KpiTrendChip | undefined): StatusTone {
  if (!trend) return "neutral";
  // A "flat" chip is reported positive but should read neutral, not good.
  if (/^flat/i.test(trend.value)) return "neutral";
  return trend.positive ? "positive" : "negative";
}

const RAIL_CLASS: Record<StatusTone, string> = {
  positive: "bg-[var(--status-success-fg,#4ade80)]",
  negative: "bg-[var(--status-danger-fg,#f87171)]",
  neutral: "bg-[var(--border)]",
};

const CHIP_CLASS: Record<StatusTone, string> = {
  positive: "text-emerald-400",
  negative: "text-red-400",
  neutral: "text-white/55",
};

/**
 * Executive KPI tile: headline value, a benchmark delta chip (vs prior period),
 * a status rail that colours the tile good/bad at a glance, and an optional
 * real-data sparkline. When no series is available the tile degrades to
 * value + delta with no faked trend line.
 */
export default function ExecutiveKpiCard({
  label,
  value,
  icon,
  trend,
  series,
  seriesLabel,
  target,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  trend?: KpiTrendChip;
  series?: number[] | null;
  seriesLabel?: string;
  /** Optional target line, shown only when a target genuinely exists for this metric. */
  target?: { label: string } | null;
}) {
  const tone = toneFromTrend(trend);
  const hasSeries = Array.isArray(series) && series.filter((n) => Number.isFinite(n)).length >= 2;

  return (
    <div className="card-lifted relative h-full min-h-[128px] overflow-hidden rounded-xl p-3.5 pl-4">
      <span
        aria-hidden
        className={`absolute inset-y-2 left-0 w-1 rounded-full ${RAIL_CLASS[tone]}`}
      />
      <div className="flex items-start justify-between gap-2">
        <p className="text-body text-sm font-normal leading-tight text-white/60">{label}</p>
        {icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/[0.04] text-white/55 ring-1 ring-inset ring-white/[0.06]">
            {icon}
          </div>
        )}
      </div>

      <p
        className="mt-2 text-2xl leading-none font-extrabold tabular-nums [font-variant-numeric:tabular-nums] text-[var(--text)]"
        suppressHydrationWarning
      >
        {value}
      </p>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {trend ? (
            <span className={`text-body block text-sm ${CHIP_CLASS[tone]}`}>{trend.value}</span>
          ) : (
            <span className="text-body block text-sm text-white/40">No prior-period data</span>
          )}
          {target ? (
            <span className="mt-0.5 block text-xs text-white/45">{target.label}</span>
          ) : null}
        </div>
        {hasSeries ? (
          <div className="shrink-0" title={seriesLabel}>
            <Sparkline data={series as number[]} tone={tone} ariaLabel={seriesLabel} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
