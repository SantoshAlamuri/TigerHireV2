"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useApiQuery } from "@/lib/hooks/use-api";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  approvalLine,
  bands,
  clearRate,
  weightRows,
  weightsSumTo100,
  type FitThresholds,
  type RubricWeights,
} from "@/lib/v2/rubric-detail";
import { SeatGate } from "../../../SeatGate";

/**
 * One rubric, in full: what the score is made of, what the number means, and
 * who signed for it.
 *
 * This is the page that answers "why did she get 79?" months after the fact.
 * Every figure here is read from the rubric that actually produced the scores —
 * nothing is illustrative, and anything that cannot be computed says so rather
 * than showing a zero, because a zero on this page reads as a verdict on the bar.
 */
interface JdBase {
  roleTitle: string | null;
  weights: RubricWeights | null;
  fitThresholds: FitThresholds | null;
  scoreFloor: number | null;
  version: number;
  approvedBy: string | null;
  approvedAt: string | null;
}

interface RubricRow {
  jobId: string;
  jobTitle: string;
  version: number;
  approverName: string | null;
  approvedAt: string | null;
}

interface AppRow {
  id: string;
  fit_scores?: { overall_score?: number | null } | null;
}

function RubricDetailPageBody() {
  const params = useParams<{ jobId: string }>();
  const jobId = params?.jobId;

  const { data, loading } = useApiQuery<{ jdBase: JdBase | null; jobTitle?: string }>(
    jobId ? "/api/fitscore/jd-base" : null,
    jobId ? { jobId } : undefined,
  );
  // The approver's name lives on the library endpoint, which resolves profiles
  // in one lookup; jd-base returns only the id.
  const { data: libraryData } = useApiQuery<{ rubrics: RubricRow[] }>("/api/fitscore/rubrics");
  const { data: appsData } = useApiQuery<{ applications: AppRow[] }>(
    jobId ? "/api/applications" : null,
    jobId ? { jobId, limit: 100 } : undefined,
  );

  const rubric = data?.jdBase ?? null;
  const jobTitle = data?.jobTitle ?? rubric?.roleTitle ?? "This role";
  const approverName = libraryData?.rubrics?.find((r) => r.jobId === jobId)?.approverName ?? null;

  const rows = useMemo(() => weightRows(rubric?.weights), [rubric]);
  const scoreBands = useMemo(() => bands(rubric?.fitThresholds), [rubric]);
  const rate = useMemo(
    () =>
      clearRate(
        (appsData?.applications ?? []).map((a) => a.fit_scores?.overall_score ?? null),
        rubric?.fitThresholds ?? null,
      ),
    [appsData, rubric],
  );

  const approval = approvalLine(approverName, rubric?.approvedAt ?? null);
  const sums = weightsSumTo100(rubric?.weights);

  if (loading) return <Skeleton className="h-64 w-full" />;

  if (!rubric) {
    return (
      <section className="max-w-3xl">
        <h1 className="text-xl font-bold text-[var(--text)]">No rubric on this job</h1>
        <p className="mt-2 text-sm text-white/60">
          Until one is built and approved, this job scores on the generic bar — every applicant is
          measured against a role description rather than the bar you set.
        </p>
        <Link
          href={`/recruit/jobs/${jobId}/setup`}
          className="mt-4 inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black"
        >
          Build it in Job Setup
        </Link>
      </section>
    );
  }

  return (
    <section className="max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-[var(--text)]">
            {jobTitle} rubric v{rubric.version}
          </h1>
          <p className={`text-sm ${approval.approved ? "text-white/55" : "text-amber-300/80"}`}>
            Hiring Setup › Rubric library · {approval.text}
          </p>
        </div>
        <Link
          href="/recruit/v2/setup/rubric"
          className="text-sm font-semibold text-white/60 hover:text-[var(--text)]"
        >
          ← Rubric library
        </Link>
      </div>

      <div className="mb-5 grid gap-px overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--border)] sm:grid-cols-3">
        <div className="bg-[var(--surface)]/60 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-white/40">Status</p>
          <p
            className={`font-mono text-lg font-semibold ${approval.approved ? "text-emerald-300" : "text-amber-300"}`}
          >
            v{rubric.version} {approval.approved ? "live" : "draft"}
          </p>
          <p className="text-[11px] text-white/50">{approval.text}</p>
        </div>
        <div className="bg-[var(--surface)]/60 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-white/40">Scored with it</p>
          <p className="font-mono text-lg font-semibold text-[var(--text)]">{rate.scored}</p>
          <p className="text-[11px] text-white/50">
            {rate.scored === 0
              ? "nobody scored yet"
              : rate.scored >= 100
                ? "of the 100 most recent"
                : "applicants on this job"}
          </p>
        </div>
        <div className="bg-[var(--surface)]/60 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-white/40">Clear rate</p>
          <p
            className={`font-mono text-lg font-semibold ${
              rate.verdict === "healthy"
                ? "text-emerald-300"
                : rate.verdict === null
                  ? "text-white/40"
                  : "text-amber-300"
            }`}
          >
            {rate.pct === null ? "—" : `${rate.pct}%`}
          </p>
          <p className="text-[11px] text-white/50">
            {rate.verdict === null
              ? "not enough scored to say"
              : `${rate.cleared} of ${rate.scored} · ${rate.verdict} (healthy 15–30%)`}
          </p>
        </div>
      </div>

      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/35">
        Weights — what the score is made of
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4 text-sm text-white/60">
          This rubric carries no weights, so scoring falls back to the generic bar.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
          <table className="w-full min-w-[420px] border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] text-left">
                <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-white/40">
                  Dimension
                </th>
                <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-white/40">
                  Weight
                </th>
                <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-white/40">
                  Share of the score
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-white/5 last:border-b-0">
                  <td className="px-3 py-2 text-sm font-medium text-[var(--text)]">{r.label}</td>
                  <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-white/70">
                    {r.weight}
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
                        <span
                          className="block h-full bg-[var(--accent)]"
                          style={{ width: `${r.share}%` }}
                        />
                      </span>
                      <span className="font-mono text-xs tabular-nums text-white/50">
                        {r.share}%
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && !sums ? (
        <p className="mt-2 text-xs text-amber-300/80">
          These weights do not sum to 100, so each dimension&apos;s real share is shown rather than
          its raw number.
        </p>
      ) : null}

      <h2 className="mb-2 mt-6 text-[11px] font-medium uppercase tracking-wider text-white/35">
        Thresholds — what the number means
      </h2>
      {scoreBands.length === 0 ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4 text-sm text-white/60">
          No thresholds set, so no score on this job carries a verdict.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
          {scoreBands.map((b) => (
            <li
              key={b.label}
              className="flex flex-wrap items-center gap-3 border-b border-white/5 px-4 py-2.5 last:border-b-0"
            >
              <span
                className={`w-20 shrink-0 font-mono text-sm font-semibold tabular-nums ${
                  b.tone === "good"
                    ? "text-emerald-300"
                    : b.tone === "mid"
                      ? "text-amber-300"
                      : "text-red-300"
                }`}
              >
                {b.range}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-[var(--text)]">{b.label}</span>
                <span className="block text-xs text-white/45">{b.meaning}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href={`/recruit/jobs/${jobId}/setup`}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black"
        >
          Propose a change (goes to approval)
        </Link>
        <Link
          href="/recruit/jobs"
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-white/70 hover:text-[var(--text)]"
        >
          Clone for a new job
        </Link>
      </div>
      <p className="mt-3 text-xs text-white/40">
        Changing weights or thresholds resets approval — scores already stamped keep the version
        that produced them, so an old decision stays explainable.
      </p>
    </section>
  );
}

export default function RubricDetailPage() {
  return (
    <SeatGate need="editJobSetup" what="The scoring rubric">
      <RubricDetailPageBody />
    </SeatGate>
  );
}
