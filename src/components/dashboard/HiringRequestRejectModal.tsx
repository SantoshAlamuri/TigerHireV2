"use client";

import { Loader2 } from "lucide-react";

const inputClass =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50";

export function HiringRequestRejectModal({
  open,
  reason,
  onReasonChange,
  onCancel,
  onSubmit,
  submitting,
}: {
  open: boolean;
  reason: string;
  onReasonChange: (v: string) => void;
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
      aria-labelledby="reject-requisition-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
        <h2 id="reject-requisition-title" className="text-base font-semibold text-[var(--text)]">
          Reject requisition
        </h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Add a short reason — it is stored in the audit trail and shared with the requester.
        </p>
        <div className="mt-4">
          <label
            htmlFor="reject-reason"
            className="mb-1 block text-xs font-medium text-[var(--text-muted)]"
          >
            Reason *
          </label>
          <textarea
            id="reject-reason"
            rows={3}
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            className={inputClass}
            placeholder="e.g. Role no longer needed this quarter…"
          />
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
            disabled={submitting || !reason.trim()}
            onClick={onSubmit}
            className="flex items-center gap-2 rounded-full bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            Confirm reject
          </button>
        </div>
      </div>
    </div>
  );
}
