"use client";

import Link from "next/link";
import type { Capabilities } from "@/lib/v2/seat-capabilities";

/**
 * The "Action required" list on a job.
 *
 * Ordered by what stalls a hire soonest: a broken scoring gate outranks a
 * review backlog, and an offer outranks both, because offers expire while
 * queues merely grow. Each row appears only for seats that own that work.
 */
function Row({
  href,
  title,
  detail,
  count,
  tone: requestedTone = "plain",
  cta,
}: {
  href: string;
  title: string;
  detail: string;
  count?: number | null;
  tone?: "danger" | "warn" | "plain";
  cta: string;
}) {
  // A count of zero means there is nothing to do, whatever the caller asked for.
  // Highlighting an empty queue as urgent is how a colour stops meaning anything
  // — and it sat on this page reading "Applications to review 0" in amber.
  const tone = count === 0 ? "plain" : requestedTone;
  const shell =
    tone === "danger"
      ? "border-red-400/40 bg-red-500/5 hover:bg-red-500/10"
      : tone === "warn"
        ? "border-amber-400/40 bg-amber-500/5 hover:bg-amber-500/10"
        : "border-[var(--border)] bg-[var(--surface)]/40 hover:bg-white/[0.03]";

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition ${shell}`}
    >
      {typeof count === "number" ? (
        <span
          className={`w-10 shrink-0 text-right font-mono text-xl font-semibold tabular-nums ${
            count > 0 ? "text-amber-300" : "text-white/20"
          }`}
        >
          {count}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[var(--text)]">{title}</span>
        <span className="block text-xs text-white/55">{detail}</span>
      </span>
      <span className="shrink-0 text-sm text-white/40">{cta}</span>
    </Link>
  );
}

export function ActionRows({
  jobId,
  caps,
  gate,
  newCount,
}: {
  jobId: string;
  caps: Capabilities;
  gate: { loading: boolean; canScore: boolean; message?: string };
  newCount: number | null;
}) {
  const setupPending = caps.editJobSetup && !gate.loading && !gate.canScore;
  const reviewPending = caps.reviewApplications && newCount !== null && newCount > 0;
  if (!setupPending && !reviewPending) return null;

  return (
    <>
      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/40">
        Action required
      </h2>
      <div className="space-y-2">
        {setupPending ? (
          <Row
            href={`/recruit/jobs/${jobId}#ideal-profile-setup`}
            tone="danger"
            title="Review candidate evaluation"
            detail={
              gate.message ?? "Approve the evaluation criteria to enable role-specific scoring."
            }
            cta="Fix setup"
          />
        ) : null}

        {reviewPending ? (
          <Row
            href={`/recruit/v2/jobs/${jobId}/review`}
            tone="warn"
            count={newCount}
            title="Applications to review"
            detail="New applications are ready for your review."
            cta="Review →"
          />
        ) : null}
      </div>
    </>
  );
}
