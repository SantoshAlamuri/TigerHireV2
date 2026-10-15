"use client";

import { Bar } from "./Bar";

/**
 * The whole-org funnel, shown under By job where the design puts pass-through.
 * The reading underneath is the point: the shape of the funnel is only useful
 * next to what it means.
 */
export function FunnelBars({
  funnel,
}: {
  funnel: {
    applied: number;
    reviewed: number;
    shortlisted: number;
    hired: number;
    rejected: number;
    conversion: { shortlistToHire: number };
  };
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4">
      <h3 className="mb-2 text-sm font-bold text-[var(--text)]">Funnel across all jobs</h3>
      <Bar label="Applied" value={funnel.applied} total={funnel.applied} />
      <Bar label="Reviewed" value={funnel.reviewed} total={funnel.applied} />
      <Bar label="Shortlisted" value={funnel.shortlisted} total={funnel.applied} />
      <Bar label="Hired" value={funnel.hired} total={funnel.applied} />
      <Bar label="Rejected" value={funnel.rejected} total={funnel.applied} />
      <p className="mt-3 border-t border-[var(--border)] pt-3 text-xs text-white/50">
        Shortlist to hire converts at {funnel.conversion.shortlistToHire}%. A high applied to
        shortlist rate with a low shortlist to hire rate means the bar is letting the wrong people
        through.
      </p>
    </div>
  );
}
