"use client";

import { useMemo } from "react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  portfolioRows,
  portfolioSummary,
  UNEVALUATED_SIGNALS,
  type JobApplicantCounts,
  type OfferOutcomes,
  type PortfolioJob,
} from "@/lib/v2/ta-portfolio";
import { JobsViewSwitch } from "@/components/dashboard/JobsViewSwitch";
import { SeatGate } from "../SeatGate";
import { BlockerTable } from "./BlockerTable";
import { PortfolioSummaryStrip } from "./PortfolioSummary";

/**
 * Portfolio — every open job, what is blocking it, and whose name is on that.
 *
 * The screen a Head of Talent takes into a budget conversation. It did not
 * exist in the product: there was an analytics page of aggregate rates and a
 * per-job workspace, and nothing in between that said "these four roles are
 * stuck, here is on whom".
 *
 * Blockers are derived from data, never from a status somebody typed and forgot
 * to update. Where a signal could not be checked the page says so — a job shown
 * as on track when nothing looked at its offers is a false all-clear.
 *
 * The counting happens in `/api/portfolio`, not here. This page used to read
 * three list endpoints and count the rows it received; one of them caps at 100
 * results, so its applicant counts were a first page presented as a total.
 */
interface PortfolioApiJob extends PortfolioJob {
  counts: JobApplicantCounts;
}

interface PortfolioApiResponse {
  jobs: PortfolioApiJob[];
  /** Null when the offer counts could not be read — the rate goes unreported. */
  offers: OfferOutcomes | null;
  /** False when counting stopped at the safety cap; the page says so. */
  complete: boolean;
}

/**
 * The strapline read "every blocker has an owner" above a table where every row
 * said "unassigned" — and always would, because no owner name was available to
 * the page at all. It reports the state now, and makes the claim only when the
 * claim is true.
 */
function ownerLine(openJobs: number, unassigned: number): string {
  const open = `${openJobs} open`;
  if (openJobs === 0) return open;
  if (unassigned === 0) return `${open} · every blocker has an owner`;
  if (unassigned === openJobs) return `${open} · none has an owner`;
  return `${open} · ${unassigned} without an owner`;
}

function TalentPortfolioPageBody() {
  const { data, loading, error, refetch } = useApiQuery<PortfolioApiResponse>("/api/portfolio");

  const { rows, summary, offers, complete } = useMemo(() => {
    const now = Date.now();
    const apiJobs = data?.jobs ?? [];
    const jobs: PortfolioJob[] = apiJobs.map((j) => ({
      id: j.id,
      title: j.title,
      createdAt: j.createdAt,
      ownerName: j.ownerName,
      rubricApproved: j.rubricApproved,
      threshold: j.threshold,
    }));
    const counts = new Map(apiJobs.map((j) => [j.id, j.counts]));
    const computed = portfolioRows(jobs, counts, now);
    return {
      rows: computed,
      summary: portfolioSummary(jobs, computed, now),
      offers: data?.offers ?? null,
      complete: data?.complete ?? true,
    };
  }, [data]);

  const unassigned = rows.filter((r) => r.owner === "unassigned").length;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-[var(--text)]">Portfolio</h1>
          <p className="text-sm text-white/55">
            {error
              ? "Portfolio unavailable"
              : loading || !data
                ? "Loading…"
                : ownerLine(summary.openJobs, unassigned)}
          </p>
        </div>
        {/* Reached from the Jobs list, and this is the way back — the strip that
            used to carry both links is gone. SeatGate above means anyone
            rendering this body already has `viewPortfolio`. */}
        <JobsViewSwitch current="portfolio" />
      </div>

      {data && !loading && !error && <PortfolioSummaryStrip summary={summary} offers={offers} />}

      <h2 className="mb-2 text-sm font-semibold text-[var(--text)]">Where each job is stuck</h2>
      {error ? (
        <div role="alert" className="workspace-panel">
          <p className="text-sm">Could not load the hiring portfolio.</p>
          <Button variant="secondary" className="mt-3" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : loading || !data ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-6 text-sm text-white/60">
          No open jobs.
        </p>
      ) : (
        <BlockerTable rows={rows} />
      )}

      {!complete && (
        <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-200">
          Applicant counts are partial — this org has more applications than one read covers, so the
          numbers above are a floor, not a total.
        </p>
      )}

      <p className="mt-3 text-xs text-white/40">
        Open each job to check {UNEVALUATED_SIGNALS.join(" and ")}; these are not assessed here.
      </p>
    </section>
  );
}

export default function TalentPortfolioPage() {
  return (
    <SeatGate need="viewPortfolio" what="The portfolio">
      <TalentPortfolioPageBody />
    </SeatGate>
  );
}
