"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useApiQuery } from "@/lib/hooks/use-api";
import { Skeleton } from "@/components/ui/Skeleton";
import { buildScorecard, canSubmitVerdict } from "@/lib/v2/hm-interview";
import { SeatGate } from "../../../SeatGate";

/**
 * Interview scorecard.
 *
 * Criteria come from the job's approved rubric, so the interview measures the
 * same bar the screen did. Without that, Quality-of-Hire compares two different
 * yardsticks and the rubric's authority quietly evaporates.
 *
 * A verdict is refused until every criterion is rated — "good guy, hire" is an
 * opinion, and it is what makes hiring data useless six months later.
 */
function RecruitV2ScorecardPageBody() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const jobId = search.get("job") ?? "";

  const { data: apps, loading } = useApiQuery<{
    applications: { job_id: string; candidates?: { name?: string | null } | null }[];
  }>(id ? "/api/applications" : null, id ? { candidateId: id, limit: 5 } : undefined);

  const { data: jdBase } = useApiQuery<{
    jdBase?: { idealCandidateProfile?: { must_haves?: string[] | null } | null } | null;
  }>(jobId ? "/api/fitscore/jd-base" : null, jobId ? { jobId } : undefined);

  const app = apps?.applications?.[0];
  const criteria = buildScorecard(jdBase?.jdBase?.idealCandidateProfile?.must_haves ?? []);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const check = canSubmitVerdict(ratings, criteria.length);

  if (!id) return null;

  return (
    <section className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-[var(--text)]">
            Scorecard — {loading ? "…" : (app?.candidates?.name?.trim() ?? "Candidate")}
          </h1>
          <p className="text-sm text-white/55">
            Rated against the job&apos;s approved rubric, so the interview and the screen use the
            same bar.
          </p>
        </div>
        <Link
          href="/recruit/jobs"
          className="text-sm font-semibold text-white/60 hover:text-[var(--text)]"
        >
          ← Your week
        </Link>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div className="space-y-2">
            {criteria.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--text)]">{c.name}</span>
                  {c.fromRubric ? (
                    <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-white/40">
                      from rubric
                    </span>
                  ) : null}
                  <span className="ml-auto flex gap-1.5">
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setRatings((r) => ({ ...r, [c.id]: n }))}
                        aria-label={`${c.name}: ${n} of 4`}
                        aria-pressed={ratings[c.id] === n}
                        className={`h-6 w-6 rounded-md border font-mono text-[11px] font-semibold transition ${
                          ratings[c.id] === n
                            ? "border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]"
                            : "border-[var(--border)] text-white/40 hover:text-white/70"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-white/40">
                  4 = {c.high} · 1 = {c.low}
                </p>
                <p className="mt-2 rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-xs text-white/35">
                  Evidence — quote what you heard, not an impression.
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
            {["Strong hire", "Hire", "No hire"].map((v, i) => (
              <button
                key={v}
                type="button"
                disabled={!check.allowed}
                className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                  i === 0
                    ? "bg-[var(--accent)] text-black"
                    : "border border-[var(--border)] text-white/75"
                }`}
              >
                {v}
              </button>
            ))}
            {!check.allowed ? <span className="text-xs text-white/45">{check.reason}</span> : null}
          </div>
        </>
      )}
    </section>
  );
}

export default function RecruitV2ScorecardPage() {
  return (
    <SeatGate need="submitFeedback" what="The scorecard">
      <RecruitV2ScorecardPageBody />
    </SeatGate>
  );
}
