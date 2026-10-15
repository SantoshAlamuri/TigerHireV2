"use client";

import Link from "next/link";
import type { JobTableRow, ScoreBands, TimeMetrics } from "@/lib/v2/analytics";

/**
 * Per-job performance, timing and score distribution.
 *
 * The point of a job-level table is that it separates three different diseases
 * that a single org-wide number hides: a bar nobody clears, a job nobody is
 * sourcing for, and a job stuck on a human. "All unscored" is called out
 * explicitly because that failure is silent everywhere else in the product.
 */
export function TimingCards({ t }: { t: TimeMetrics }) {
  const cards = [
    {
      k: "Median days to decision",
      v: t.medianDaysToDecision === null ? "—" : String(t.medianDaysToDecision),
      d:
        t.decided > 0
          ? `across ${t.decided} decided · approximate, see note`
          : "nothing decided yet",
      tone: "",
    },
    { k: "Awaiting a decision", v: String(t.pending), d: "still open", tone: "" },
    {
      k: "Waiting over a week",
      v: String(t.waitingOverAWeek),
      d: t.waitingOverAWeek > 0 ? "these are the ones who go quiet" : "nothing stale",
      tone: t.waitingOverAWeek > 0 ? "text-amber-300" : "",
    },
  ];
  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-3">
      {cards.map((c) => (
        <div
          key={c.k}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 px-4 py-3"
        >
          <div className="text-[10px] font-medium uppercase tracking-wider text-white/40">
            {c.k}
          </div>
          <div
            className={`font-mono text-2xl font-semibold tabular-nums ${c.tone || "text-[var(--text)]"}`}
          >
            {c.v}
          </div>
          <div className="text-xs text-white/50">{c.d}</div>
        </div>
      ))}
      <p className="col-span-full text-[11px] text-white/35">
        Decision dates are approximate: applications record no decision timestamp, so the last
        update is used as a proxy. Treat this as a trend, not an SLA.
      </p>
    </div>
  );
}

export function ScoreDistribution({ b }: { b: ScoreBands }) {
  const max = Math.max(1, ...b.bands.map((x) => x.count));
  return (
    <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4">
      <h2 className="text-sm font-bold text-[var(--text)]">Score distribution</h2>
      <p className="mb-3 text-xs text-white/50">
        {b.scored} scored
        {b.unscored > 0 ? (
          <>
            {" · "}
            <span className="text-amber-300">{b.unscored} unscored</span> — counted separately,
            never folded into the bottom band
          </>
        ) : null}
      </p>
      <div className="space-y-1.5">
        {b.bands.map((band) => (
          <div key={band.label} className="flex items-center gap-3">
            <span className="w-16 shrink-0 font-mono text-xs text-white/50">{band.label}</span>
            <span className="h-4 flex-1 overflow-hidden rounded bg-white/[0.04]">
              <span
                className="block h-full rounded bg-[var(--accent)]/60"
                style={{ width: `${(band.count / max) * 100}%` }}
              />
            </span>
            <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-white/70">
              {band.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function JobTable({ rows }: { rows: JobTableRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-6 text-sm text-white/60">
        No applications yet, so there is nothing to compare across jobs.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-b border-[var(--border)]">
            {["Job", "Applicants", "Scored", "Shortlisted", "Hired", "Rejected", ""].map((h) => (
              <th
                key={h}
                className={`px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-white/40 ${
                  h === "Job" || h === "" ? "text-left" : "text-right"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.jobId} className="border-b border-white/5 last:border-b-0">
              <td className="px-3 py-2 text-sm text-[var(--text)]">
                <Link href={`/recruit/jobs/${r.jobId}`} className="hover:text-[var(--accent)]">
                  {r.jobTitle || "Untitled job"}
                </Link>
                {r.allUnscored ? (
                  <span className="ml-2 rounded-full border border-red-400/40 px-2 py-0.5 text-[10px] text-red-300">
                    nothing scored
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-white/80">
                {r.applicants}
              </td>
              <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-white/60">
                {r.scored}
              </td>
              <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-white/60">
                {r.shortlisted}
              </td>
              <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-emerald-300/80">
                {r.hired}
              </td>
              <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-white/40">
                {r.rejected}
              </td>
              <td className="px-3 py-2 text-right">
                <Link
                  href={`/recruit/v2/jobs/${r.jobId}/review`}
                  className="text-xs font-semibold text-white/45 hover:text-[var(--accent)]"
                >
                  review →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
