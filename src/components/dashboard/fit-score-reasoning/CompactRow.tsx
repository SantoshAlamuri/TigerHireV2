"use client";

import Link from "next/link";
import { AlertCircle, View } from "lucide-react";
import type { FitScore } from "@/types";
import FitRing from "@/components/ui/FitRing";
import { CompactMoatBadges } from "../CandidateMoatSignals";
import { confidencePrimaryDisplay } from "./score-helpers";

export type CompactRowProps = {
  score: FitScore;
  displayName: string;
  marketValue: string;
  idealDisplay: string;
  compactHref?: string;
  compactOnNavigate?: () => void;
};

export function CompactRow({
  score,
  displayName,
  marketValue,
  idealDisplay,
  compactHref,
  compactOnNavigate,
}: CompactRowProps) {
  const ghostLabel = score.candidateGhostRiskLabel;

  const rowClass =
    "flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 px-4 py-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] ring-1 ring-white/[0.03] backdrop-blur-sm transition hover:border-[var(--accent)]/40 hover:bg-[var(--surface)]/85";

  const inner = (
    <>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <FitRing score={score.overallScore} size={36} showLabel={false} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--text)]">{displayName}</p>
          <p className="truncate text-xs text-[var(--text-muted)]">{score.jobTitle}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
            <span className="text-emerald-400/90">{marketValue}</span>
            {idealDisplay !== "—" ? (
              <span className="text-violet-400/90">Ideal {idealDisplay}</span>
            ) : null}
            <span className="tabular-nums text-sky-400/90">{confidencePrimaryDisplay(score)}</span>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          AI Scored
        </span>
        <CompactMoatBadges vouches={score.candidateVouches} ghostLabel={ghostLabel} />
        {score.humanReviewRequired ? (
          <span
            className="shrink-0 flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400"
            title={score.humanReviewReason ?? undefined}
          >
            <AlertCircle size={10} />
            Review
          </span>
        ) : null}
      </div>
      <span className="pointer-events-none shrink-0 flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-semibold text-[var(--text)] transition group-hover:bg-[var(--surface)]">
        <View size={14} aria-hidden />
        View verdict
      </span>
    </>
  );

  if (compactHref) {
    return (
      <Link href={compactHref} className={`group block ${rowClass}`}>
        {inner}
      </Link>
    );
  }

  return (
    <div
      role={compactOnNavigate ? "button" : undefined}
      tabIndex={compactOnNavigate ? 0 : undefined}
      className={compactOnNavigate ? rowClass : `${rowClass} cursor-default`}
      onClick={compactOnNavigate}
      onKeyDown={(e) => {
        if (!compactOnNavigate) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          compactOnNavigate();
        }
      }}
    >
      {inner}
    </div>
  );
}
