"use client";

import { Loader2 } from "lucide-react";

const inputClass =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50";

export function HiringRequestOnHoldModal({
  open,
  holdReason,
  holdResumeAt,
  onReasonChange,
  onResumeChange,
  onCancel,
  onSubmit,
  submitting,
}: {
  open: boolean;
  holdReason: string;
  holdResumeAt: string;
  onReasonChange: (v: string) => void;
  onResumeChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="on-hold-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
        <h2 id="on-hold-title" className="text-base font-semibold text-[var(--text)]">
          Put requisition on hold
        </h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          REQ-WF-003: record a reason and the date when review restarts.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label
              htmlFor="hold-reason"
              className="mb-1 block text-xs font-medium text-[var(--text-muted)]"
            >
              Reason *
            </label>
            <textarea
              id="hold-reason"
              rows={3}
              value={holdReason}
              onChange={(e) => onReasonChange(e.target.value)}
              className={inputClass}
              placeholder="e.g. Waiting on budget sign-off from leadership"
            />
          </div>
          <div>
            <label
              htmlFor="hold-resume"
              className="mb-1 block text-xs font-medium text-[var(--text-muted)]"
            >
              Review restarts on *
            </label>
            <input
              id="hold-resume"
              type="date"
              value={holdResumeAt}
              onChange={(e) => onResumeChange(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={onCancel}
            className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || !holdReason.trim() || !holdResumeAt.trim()}
            onClick={onSubmit}
            className="flex items-center gap-2 rounded-full bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            Confirm on hold
          </button>
        </div>
      </div>
    </div>
  );
}
