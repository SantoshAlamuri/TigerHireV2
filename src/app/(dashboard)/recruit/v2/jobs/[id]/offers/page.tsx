"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useApiQuery } from "@/lib/hooks/use-api";
import { indexScoresByCandidate, type ScoreRow } from "@/lib/v2/score-index";
import { Skeleton } from "@/components/ui/Skeleton";
import { offerState, type OfferRow } from "@/lib/v2/offer-state";
import { SeatGate } from "../../../SeatGate";

/**
 * Offers for a job.
 *
 * The funnel's last stage and the one that loses the most hires, so this shows
 * a state rather than a status: never-opened and opened-repeatedly are
 * different problems and are rendered differently.
 */
interface ApiOffer {
  id: string;
  application_id: string;
  role_title?: string | null;
  status?: string | null;
  signing_status?: string | null;
  sent_at?: string | null;
  first_viewed_at?: string | null;
  view_count?: number | null;
  signed_at?: string | null;
  declined_at?: string | null;
  expires_at?: string | null;
  applications?: { candidate_id?: string; job_id?: string } | null;
}

function RecruitV2OffersPageBody() {
  const { id } = useParams<{ id: string }>();
  const { data, loading } = useApiQuery<{ offers: ApiOffer[] }>(id ? "/api/offers" : null);
  const { data: scoreData } = useApiQuery<{ scores: ScoreRow[] }>(
    id ? "/api/fit-score" : null,
    id ? { jobId: id } : undefined,
  );
  // The offer row carries role_title, not the person's name — it was being
  // rendered as the candidate, so every offer showed the job title instead.
  const { data: appData } = useApiQuery<{
    applications: { candidate_id?: string | null; candidates?: { name?: string | null } | null }[];
  }>(id ? "/api/applications" : null, id ? { jobId: id, limit: 200 } : undefined);
  const scores = indexScoresByCandidate(scoreData?.scores ?? []);
  const nameByCandidate = new Map(
    (appData?.applications ?? [])
      .filter((a) => a.candidate_id)
      .map((a) => [a.candidate_id as string, a.candidates?.name?.trim() || ""]),
  );

  // The offers endpoint is org-wide, so narrow to this job here.
  const mine = (data?.offers ?? []).filter((o) => o.applications?.job_id === id);

  const rows: (OfferRow & { applicationId: string; candidateId: string | null })[] = mine.map(
    (o) => ({
      id: o.id,
      applicationId: o.application_id,
      candidateId: o.applications?.candidate_id ?? null,
      candidateName:
        nameByCandidate.get(o.applications?.candidate_id ?? "") ||
        o.role_title?.trim() ||
        "Candidate",
      status: o.status ?? "draft",
      signingStatus: o.signing_status ?? null,
      sentAt: o.sent_at ?? null,
      firstViewedAt: o.first_viewed_at ?? null,
      viewCount: o.view_count ?? 0,
      signedAt: o.signed_at ?? null,
      declinedAt: o.declined_at ?? null,
      expiresAt: o.expires_at ?? null,
    }),
  );

  if (!id) return null;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-[var(--text)]">Offers</h1>
          <p className="text-sm text-white/55">
            {loading ? "Loading…" : `${rows.length} on this job`}
          </p>
        </div>
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
          No offers yet. They appear here once someone reaches the offer stage.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const s = offerState(r);
            return (
              <li
                key={r.id}
                className={`rounded-xl border bg-[var(--surface)]/40 px-4 py-3 ${
                  s.needsAction ? "border-amber-400/40" : "border-[var(--border)]"
                }`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[var(--text)]">
                      {r.candidateName}
                    </span>
                    <span className="block text-xs text-white/50">{s.hint}</span>
                  </span>
                  {/* The two numbers that say whether this offer should be
                      chased: how strong the candidate is, and what the panel
                      concluded. Panel verdict has no endpoint yet and says so
                      rather than implying the interviews went well. */}
                  <span className="flex shrink-0 gap-4">
                    <span className="text-right">
                      <span className="block text-[9px] font-medium uppercase tracking-wider text-white/40">
                        FitScore
                      </span>
                      <span className="block font-mono text-lg font-semibold tabular-nums text-white/85">
                        {scores.get(r.candidateId ?? "")?.overall_score ?? (
                          <span className="text-white/25">—</span>
                        )}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[9px] font-medium uppercase tracking-wider text-white/40">
                        Panel verdict
                      </span>
                      <span className="block text-xs text-white/35">Not recorded here</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span
                      className={`block text-xs font-semibold ${
                        s.needsAction ? "text-amber-300" : "text-white/60"
                      }`}
                    >
                      {s.stage}
                    </span>
                    <span className="block text-[11px] text-white/35">
                      {r.sentAt ? `day ${s.daysOut}` : "not sent"}
                      {r.viewCount > 0 ? ` · opened ${r.viewCount}×` : ""}
                    </span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function RecruitV2OffersPage() {
  return (
    <SeatGate need="reviewApplications" what="Offers on this job">
      <RecruitV2OffersPageBody />
    </SeatGate>
  );
}
