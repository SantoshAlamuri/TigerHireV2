"use client";

import type { FitScore } from "@/types";

export type ScoreCalculationProps = {
  score: FitScore;
};

export function ScoreCalculation({ score }: ScoreCalculationProps) {
  return (
    <details className="rounded-xl border border-[var(--border)] px-4 py-3 ring-1 ring-inset ring-white/[0.04]">
      <summary className="cursor-pointer select-none text-sm font-medium text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]">
        How this score was calculated
      </summary>
      <div className="mt-2 space-y-2">
        {score.blendReasoning ? (
          <p className="whitespace-pre-wrap text-sm text-[var(--text-muted)]">
            {score.blendReasoning}
          </p>
        ) : null}
        {score.scoringFormula ? (
          <pre className="overflow-x-auto rounded-lg bg-[var(--bg-elevated)] p-2 text-xs text-[var(--text-muted)]">
            {score.scoringFormula}
          </pre>
        ) : null}
      </div>
    </details>
  );
}
