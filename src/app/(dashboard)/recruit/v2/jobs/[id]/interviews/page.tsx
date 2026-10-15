"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useApiQuery } from "@/lib/hooks/use-api";
import {
  indexScoresByCandidate,
  candidateIdByUniqueName,
  type ScoreRow,
} from "@/lib/v2/score-index";
import { InterviewTable } from "./InterviewTable";
import { Skeleton } from "@/components/ui/Skeleton";
import { SeatGate } from "../../../SeatGate";

/**
 * Interviews for a job.
 *
 * Two questions only: who is booked, and where are the open slots. Anything
 * else — rescheduling, panel setup, notetaker config — stays on the existing
 * scheduling screen, which this links to rather than reimplements.
 */
/**
 * Shape of /api/interviews/aggregate.
 *
 * This page previously fetched /api/jobs/[id]/interviews, which has no route
 * file — only sub-routes like /cancel and /ics. Every request 404'd, so the
 * page rendered "no interviews scheduled" no matter how many were booked.
 */
interface Interview {
  slotId: string;
  candidateName?: string | null;
  scheduledStart?: string | null;
  stageName?: string | null;
  feedbackSubmitted?: boolean;
  aggregateStatus?: string | null;
  interviewerName?: string | null;
}

interface Slot {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
}

function when(iso: string | null | undefined): string {
  if (!iso) return "unscheduled";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "unscheduled";
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

function RecruitV2InterviewsPageBody() {
  const { id } = useParams<{ id: string }>();

  const { data: iv, loading } = useApiQuery<{ interviews: Interview[] }>(
    id ? "/api/interviews/aggregate" : null,
    id ? { job_id: id } : undefined,
  );
  // The interview feed carries names, not ids, so scores are matched through
  // the applications for this job — and only for unambiguous names.
  const { data: appData } = useApiQuery<{
    applications: { candidate_id?: string | null; candidates?: { name?: string | null } | null }[];
  }>(id ? "/api/applications" : null, id ? { jobId: id, limit: 200 } : undefined);
  const { data: scoreData } = useApiQuery<{ scores: ScoreRow[] }>(
    id ? "/api/fit-score" : null,
    id ? { jobId: id } : undefined,
  );
  const { data: av } = useApiQuery<{ slots: Slot[] }>(id ? `/api/jobs/${id}/availability` : null, {
    from: new Date().toISOString(),
    to: new Date(Date.now() + 14 * 86_400_000).toISOString(),
  });

  const interviews = iv?.interviews ?? [];
  const open = (av?.slots ?? []).filter((s) => s.status === "available");

  if (!id) return null;

  const scores = indexScoresByCandidate(scoreData?.scores ?? []);
  const nameIndex = candidateIdByUniqueName(appData?.applications ?? []);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-[var(--text)]">Interviews</h1>
          <p className="text-sm text-white/55">
            {loading
              ? "Loading…"
              : `${interviews.length} booked · ${open.length} open slot${open.length === 1 ? "" : "s"} in the next two weeks`}
          </p>
        </div>
        <Link
          href={`/recruit/jobs/${id}/interviews`}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold text-white/70 hover:text-[var(--text)]"
        >
          Manage slots
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
      ) : (
        <>
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/35">
            Booked
          </h2>
          {interviews.length === 0 ? (
            <p className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-6 text-sm text-white/60">
              Nobody booked yet. Open some slots and candidates can pick a time themselves.
            </p>
          ) : (
            <InterviewTable
              rows={interviews}
              scoreFor={(name) => {
                const cid = nameIndex.get((name ?? "").trim().toLowerCase());
                return cid ? (scores.get(cid)?.overall_score ?? null) : null;
              }}
            />
          )}

          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/35">
            Open slots
          </h2>
          {open.length === 0 ? (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-6 text-sm text-white/60">
              No open slots. Without them candidates wait on email back-and-forth, which is where
              days disappear.
            </p>
          ) : (
            <ul className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
              {open.slice(0, 12).map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 border-b border-white/5 px-4 py-2.5 text-sm last:border-b-0"
                >
                  <span className="min-w-0 flex-1 text-white/70">{when(s.start_at)}</span>
                  <span className="shrink-0 text-xs text-emerald-300/70">available</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export default function RecruitV2InterviewsPage() {
  return (
    <SeatGate need="reviewApplications" what="The interview schedule">
      <RecruitV2InterviewsPageBody />
    </SeatGate>
  );
}
