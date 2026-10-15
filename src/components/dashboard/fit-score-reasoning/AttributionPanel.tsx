"use client";

import type { FitScore } from "@/types";

export type AttributionPanelProps = {
  score: FitScore;
  hasLegacyAttribution: boolean;
  signal: number | null;
  rubric: number | null;
  signalPct: number;
  rubricPct: number;
};

export function AttributionPanel({
  score,
  hasLegacyAttribution,
  signal,
  rubric,
  signalPct,
  rubricPct,
}: AttributionPanelProps) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-4 ring-1 ring-inset ring-white/[0.04]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-subtle)]">
        Attribution
      </p>
      {hasLegacyAttribution ? (
        <>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
            <div className="flex h-full">
              <div className="bg-sky-400" style={{ width: `${signalPct}%` }} />
              <div className="bg-violet-400" style={{ width: `${rubricPct}%` }} />
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Signal {signalPct}% ({signal}) + Rubric {rubricPct}% ({rubric})
          </p>
        </>
      ) : (
        <>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
            <div className="flex h-full">
              <div className="bg-sky-400" style={{ width: "25%" }} />
              <div className="bg-violet-400" style={{ width: "75%" }} />
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            {score.primaryBlendFormula ??
              `0.25×skills(${score.skillsSignal}) + 0.75×intent(${score.intentMatch})`}
          </p>
        </>
      )}
    </div>
  );
}
