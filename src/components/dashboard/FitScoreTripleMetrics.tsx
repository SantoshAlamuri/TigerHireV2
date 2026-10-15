"use client";

import type { FitScore } from "@/types";
import {
  displayedFitScore,
  marketHeadlineFromScore,
} from "@/components/dashboard/fit-score-display-helpers";

type FitScoreTripleMetricsProps = {
  score: FitScore;
  layout?: "row" | "stack";
  className?: string;
};

function MetricCell({
  label,
  value,
  hint,
  sub,
}: {
  label: string;
  value: string;
  hint: string;
  sub: string;
}) {
  return (
    <div
      className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/60 px-3 py-2.5"
      title={hint}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-bold tabular-nums text-[var(--text)]">{value}</p>
      <p className="mt-0.5 text-[10px] leading-snug text-[var(--text-muted)]">{sub}</p>
    </div>
  );
}

export function FitScoreTripleMetrics({
  score,
  layout = "row",
  className = "",
}: FitScoreTripleMetricsProps) {
  const fitDisplay = displayedFitScore(score);
  const { value: marketValue } = marketHeadlineFromScore(score);
  const idealDisplay =
    score.idealMatchPct != null && score.idealMatchPct > 0 ? `${score.idealMatchPct}%` : "—";

  const gridClass =
    layout === "stack" ? "grid grid-cols-1 gap-2" : "grid grid-cols-1 gap-2 sm:grid-cols-3";

  return (
    <div className={`${gridClass} ${className}`}>
      <MetricCell
        label="FitScore"
        value={String(fitDisplay)}
        hint="Skills 25% + intent 75%"
        sub="Can they do the job?"
      />
      <MetricCell
        label="ICP Match"
        value={idealDisplay}
        hint="Must-haves, traits, preferences"
        sub="The person we imagined?"
      />
      <MetricCell
        label="Market Rank"
        value={marketValue}
        hint="Vs applicants for this role"
        sub="How do they compare?"
      />
    </div>
  );
}
