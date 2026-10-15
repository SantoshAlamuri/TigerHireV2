"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useApiQuery } from "@/lib/hooks/use-api";
import { Skeleton } from "@/components/ui/Skeleton";
import { buildBrief } from "@/lib/v2/hm-interview";
import { scorePanel } from "@/lib/v2/score-panel";
import { SeatGate } from "../../../SeatGate";

/**
 * Interview brief.
 *
 * Its job is to stop the panel re-asking what WhatsApp already answered — the
 * most common complaint candidates make about multi-round interviews — and to
 * point the round at what is actually unproven.
 *
 * Compensation is withheld from the panel by construction: an interviewer who
 * knows the number judges differently, and negotiating it is the recruiter's.
 */
interface ScoreRow {
  overall_score?: number | null;
  ideal_match_pct?: number | null;
  market_percentile?: number | null;
  market_label?: string | null;
  amber_flags?: (string | null)[] | null;
  evidence_json?: { quotes?: { quote?: string; location_hint?: string }[] } | null;
}

interface Row {
  job_id: string;
  candidates?: {
    name?: string | null;
    location?: string | null;
    experience_years?: number | null;
  } | null;
}

function Col({
  title,
  tone,
  lines,
  empty,
}: {
  title: string;
  tone: "g" | "a" | "r";
  lines: { text: string; citation: string }[];
  empty: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]/40">
      <h3
        className={`flex items-center justify-between border-b border-[var(--border)] px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider ${
          tone === "g"
            ? "bg-emerald-500/[0.07] text-emerald-300"
            : tone === "a"
              ? "bg-amber-500/[0.07] text-amber-300"
              : "bg-red-500/[0.06] text-red-300"
        }`}
      >
        <span>{title}</span>
        <span className="font-mono">{lines.length || "·"}</span>
      </h3>
      {lines.length === 0 ? (
        <p className="px-3 py-2.5 text-xs text-white/40">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2 px-3 py-2.5">
          {lines.map((l, i) => (
            <li key={i} className="text-xs leading-relaxed text-white/70">
              <span className="text-[var(--text)]">{l.text}</span>
              <span className="mt-0.5 block font-mono text-[10px] text-white/35">{l.citation}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecruitV2BriefPageBody() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const jobId = search.get("job") ?? "";

  const { data, loading } = useApiQuery<{ applications: Row[] }>(
    id ? "/api/applications" : null,
    id ? { candidateId: id, limit: 5 } : undefined,
  );
  // applications.fit_score_id is unpopulated (0 of 111 rows on preview), so the
  // embedded fit_scores join is always empty. Scores are fetched the way the
  // rest of the product fetches them: by candidate.
  const { data: scoreData } = useApiQuery<{ scores: ScoreRow[] }>(
    id ? "/api/fit-score" : null,
    id ? { candidateId: id } : undefined,
  );

  const { data: jdBase } = useApiQuery<{
    jdBase?: { idealCandidateProfile?: { must_haves?: string[] | null } | null } | null;
  }>(jobId ? "/api/fitscore/jd-base" : null, jobId ? { jobId } : undefined);

  const app = data?.applications?.[0];
  const fs = scoreData?.scores?.[0];
  const scores = scorePanel({
    overallScore: fs?.overall_score ?? null,
    idealMatchPct: fs?.ideal_match_pct ?? null,
    marketPercentile: fs?.market_percentile ?? null,
    marketLabel: fs?.market_label ?? null,
    greenFlags: null,
    amberFlags: null,
    redFlags: null,
  });

  const brief = buildBrief({
    evidenceQuotes: (fs?.evidence_json?.quotes ?? [])
      .filter((q) => q.quote)
      .map((q) => ({ quote: String(q.quote), source: q.location_hint?.trim() || "CV" })),
    mustHaves: jdBase?.jdBase?.idealCandidateProfile?.must_haves ?? [],
    amberFlags: (fs?.amber_flags ?? []).filter(Boolean).map(String),
  });

  if (!id) return null;

  return (
    <section className="max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-[var(--text)]">
            Interview brief — {loading ? "…" : (app?.candidates?.name?.trim() ?? "Candidate")}
          </h1>
          <p className="text-sm text-white/55">
            {app?.candidates?.experience_years ? `${app.candidates.experience_years} yrs · ` : ""}
            {app?.candidates?.location ?? ""}
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
          <div className="mb-3 flex gap-2">
            {[scores.fit, scores.icp].map((c, i) => (
              <div
                key={c.label}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 px-5 py-3 text-center"
              >
                <div className="text-[9px] font-medium uppercase tracking-wider text-white/40">
                  {c.label}
                </div>
                <div
                  className={`font-mono font-semibold tabular-nums ${i === 0 ? "text-3xl text-emerald-300" : "text-xl text-[var(--text)]"}`}
                >
                  {c.value}
                </div>
              </div>
            ))}
          </div>

          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/35">
            Your round&apos;s job — verify what the CV claims
          </h2>
          <div className="grid gap-2 md:grid-cols-3">
            <Col
              title="Already evidenced"
              tone="g"
              lines={brief.evidenced}
              empty="Nothing quoted yet."
            />
            <Col
              title="Probe in your round"
              tone="a"
              lines={brief.probe}
              empty="Nothing outstanding."
            />
            <Col
              title="Off-limits"
              tone="r"
              lines={brief.offLimits.map((t) => ({ text: t, citation: "panel policy" }))}
              empty=""
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
            <Link
              href={`/recruit/v2/candidates/${id}/scorecard${jobId ? `?job=${jobId}` : ""}`}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black"
            >
              Open scorecard
            </Link>
            <Link
              href={`/recruit/candidates/${id}`}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-white/75"
            >
              Full profile
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

export default function RecruitV2BriefPage() {
  return (
    <SeatGate need="submitFeedback" what="The interview brief">
      <RecruitV2BriefPageBody />
    </SeatGate>
  );
}
