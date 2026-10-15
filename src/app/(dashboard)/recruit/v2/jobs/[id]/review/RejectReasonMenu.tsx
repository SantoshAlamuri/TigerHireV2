"use client";

import { REJECT_REASONS } from "@/lib/v2/review-queue";

/**
 * Reject is the only decision that asks a question, and it asks exactly one.
 * The reason drives two things a recruiter feels later: the fairness report,
 * and whether this person stays reusable in the talent pool.
 */
export function RejectReasonMenu({
  count,
  onPick,
  onCancel,
}: {
  count: number;
  onPick: (reasonId: string) => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Choose a reject reason"
      className="rounded-xl border border-red-400/30 bg-red-500/[0.06] p-3"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-semibold text-[var(--text)]">
          Why {count > 1 ? `these ${count}?` : "this candidate?"}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          Cancel (Esc)
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {REJECT_REASONS.map((r, i) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onPick(r.id)}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition hover:border-white/25 hover:text-[var(--text)]"
          >
            <span className="mr-1.5 font-mono text-xs text-[var(--text-muted)]">{i + 1}</span>
            {r.label}
            {r.poolable ? (
              <span className="ml-1.5 text-xs font-normal text-emerald-300/80">→ pool</span>
            ) : null}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Reasons marked <span className="text-emerald-300/80">→ pool</span> keep the candidate
        reusable for future roles. Every reason feeds the fairness report.
      </p>
    </div>
  );
}
