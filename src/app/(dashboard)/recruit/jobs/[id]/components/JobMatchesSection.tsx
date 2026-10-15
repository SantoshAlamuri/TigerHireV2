"use client";

import { Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { FitScoreBlendAndInterviewExtras } from "@/components/dashboard/FitScoreBlendAndInterviewExtras";
import { FitScoreReasoningPanel } from "@/components/dashboard/FitScoreReasoningPanel";
import { BRAND } from "@/lib/brand";
import type { FitScore } from "@/types";
export type JobMatchesSortKey = "fit" | "icp" | "market";

export function JobMatchesSection({
  jobId,
  fitScores,
  sortKey,
  onSortKeyChange,
  canScoreCandidates,
  scoreGateMessage,
  overviewHref,
  refetchScores,
  recomputeFitScores,
  recomputing,
  recomputeError,
  recomputeSuccess,
  setRecomputeSuccess,
}: {
  jobId: string;
  fitScores: FitScore[];
  sortKey?: JobMatchesSortKey;
  onSortKeyChange?: (key: JobMatchesSortKey) => void;
  canScoreCandidates: boolean;
  scoreGateMessage?: string;
  /** Link to overview + ideal profile anchor when setup is incomplete */
  overviewHref: string;
  refetchScores: () => Promise<unknown>;
  recomputeFitScores: (body: { jobId: string; candidateIds: string[] }) => Promise<unknown>;
  recomputing: boolean;
  recomputeError: unknown;
  recomputeSuccess: boolean;
  setRecomputeSuccess: (v: boolean) => void;
}) {
  return (
    <>
      <section className="mt-2">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="heading-section text-lg text-[var(--text)]">
            {BRAND.shortlistHeading}
            <span className="ml-2 text-sm font-normal text-white/60">
              ({fitScores.length} candidates)
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {onSortKeyChange ? (
              <label className="flex items-center gap-2 text-xs text-white/60">
                Sort by
                <select
                  value={sortKey ?? "fit"}
                  onChange={(e) => onSortKeyChange(e.target.value as JobMatchesSortKey)}
                  className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs text-[var(--text)]"
                >
                  <option value="fit">FitScore</option>
                  <option value="icp">ICP Match</option>
                  <option value="market">Market Rank</option>
                </select>
              </label>
            ) : null}
            {recomputeSuccess && (
              <span className="text-xs text-emerald-400">Scores recomputed</span>
            )}
            {recomputeError ? (
              <span className="text-xs text-red-400">
                {recomputeError instanceof Error ? recomputeError.message : "Recompute failed"}
              </span>
            ) : null}
            <button
              type="button"
              disabled={recomputing || !jobId || !canScoreCandidates}
              onClick={async () => {
                if (!jobId || !canScoreCandidates) return;
                setRecomputeSuccess(false);
                const candidateIds = fitScores.map((score) => score.candidateId);
                if (candidateIds.length === 0) return;
                const result = await recomputeFitScores({ jobId, candidateIds });
                if (result) {
                  setRecomputeSuccess(true);
                  setTimeout(() => setRecomputeSuccess(false), 3000);
                  await refetchScores();
                }
              }}
              className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {recomputing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              Recompute Scores
            </button>
          </div>
        </div>
        {!canScoreCandidates ? (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-sm text-amber-300">
              {scoreGateMessage ?? "Set up Ideal Profile to enable scoring for this job."}
            </p>
            <Link
              href={overviewHref}
              className="mt-2 inline-block text-xs font-medium text-amber-200 underline underline-offset-2"
            >
              Open setup on Overview
            </Link>
          </div>
        ) : null}
        {fitScores.length > 0 ? (
          <div className="space-y-2">
            {fitScores.map((fs) => (
              <div key={fs.id} className="space-y-1">
                <FitScoreReasoningPanel
                  score={fs}
                  compact
                  compactHref={`/recruit/candidates/${fs.candidateId}#scores`}
                />
                <FitScoreBlendAndInterviewExtras score={fs} onRefetch={refetchScores} />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 px-4 py-3 text-sm text-white/60">
            No scores yet. Run scoring after ideal profile setup to populate this shortlist.
          </div>
        )}
      </section>
    </>
  );
}
