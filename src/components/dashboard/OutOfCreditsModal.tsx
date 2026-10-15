"use client";

import { Lock, X } from "lucide-react";
import Link from "next/link";

interface OutOfCreditsModalProps {
  open: boolean;
  onClose: () => void;
  /** Optional: show when triggered from unlock API (e.g. monthly limit) */
  monthlyLimit?: number;
}

export default function OutOfCreditsModal({ open, onClose, monthlyLimit }: OutOfCreditsModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="out-of-credits-title"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-[var(--text-muted)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]"
          aria-label="Close"
        >
          <X size={20} />
        </button>
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
            <Lock size={28} />
          </div>
          <h2 id="out-of-credits-title" className="heading-card mt-4 text-xl text-[var(--text)]">
            Out of credits
          </h2>
          <p className="text-body mt-2 text-sm text-[var(--text-muted)]">
            {monthlyLimit != null
              ? `You've used all ${monthlyLimit} profile unlock credits for this month. Upgrade your plan to get more credits.`
              : "You've used all your profile unlock credits for this month. Upgrade your plan to unlock more candidate contacts."}
          </p>
          <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/company/billing"
              className="flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
            >
              Upgrade plan
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface)]"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
