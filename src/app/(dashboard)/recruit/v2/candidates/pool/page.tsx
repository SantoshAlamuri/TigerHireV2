"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApiQuery } from "@/lib/hooks/use-api";
import { Skeleton } from "@/components/ui/Skeleton";
import { REJECT_REASONS } from "@/lib/v2/review-queue";
import {
  buildPoolRows,
  countByReason,
  reasonLabel,
  type OpenJob,
  type PoolCandidate,
} from "@/lib/v2/talent-pool";
import { SeatGate } from "../../SeatGate";

/**
 * Talent pool — people rejected with a reason, kept usable.
 *
 * 380 CVs per job is only an asset if rejections stay queryable. Because every
 * reject carries a structured reason, "rejected on compensation at ₹30L" is the
 * first place to look when a ₹40L role opens — and the "Fit for" column says
 * which open role that is, judged only against the thing that blocked them.
 *
 * All the judgement lives in lib/v2/talent-pool (unit-tested, including the
 * rupees-vs-lakhs conversion that would otherwise mark every band as fitting).
 */
interface ApiRow {
  id: string;
  candidate_id: string;
  job_id: string;
  status?: string | null;
  rejection_reason?: string | null;
  expected_ctc_lpa?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  jobs?: { title?: string | null } | null;
  candidates?: { name?: string | null; location?: string | null } | null;
  fit_scores?: { overall_score?: number | null } | null;
}

interface JobApiRow {
  id: string;
  title?: string | null;
  status?: string | null;
  location?: string | null;
  compensation_min?: number | null;
  compensation_max?: number | null;
}

const POOLABLE = new Set(REJECT_REASONS.filter((r) => r.poolable).map((r) => r.id));

function RecruitV2TalentPoolPageBody() {
  const [reason, setReason] = useState<string | null>(null);
  const { data, loading } = useApiQuery<{ applications: ApiRow[] }>("/api/applications", {
    status: "rejected",
    limit: 100,
  });
  // Open roles are what makes the pool actionable rather than an archive.
  const { data: jobsData } = useApiQuery<{ jobs: JobApiRow[] }>("/api/jobs", {
    status: "open",
    limit: 50,
  });

  const openJobs = useMemo<OpenJob[]>(
    () =>
      (jobsData?.jobs ?? []).map((j) => ({
        id: j.id,
        title: j.title ?? "Untitled job",
        compensationMin: j.compensation_min ?? null,
        compensationMax: j.compensation_max ?? null,
        location: j.location ?? null,
      })),
    [jobsData],
  );

  const candidates = useMemo<PoolCandidate[]>(
    () =>
      (data?.applications ?? []).map((a) => ({
        applicationId: a.id,
        candidateId: a.candidate_id,
        name: a.candidates?.name?.trim() || "Unknown candidate",
        jobTitle: a.jobs?.title ?? "Untitled job",
        score: a.fit_scores?.overall_score ?? null,
        rejectionReason: a.rejection_reason ?? null,
        expectedCtcLpa: a.expected_ctc_lpa ?? null,
        location: a.candidates?.location ?? null,
        rejectedAt: a.updated_at ?? a.created_at ?? null,
      })),
    [data],
  );

  const counts = useMemo(() => countByReason(candidates), [candidates]);
  const rows = useMemo(
    () =>
      buildPoolRows(
        reason
          ? candidates.filter((c) => (c.rejectionReason?.trim() || "unspecified") === reason)
          : candidates,
        openJobs,
      ),
    [candidates, openJobs, reason],
  );

  const toneClass = (tone: string) =>
    tone === "fits"
      ? "bg-emerald-400/15 text-emerald-300"
      : tone === "stretch"
        ? "bg-amber-400/15 text-amber-300"
        : "bg-white/5 text-white/40";

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-[var(--text)]">
            Talent pool{candidates.length > 0 ? ` — ${candidates.length}` : ""}
          </h1>
          <p className="text-sm text-white/55">
            {loading ? "Loading…" : "rejected with a reason, reusable"}
          </p>
        </div>
        <Link
          href="/recruit/candidates"
          className="text-sm font-semibold text-white/60 hover:text-[var(--text)]"
        >
          ← Candidates
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setReason(null)}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
            reason === null
              ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
              : "border-[var(--border)] text-white/60"
          }`}
        >
          All ({candidates.length})
        </button>
        {Object.entries(counts).map(([key, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setReason(key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              reason === key
                ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                : "border-[var(--border)] text-white/60"
            }`}
          >
            {reasonLabel(key === "unspecified" ? null : key)} ({count})
            {POOLABLE.has(key) ? <span className="ml-1 text-emerald-300/80">·</span> : null}
          </button>
        ))}
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-6 text-sm text-white/60">
          Nobody here yet. Rejections made in Application Review land in this pool with their
          reason, so they stay reusable for future roles.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] text-left">
                <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-white/40">
                  Candidate
                </th>
                <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-white/40">
                  Score then
                </th>
                <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-white/40">
                  Rejected from
                </th>
                <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-white/40">
                  Reason detail
                </th>
                <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-white/40">
                  When
                </th>
                <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-white/40">
                  Fit for
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.applicationId} className="border-b border-white/5 last:border-b-0">
                  <td className="px-3 py-2 text-sm font-semibold">
                    <Link
                      href={`/recruit/candidates/${r.candidateId}?returnTo=${encodeURIComponent("/recruit/v2/candidates/pool")}`}
                      className="text-[var(--text)] hover:text-[var(--accent)]"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-white/70">
                    {r.score ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-sm text-white/70">{r.jobTitle}</td>
                  <td className="px-3 py-2 text-sm text-white/70">{r.reasonDetail}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-white/50">
                    {r.when ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded px-2 py-0.5 font-mono text-[10px] ${toneClass(r.fitFor.tone)}`}
                    >
                      {r.fitFor.label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-white/40">
        Consent is re-confirmed on invite (DPDP) — re-engagement runs on WhatsApp.
      </p>
    </section>
  );
}

export default function RecruitV2TalentPoolPage() {
  return (
    <SeatGate need="viewAllCandidates" what="The talent pool">
      <RecruitV2TalentPoolPageBody />
    </SeatGate>
  );
}
