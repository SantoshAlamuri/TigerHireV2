"use client";

import Link from "next/link";
import { Bar } from "./Bar";
import { REJECT_REASONS } from "@/lib/v2/review-queue";

/**
 * Rejection-reason distribution — the input to adverse-impact monitoring.
 *
 * Coverage is stated first because the distribution is worthless without it: a
 * clean-looking spread across three reasons means nothing if only 4% of
 * rejections carry a reason at all. Note that reasons cannot currently be
 * stored — applications has no rejection_reason column — so this reads 0% until
 * that migration lands.
 */
const REASON_LABEL: Record<string, string> = {
  ...Object.fromEntries(REJECT_REASONS.map((r) => [r.id, r.label])),
  unspecified: "No reason recorded",
};

export function Fairness({
  rejects,
}: {
  rejects: { coveragePercent: number; total: number; rows: { reason: string; count: number }[] };
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4">
      <h2 className="text-sm font-bold text-[var(--text)]">Rejection reasons</h2>
      <p className="mb-3 mt-0.5 text-xs text-white/50">
        {rejects.coveragePercent}% of rejections carry a structured reason. Adverse-impact
        monitoring is only as good as this coverage.
      </p>
      {rejects.rows.length === 0 ? (
        <p className="text-sm text-white/60">No rejections recorded yet.</p>
      ) : (
        rejects.rows.map((r) => (
          <div key={r.reason} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <Bar
                label={REASON_LABEL[r.reason] ?? r.reason}
                value={r.count}
                total={rejects.total}
              />
            </div>
            {/* Rejected-for-comp candidates are the talent pool for the next
                band up — the reason is only useful if it leads somewhere. */}
            <Link
              href="/recruit/v2/candidates/pool"
              className="shrink-0 rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11px] font-semibold text-white/60 hover:text-[var(--text)]"
            >
              Pool →
            </Link>
          </div>
        ))
      )}
    </div>
  );
}
