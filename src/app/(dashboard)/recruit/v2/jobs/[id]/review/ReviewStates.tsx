"use client";

import { summariseDecisions } from "@/lib/v2/decision-sync";
import type { DecisionRecord } from "@/lib/v2/review-queue";

/** Shown to seats that do not triage — hiring managers and agencies. */
export function ReviewNotYours() {
  return (
    <section>
      <h1 className="text-xl font-bold text-[var(--text)]">Application Review</h1>
      <p className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-6 text-sm text-[var(--text-muted)]">
        Reviewing applications isn&apos;t part of your role. Your shortlist and interviews are on
        the job page.
      </p>
    </section>
  );
}

/**
 * End of the queue. Reports the session honestly rather than a bare
 * "all done" — a recruiter should be able to see what they just did.
 */
export function QueueCleared({ total, decisions }: { total: number; decisions: DecisionRecord[] }) {
  const s = summariseDecisions(decisions);
  return (
    <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/[0.06] p-8 text-center">
      <p className="font-mono text-3xl font-semibold text-emerald-300">
        {total > 0 ? "Batch reviewed" : "Nothing to review"}
      </p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        {total > 0
          ? `${s.total} decided — ${s.advanced} shortlisted, ${s.held} held, ${s.rejected} rejected.`
          : "New applications land here as they are scored."}
      </p>
    </div>
  );
}
