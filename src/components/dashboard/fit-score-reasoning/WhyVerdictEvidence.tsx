"use client";

import type { FitScore } from "@/types";

type VerdictEvidenceQuote = NonNullable<FitScore["verdictEvidenceQuotes"]>[number];

export type WhyVerdictEvidenceProps = {
  hideHero: boolean;
  whyPrimaryForDisplay: string | null;
  verdictQuotes: VerdictEvidenceQuote[];
  evidenceChips: string[];
};

export function WhyVerdictEvidence({
  hideHero,
  whyPrimaryForDisplay,
  verdictQuotes,
  evidenceChips,
}: WhyVerdictEvidenceProps) {
  return (
    <details className="rounded-xl border border-[var(--border)] px-4 py-3 ring-1 ring-inset ring-white/[0.04]">
      <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-subtle)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35">
        {hideHero ? "Evidence quotes from CV" : "Why this verdict & evidence"}
      </summary>
      <div className="mt-3 space-y-4">
        {(!hideHero && whyPrimaryForDisplay) || verdictQuotes.length > 0 ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/35 p-4 ring-1 ring-inset ring-white/[0.04] sm:p-5">
            {!hideHero ? (
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400/95">
                Why this verdict
              </p>
            ) : null}
            {!hideHero && whyPrimaryForDisplay ? (
              <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed italic text-[var(--text-muted)]">
                {whyPrimaryForDisplay}
              </p>
            ) : null}
            {verdictQuotes.length > 0 ? (
              <div className="mt-4 flex flex-col gap-2.5">
                {verdictQuotes.slice(0, 4).map((quote) => (
                  <div
                    key={`${quote.dimension}:${quote.quote.slice(0, 24)}`}
                    className="rounded-lg border border-[var(--border)]/70 bg-[var(--surface)]/45 p-3 ring-1 ring-inset ring-white/[0.03]"
                  >
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-subtle)]">
                      {quote.dimension}
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">
                      &ldquo;{quote.quote}&rdquo;
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div
          className={
            hideHero
              ? "hidden"
              : "rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/30 p-4 ring-1 ring-inset ring-white/[0.04] sm:p-5"
          }
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-subtle)]">
            Evidence matched
          </p>
          {evidenceChips.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {evidenceChips.map((chip, idx) => (
                <span
                  key={`${idx}-${chip.slice(0, 48)}`}
                  title={chip.length > 120 ? chip : undefined}
                  className="inline-block max-w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]/85 px-3 py-1.5 text-left text-xs leading-snug text-[var(--text-muted)] ring-1 ring-inset ring-white/[0.04]"
                >
                  <span className="line-clamp-4 break-words">{chip}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm leading-snug text-[var(--text-subtle)]">
              No keyword matches, CV quotes, or strengths recorded for this score.
            </p>
          )}
        </div>
      </div>
    </details>
  );
}
