"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useApiQuery } from "@/lib/hooks/use-api";
import { pickScoreFor, type ScoreRow } from "@/lib/v2/score-index";
import {
  CandidateIntelligenceRecord,
  EvidenceColumnsProfile,
  ProfileLogs,
  ScoreSubStats,
} from "./ProfileDepth";
import { Skeleton } from "@/components/ui/Skeleton";
import { scoreDisplay } from "@/lib/v2/score-display";
import { buildCandidateSummary } from "@/lib/v2/candidate-summary";
import { indianPhone, phoneHref } from "@/lib/v2/phone";
import { SeatGate } from "../../SeatGate";

/**
 * Candidate profile — v2.
 *
 * The score shown here is the STORED score, and the band is derived from it.
 * Any number embedded in the stored narrative is stripped, because those
 * strings were written at scoring time and go stale: a real row holds
 * overall_score 53 with prose claiming "FitScore 56". Where they disagree we
 * say so rather than letting two numbers argue on screen.
 */
interface AppRow {
  id: string;
  job_id: string;
  status?: string | null;
  created_at?: string | null;
  notice_period_days?: number | null;
  current_ctc_lpa?: number | null;
  expected_ctc_lpa?: number | null;
  offers_in_hand?: number | null;
  jobs?: { title?: string | null } | null;
  candidates?: {
    name?: string | null;
    phone?: string | null;
    location?: string | null;
    experience_years?: number | null;
    skills?: string[] | null;
  } | null;
  fit_scores?: { overall_score?: number | null; one_line_summary?: string | null } | null;
}

const TONE: Record<string, string> = {
  strong: "text-emerald-300",
  good: "text-emerald-300/80",
  moderate: "text-amber-300",
  weak: "text-red-300",
  none: "text-white/40",
};

function RecruitV2CandidatePageBody() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const backTo = search.get("returnTo") ?? "/recruit/v2/candidates";

  const { data, loading } = useApiQuery<{ applications: AppRow[] }>(
    id ? "/api/applications" : null,
    id ? { candidateId: id, limit: 20 } : undefined,
  );

  // The embedded fit_scores join is keyed off applications.fit_score_id, which
  // is null on every row — so the score has to be fetched by candidate.
  const { data: scoreData } = useApiQuery<{ scores: ScoreRow[] }>(
    id ? "/api/fit-score" : null,
    id ? { candidateId: id } : undefined,
  );

  const apps = data?.applications ?? [];
  const primary = apps[0];
  const c = primary?.candidates;
  const score = pickScoreFor(scoreData?.scores ?? [], primary?.job_id);
  const sd = scoreDisplay(score?.overall_score, score?.one_line_summary, score?.band);
  const summary = buildCandidateSummary({
    experienceYears: c?.experience_years,
    location: c?.location,
    noticePeriodDays: primary?.notice_period_days,
    expectedCtcLpa: primary?.expected_ctc_lpa,
    offersInHand: primary?.offers_in_hand,
    skills: c?.skills,
    appliedAt: primary?.created_at,
  });

  if (!id) return null;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-[var(--text)]">
            {loading ? "…" : c?.name?.trim() || "Candidate"}
          </h1>
          <p className="text-sm text-white/55">
            {summary.parts.length > 0 ? summary.parts.join(" · ") : "No details captured yet"}
          </p>
        </div>
        <Link
          href={backTo.startsWith("/recruit/v2") ? backTo : "/recruit/v2/candidates"}
          className="text-sm font-semibold text-white/60 hover:text-[var(--text)]"
        >
          ← Back
        </Link>
      </div>

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : !primary ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-6 text-sm text-white/60">
          No applications found for this candidate.
        </p>
      ) : (
        <>
          <div className="mb-3 grid gap-3 md:grid-cols-[auto_1fr]">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 px-6 py-4 text-center">
              <div className="text-[10px] font-medium uppercase tracking-wider text-white/40">
                FitScore
              </div>
              <div
                className={`font-mono text-5xl font-semibold tabular-nums ${TONE[sd.band.tone]}`}
              >
                {sd.score ?? "—"}
              </div>
              <div className={`text-xs font-semibold ${TONE[sd.band.tone]}`}>{sd.band.label}</div>
              <ScoreSubStats score={score} />
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4">
              <h2 className="text-sm font-bold text-[var(--text)]">Why this score</h2>
              <p className="mt-1 text-sm leading-relaxed text-white/70">
                {sd.narrative || "No scoring narrative stored for this candidate."}
              </p>
              {sd.staleNarrativeScore !== null ? (
                <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/[0.06] px-3 py-2 text-[11px] text-amber-200/90">
                  This explanation was written when the score read{" "}
                  <strong>{sd.staleNarrativeScore}</strong>, before calibration. The score above (
                  {sd.score}) is the current, authoritative one — the wording is kept for context.
                </p>
              ) : null}
            </div>
          </div>

          <CandidateIntelligenceRecord apps={apps} score={score} />

          <EvidenceColumnsProfile score={score} />

          <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                {
                  k: "Notice",
                  v:
                    primary.notice_period_days == null
                      ? "—"
                      : primary.notice_period_days === 0
                        ? "Immediate"
                        : `${primary.notice_period_days} days`,
                },
                {
                  k: "Current CTC",
                  v: primary.current_ctc_lpa ? `₹${primary.current_ctc_lpa}L` : "—",
                },
                {
                  k: "Expected CTC",
                  v: primary.expected_ctc_lpa ? `₹${primary.expected_ctc_lpa}L` : "—",
                },
                { k: "Phone", v: indianPhone(c?.phone), href: phoneHref(c?.phone) },
              ] as { k: string; v: string; href?: string | null }[]
            ).map((f) => (
              <div
                key={f.k}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 px-4 py-3"
              >
                <div className="text-[10px] font-medium uppercase tracking-wider text-white/40">
                  {f.k}
                </div>
                {f.href ? (
                  <a
                    href={f.href}
                    className="text-sm font-semibold text-[var(--accent)] hover:underline"
                  >
                    {f.v}
                  </a>
                ) : (
                  <div className="text-sm font-semibold text-[var(--text)]">{f.v}</div>
                )}
              </div>
            ))}
          </div>

          {c?.skills && c.skills.length > 0 ? (
            <div className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4">
              <h2 className="mb-2 text-sm font-bold text-[var(--text)]">Skills</h2>
              <div className="flex flex-wrap gap-1.5">
                {c.skills.slice(0, 24).map((s) => (
                  <span
                    key={s}
                    className="rounded border border-[var(--border)] px-2 py-0.5 text-xs text-white/65"
                  >
                    {s}
                  </span>
                ))}
                {c.skills.length > 24 ? (
                  <span className="px-1 py-0.5 text-xs text-white/35">
                    +{c.skills.length - 24} more
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4">
            <h2 className="mb-2 text-sm font-bold text-[var(--text)]">
              Applications ({apps.length})
            </h2>
            <ul className="divide-y divide-white/5">
              {apps.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
                  <Link
                    href={`/recruit/jobs/${a.job_id}`}
                    className="min-w-0 flex-1 truncate text-white/80 hover:text-[var(--accent)]"
                  >
                    {a.jobs?.title || "Untitled job"}
                  </Link>
                  <span className="shrink-0 text-xs capitalize text-white/50">
                    {a.status ?? "applied"}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href={`/recruit/candidates/${id}`}
              className="mt-3 inline-block text-xs font-semibold text-white/45 hover:text-[var(--accent)]"
            >
              Full record (CV versions, notes, comms) →
            </Link>
          </div>
          <ProfileLogs appliedAt={primary.created_at} status={primary.status} />
        </>
      )}
    </section>
  );
}

export default function RecruitV2CandidatePage() {
  return (
    <SeatGate need="viewAllCandidates" what="The full candidate profile">
      <RecruitV2CandidatePageBody />
    </SeatGate>
  );
}
