"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useApiQuery } from "@/lib/hooks/use-api";
import { Skeleton } from "@/components/ui/Skeleton";
import { SeatGate } from "../../../SeatGate";

/**
 * Interview feedback for a job.
 *
 * This is the step that stalls jobs more than any other — an interview happens,
 * the scorecard never gets filled, and the candidate waits. So the page leads
 * with what is missing, not with what is complete.
 */
interface FeedbackRow {
  id: string;
  candidate_id?: string | null;
  submitted_at?: string | null;
  created_at?: string | null;
  overall_rating?: string | null;
  reviewer_name?: string | null;
  candidates?: { name?: string | null } | null;
}

function RecruitV2FeedbackPageBody() {
  const { id } = useParams<{ id: string }>();
  const { data, loading } = useApiQuery<{ feedback: FeedbackRow[] }>(
    id ? `/api/jobs/${id}/feedback` : null,
  );

  const rows = data?.feedback ?? [];
  const pending = rows.filter((r) => !r.submitted_at);
  const done = rows.filter((r) => r.submitted_at);

  if (!id) return null;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-[var(--text)]">Interview feedback</h1>
          <p className="text-sm text-white/55">
            {loading
              ? "Loading…"
              : pending.length > 0
                ? `${pending.length} scorecard${pending.length === 1 ? "" : "s"} outstanding`
                : `${done.length} submitted · nothing outstanding`}
          </p>
        </div>
        <Link
          href={`/recruit/jobs/${id}/feedback`}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold text-white/70 hover:text-[var(--text)]"
        >
          Open full view
        </Link>
        <Link
          href={`/recruit/jobs/${id}`}
          className="text-sm font-semibold text-white/60 hover:text-[var(--text)]"
        >
          ← Job
        </Link>
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-6 text-sm text-white/60">
          No interviews have happened yet, so there is no feedback to collect.
        </p>
      ) : (
        <>
          {pending.length > 0 ? (
            <>
              <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/35">
                Waiting on a scorecard
              </h2>
              <ul className="mb-4 overflow-hidden rounded-xl border border-amber-400/30 bg-amber-500/[0.04]">
                {pending.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-3 border-b border-white/5 px-4 py-3 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-[var(--text)]">
                      {r.candidates?.name ?? "Candidate"}
                    </span>
                    <span className="shrink-0 text-xs text-white/50">
                      {r.reviewer_name ?? "interviewer"}
                    </span>
                    <Link
                      href={`/recruit/jobs/${id}/feedback`}
                      className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-black"
                    >
                      Fill it
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/35">
            Submitted
          </h2>
          {done.length === 0 ? (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-6 text-sm text-white/60">
              Nothing submitted yet.
            </p>
          ) : (
            <ul className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
              {done.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 border-b border-white/5 px-4 py-2.5 text-sm last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate text-[var(--text)]">
                    {r.candidates?.name ?? "Candidate"}
                  </span>
                  <span className="shrink-0 text-xs capitalize text-white/60">
                    {r.overall_rating ?? "recorded"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export default function RecruitV2FeedbackPage() {
  return (
    <SeatGate need="submitFeedback" what="Interview feedback">
      <RecruitV2FeedbackPageBody />
    </SeatGate>
  );
}
