"use client";

import type { FitScore } from "@/types";
import type { ReadinessResult } from "@/lib/fitscore/readiness";
import { displayedFitScore } from "../fit-score-display-helpers";
import { confidencePrimaryDisplay, verdictBadgeClass, verdictBadgeTone } from "./score-helpers";

export type VerdictHeroProps = {
  score: FitScore;
  primaryVerdictLabel: string | null;
  verdictActionChip: string | null;
  modelFootnote: string;
  sessionLabel: string;
  marketValue: string;
  marketSub?: string;
  idealDisplay: string;
  roleLine: string | null;
  readiness: ReadinessResult | null;
};

export function VerdictHero({
  score,
  primaryVerdictLabel,
  verdictActionChip,
  modelFootnote,
  sessionLabel,
  marketValue,
  marketSub,
  idealDisplay,
  roleLine,
  readiness,
}: VerdictHeroProps) {
  return (
    <>
      {/* Mock-style verdict hero: one band answers score → verdict → why → the other
      signals. Candidate identity lives above the panel on the page, so the hero
      carries the decision, not the name. */}
      <header className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.05] via-transparent to-transparent p-4 ring-1 ring-inset ring-emerald-500/10 sm:p-5">
        <div className="grid grid-cols-1 items-start gap-x-8 gap-y-4 sm:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,1fr)_auto]">
          <div className="flex shrink-0 items-start gap-2">
            <span className="text-[3.4rem] font-extrabold leading-none tabular-nums tracking-tight text-amber-300">
              {Math.round(displayedFitScore(score))}
            </span>
            <div className="flex flex-col gap-1 pt-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400/90">
                FitScore
              </span>
              <span className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-subtle)]">
                Quality
              </span>
              {score.shadowBlendVersion === "v5_outcomes" && score.shadowScore != null ? (
                <span
                  className="text-xs font-semibold tabular-nums text-sky-300/90"
                  title={score.shadowBlendFormula ?? "v5 shadow score"}
                >
                  S {score.shadowScore}
                </span>
              ) : null}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {primaryVerdictLabel ? (
                <span
                  className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${verdictBadgeClass(verdictBadgeTone(primaryVerdictLabel))}`}
                >
                  {primaryVerdictLabel}
                </span>
              ) : null}
              <span className="text-xs font-semibold text-sky-300/90">
                Confidence: {confidencePrimaryDisplay(score)}
              </span>
            </div>
            {verdictActionChip ? (
              <p className="mt-2 text-lg font-semibold leading-snug tracking-tight text-[var(--text)]">
                {verdictActionChip}
              </p>
            ) : null}
            <p className="mt-1.5 text-xs italic leading-snug text-[var(--text-muted)]">
              {score.oneLineSummary ? `${score.oneLineSummary} ` : ""}
              <span className="not-italic text-[var(--text-subtle)]">
                Evaluated with {modelFootnote} · Session {sessionLabel}
              </span>
            </p>
            {roleLine ? (
              <p className="mt-1 truncate text-[11px] text-[var(--text-subtle)]">{roleLine}</p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-start gap-x-7 gap-y-3 border-t border-[var(--border)]/60 pt-3 sm:col-span-2 lg:col-span-1 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-1">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400/90">
                Market rank
              </p>
              <p className="mt-1 text-sm font-bold tabular-nums text-emerald-300">{marketValue}</p>
              <p className="mt-0.5 text-[10px] text-[var(--text-subtle)]">
                {marketSub ?? "Peer comparison"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-400/90">
                ICP match
              </p>
              <p className="mt-1 text-sm font-bold tabular-nums text-violet-300">{idealDisplay}</p>
              <p className="mt-0.5 text-[10px] text-[var(--text-subtle)]">
                {idealDisplay === "—" ? "no baseline" : "vs Ideal Profile"}
              </p>
            </div>
            {readiness ? (
              <div title={readiness.parts.map((pt) => `${pt.label}: ${pt.detail}`).join("\n")}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-teal-400/90">
                  Readiness
                </p>
                <p className="mt-1 text-sm font-bold tabular-nums text-teal-300">
                  {readiness.score ?? "—"}{" "}
                  <span className="font-semibold text-teal-300/75">{readiness.band}</span>
                </p>
                <p className="mt-0.5 text-[10px] text-[var(--text-subtle)]">
                  {readiness.knownSignals} of {readiness.totalSignals} signals
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </header>
    </>
  );
}
