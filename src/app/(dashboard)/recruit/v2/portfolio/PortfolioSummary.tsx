"use client";

import { offerAcceptRate, type OfferOutcomes, type PortfolioSummary } from "@/lib/v2/ta-portfolio";

/**
 * The four numbers a Head of Talent walks into a budget conversation with.
 *
 * Each tile either carries a number it can defend or an em-dash with the reason
 * underneath — the rule the whole screen is built on. "Offer accept" used to be
 * the em-dash hardcoded: a quarter of the strip that could never populate on
 * any org, ever. It reads real offer outcomes now, and is still blank until an
 * offer has actually been answered, because 0% accept and nobody-has-replied
 * are opposite situations.
 */
function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "good" | "warn";
}) {
  return (
    <div className="bg-[var(--surface)]/60 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      <p
        className={`font-mono text-xl font-semibold tabular-nums ${
          tone === "good"
            ? "text-emerald-300"
            : tone === "warn"
              ? "text-amber-300"
              : "text-[var(--text)]"
        }`}
      >
        {value}
      </p>
      <p className="text-[11px] text-white/50">{note}</p>
    </div>
  );
}

export function PortfolioSummaryStrip({
  summary,
  offers,
}: {
  summary: PortfolioSummary;
  /** Null when the offer counts could not be read at all. */
  offers: OfferOutcomes | null;
}) {
  const accept = offers ? offerAcceptRate(offers) : null;
  const { withRubric, total, pct } = summary.rubricCoverage;

  return (
    <div className="mb-5 grid gap-px overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label="Open jobs"
        value={String(summary.openJobs)}
        note={summary.blocked > 0 ? `${summary.blocked} blocked` : "none blocked"}
        tone={summary.blocked > 0 ? "warn" : "good"}
      />
      <Stat
        label="Median days open"
        value={summary.medianDaysOpen === null ? "—" : String(summary.medianDaysOpen)}
        note={
          summary.medianDaysOpen === null
            ? "no job carries an open date"
            : "India median is ~45 days"
        }
        tone={
          summary.medianDaysOpen === null
            ? undefined
            : summary.medianDaysOpen <= 45
              ? "good"
              : "warn"
        }
      />
      <Stat
        label="Rubric coverage"
        value={pct === null ? "—" : `${withRubric}/${total}`}
        note={
          pct === null
            ? "no open jobs"
            : withRubric === total
              ? "every job scores on its own bar"
              : `${total - withRubric} scoring generic`
        }
        tone={pct === null ? undefined : pct === 100 ? "good" : "warn"}
      />
      <Stat
        label="Offer accept"
        value={accept?.pct == null ? "—" : `${accept.pct}%`}
        note={
          accept === null
            ? "offer outcomes could not be read"
            : accept.decided === 0
              ? "no offer answered yet"
              : `${offers?.accepted ?? 0} of ${accept.decided} answered`
        }
        tone={accept?.pct == null ? undefined : accept.pct >= 80 ? "good" : "warn"}
      />
    </div>
  );
}
