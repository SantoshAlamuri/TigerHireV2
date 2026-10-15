"use client";

import { useApiQuery } from "@/lib/hooks/use-api";
import { talentMetrics } from "@/lib/v2/ta-metrics";
import type { Verdict } from "@/lib/v2/benchmarks";
import {
  fuseQuality,
  type QualityByJob,
  type PulseByJob,
  type ValidityBand,
} from "@/lib/v2/quality-fusion";
import {
  fuseTimeToHire,
  fuseOfferAcceptance,
  fusePlatformCostPerHire,
  fuseReqsPerRecruiter,
  withBenchmark,
} from "@/lib/v2/analytics-fusion";
import type { V1Analytics } from "./useV1Analytics";
import type { Period } from "@/lib/v2/period";
import type { RollupRow, RollupJob } from "@/lib/v2/analytics-rollup";
import { HeroFigure, StatTile, SectionLabel, Insight } from "./Chrome";

/**
 * The standard TA metric set.
 *
 * A metric with no data shows a dash and says why, rather than a zero. "Time
 * to fill: 0 days" with no hires is not an empty state, it is a false claim —
 * and on a hiring dashboard false numbers get quoted in board decks.
 */
interface OfferRow {
  signed_at?: string | null;
  declined_at?: string | null;
}

/**
 * Metrics that only exist at org level. A hiring manager is scoped to the jobs
 * they own, so these can never populate for them — and rendering four dashes
 * that each explain why is noise, not honesty. Honesty is not showing a metric
 * that does not apply to the seat.
 */
const ORG_ONLY = new Set(["Platform cost / hire", "Reqs per recruiter", "Cost per hire"]);

export function TalentMetricsGrid({
  v1,
  period,
  seatScope = "org",
  rows,
  jobs,
  openJobCount,
}: {
  v1: V1Analytics;
  period: Period;
  seatScope?: "org" | "own-jobs";
  /**
   * Every application in the period. Previously this component fetched its own
   * `/api/applications?limit=200` — which the route silently served as 100 —
   * so "screened automatically" was a percentage of a page, and time to fill
   * was measured over whichever hundred rows arrived first.
   */
  rows: RollupRow[];
  jobs: Record<string, RollupJob>;
  /**
   * Open requisitions, counted exactly. Was the length of `/api/jobs?limit=100`,
   * which caps at 100 — so fill rate divided by 100 for any org above that.
   * Null when the count could not be read; fill rate then goes unreported
   * rather than dividing by a guess.
   */
  openJobCount: number | null;
}) {
  const { data: offers } = useApiQuery<{ offers: OfferRow[] }>("/api/offers");

  const { data: qoh } = useApiQuery<{
    qualityByJob: QualityByJob[];
    pulseByJob: PulseByJob[];
    predictiveValidity: ValidityBand[];
  }>("/api/analytics/quality-of-hire");
  const outcomes = fuseQuality(
    qoh?.qualityByJob ?? [],
    qoh?.pulseByJob ?? [],
    qoh?.predictiveValidity ?? [],
  );

  // Until the open-job count resolves, openJobs is 0 and fill rate asserts "No
  // open roles" — a false statement, briefly, in the same category as every
  // other fabricated zero on this screen. Hold the grid rather than flash it.
  const counting = openJobCount === null;
  const openJobs = openJobCount ?? 0;
  const m = talentMetrics({
    applications: rows.map((a) => ({
      status: a.status ?? "applied",
      createdAt: a.createdAt,
      // applications.offer_accepted_at is the acceptance timestamp — the only
      // real hire date the schema carries.
      hiredAt: a.offerAcceptedAt,
      jobCreatedAt: jobs[a.jobId]?.createdAt ?? null,
      source: a.source,
    })),
    offers: (offers?.offers ?? []).map((o) => ({
      signedAt: o.signed_at ?? null,
      declinedAt: o.declined_at ?? null,
    })),
    openJobs,
    recruiters: 0,
    // Counted from the answers actually present. Passing 0 here previously made
    // the tile assert "0% screened" without ever measuring — a fabricated zero,
    // and the worst kind, because it looks like a finding about the process.
    screeningAnswered: rows.filter((a) => a.screened).length,
    // How many screening messages went out is not exposed to this screen, so
    // reply rate stays unmeasurable rather than dividing by a guess.
    screeningSent: 0,
    spend: null,
    retained: null,
    hmRatings: [],
  });

  // Where a v1 endpoint answers the question over the whole org, its answer
  // wins — it is windowed by the same period and aggregated in SQL.
  const tiles = [
    withBenchmark(m.timeToFill, "timeToFill"),
    withBenchmark(fuseTimeToHire(v1.timeToHire), "timeToHire"),
    withBenchmark(fuseOfferAcceptance(v1.offers), "offerAcceptance"),
    m.fillRate,
    fusePlatformCostPerHire(v1.cost),
    m.screenedAutomatically,
    withBenchmark(
      v1.reach
        ? {
            label: "Candidate reply rate",
            value: v1.reach.replyRate,
            unit: "%",
            note:
              v1.reach.sent > 0
                ? `${v1.reach.replied} of ${v1.reach.sent} messaged replied`
                : "No screening questions sent yet",
            tone: "plain" as const,
          }
        : m.candidateReplyRate,
      "candidateReplyRate",
    ),
    fuseReqsPerRecruiter(v1.recruiters, openJobs),
    outcomes.qualityOfHire,
    outcomes.retention90,
    outcomes.hmSatisfaction,
    outcomes.fitScoreValidity,
  ];
  // A seat scoped to its own jobs never gets the org-level metrics, so they are
  // dropped rather than rendered as four self-explaining dashes.
  const visible = seatScope === "own-jobs" ? tiles.filter((t) => !ORG_ONLY.has(t.label)) : tiles;
  const unmeasurable = visible.filter((t) => t.value === null).length;
  const measured = visible.filter((t) => t.value !== null).length;
  const [a, b, c, d, ...rest] = visible;
  // Only where a list actually exists. A tile that navigates nowhere useful is
  // worse than one that does not pretend to.
  const HREF: Record<string, string> = {
    "Time to fill": "/recruit/v2/jobs",
    "Time to hire": "/recruit/v2/jobs",
    "Fill rate": "/recruit/v2/jobs",
    "Reqs per recruiter": "/recruit/v2/jobs",
  };

  if (counting) {
    return (
      <div className="mb-4">
        <SectionLabel>Headline · {period.label}</SectionLabel>
        <div className="h-[104px] animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]/30" />
      </div>
    );
  }

  return (
    <div className="mb-4">
      <SectionLabel>Headline · {period.label}</SectionLabel>
      <div className="flex flex-wrap rounded-xl border border-[var(--border)] bg-[var(--surface)]/30">
        {[a, b, c, d].map((t, i) => (
          <div
            key={t.label}
            className={
              i > 0
                ? "min-w-[200px] flex-1 border-l border-[var(--border)]"
                : "min-w-[200px] flex-1"
            }
          >
            <HeroFigure
              label={t.label}
              value={t.value}
              unit={t.unit}
              note={t.note}
              verdict={("verdict" in t ? t.verdict : "unknown") as Verdict}
              href={HREF[t.label]}
              target={"target" in t ? (t.target as string | null) : null}
            />
          </div>
        ))}
      </div>

      <SectionLabel>Efficiency, load and quality</SectionLabel>
      <div className="grid gap-px overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-4">
        {rest.map((t) => (
          <StatTile
            key={t.label}
            label={t.label}
            value={t.value}
            unit={t.unit}
            note={t.note}
            tone={t.tone === "warn" ? "warn" : undefined}
          />
        ))}
      </div>
      {unmeasurable > 0 ? (
        <Insight>
          <strong className="text-white/80">
            {measured} of {visible.length} measurable for {period.label}.
          </strong>{" "}
          Time to hire, offer acceptance, platform cost and recruiter load are read from the
          server-side reports across your whole organisation — not from a sample of this page. The
          remaining {unmeasurable} each state what is missing rather than showing a zero, because a
          zero here is indistinguishable from a real result and gets quoted as one.
        </Insight>
      ) : null}
    </div>
  );
}
