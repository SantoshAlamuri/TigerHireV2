"use client";

import Link from "next/link";
import { useApiQuery } from "@/lib/hooks/use-api";
import { reusableRubrics, type RubricSource } from "@/lib/v2/rubric-reuse";

/**
 * Approved rubrics on other jobs, offered as a starting point.
 *
 * This is the practical half of a shared rubric library: a genuine library
 * needs a schema change, but reusing an already-approved bar needs nothing —
 * and it is what turns twelve separate calibration conversations into one.
 *
 * Only rendered when this job's own rubric is not yet approved, because that
 * is the only moment the suggestion helps.
 */
interface JobRow {
  id: string;
  title: string;
  status?: string | null;
}

export function RubricReuse({ jobId, jobTitle }: { jobId: string; jobTitle: string }) {
  const { data } = useApiQuery<{ jobs: JobRow[] }>("/api/jobs", { limit: 100, page: 1 });

  // The jobs list does not carry rubric state, so each candidate job is asked
  // for its own. Kept to a handful to avoid a fan-out of requests.
  const others = (data?.jobs ?? []).filter((j) => j.id !== jobId).slice(0, 8);

  return (
    <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface)]/30 p-3">
      <p className="text-xs font-semibold text-[var(--text)]">Start from an approved rubric</p>
      <p className="mt-0.5 text-[11px] text-white/45">
        Copying a bar that a hiring manager already signed off is faster than writing one, and keeps
        similar roles consistent.
      </p>
      <ul className="mt-2 space-y-1">
        {others.map((j) => (
          <RubricCandidate key={j.id} jobId={jobId} jobTitle={jobTitle} other={j} />
        ))}
        {others.length === 0 ? (
          <li className="text-[11px] text-white/35">
            No other jobs yet — this rubric will be the first.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/**
 * One candidate job. Renders only if its rubric is actually approved and
 * non-empty — an unapproved bar looks like a decision nobody made.
 */
function RubricCandidate({
  jobId,
  jobTitle,
  other,
}: {
  jobId: string;
  jobTitle: string;
  other: JobRow;
}) {
  const { data } = useApiQuery<{
    jdBase?: {
      approvedBy?: string | null;
      approvedAt?: string | null;
      idealCandidateProfile?: { must_haves?: string[] | null } | null;
    } | null;
  }>("/api/fitscore/jd-base", { jobId: other.id });

  const source: RubricSource = {
    jobId: other.id,
    jobTitle: other.title,
    approvedBy: data?.jdBase?.approvedBy ?? null,
    approvedAt: data?.jdBase?.approvedAt ?? null,
    mustHaveCount: data?.jdBase?.idealCandidateProfile?.must_haves?.length ?? 0,
  };

  const [match] = reusableRubrics(jobId, jobTitle, [source]);
  if (!match) return null;

  return (
    <li>
      <Link
        href={`/recruit/jobs/${other.id}#ideal-profile-setup`}
        className="flex items-center gap-2 rounded px-2 py-1.5 text-xs transition hover:bg-white/[0.04]"
      >
        <span className="min-w-0 flex-1 truncate text-white/75">{match.jobTitle}</span>
        {match.similar ? (
          <span className="shrink-0 rounded-full border border-emerald-400/30 px-1.5 py-0.5 text-[10px] text-emerald-300/80">
            similar role
          </span>
        ) : null}
        <span className="shrink-0 text-[10px] text-white/35">
          {match.mustHaveCount} must-haves · {match.approvedBy}
        </span>
      </Link>
    </li>
  );
}
