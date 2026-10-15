import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import {
  AWAITING_REVIEW_STATUSES,
  NO_APPLICANTS,
  type JobApplicantCounts,
  type OfferOutcomes,
} from "@/lib/v2/ta-portfolio";
import {
  chunk,
  ID_CHUNK,
  PAGE,
  PortfolioQueryError,
  type JobRubric,
} from "@/lib/v2/portfolio-query";

/**
 * Counting the portfolio, to the end of the data.
 *
 * Split from `portfolio-query` because this is the half that had the bug: the
 * page read `/api/applications?limit=100` — a route that hard-caps at 100 — and
 * printed the length of what came back as "47 waiting". Everything here pages
 * until the rows run out, and reports `complete: false` rather than quietly
 * under-counting when it stops early.
 */

interface AppRow {
  job_id: string;
  status: string | null;
  fit_scores: { overall_score: number | null } | { overall_score: number | null }[] | null;
}

/** The embed is to-one in the schema, but PostgREST may hand back an array. */
function scoreOf(row: AppRow): number | null {
  const fs = Array.isArray(row.fit_scores) ? row.fit_scores[0] : row.fit_scores;
  return fs?.overall_score ?? null;
}

/**
 * Stop counting rather than page forever. Well above any real org's open
 * pipeline; crossing it sets `complete: false` so the page can tell the reader
 * the counts are a floor, which is the failure mode being fixed.
 */
export const MAX_APPLICATION_ROWS = 50_000;

/** Every application on these jobs, counted — never a first page. */
export async function countApplications(
  db: SupabaseClient,
  orgId: string,
  jobIds: string[],
  rubrics: Map<string, JobRubric>,
): Promise<{ counts: Map<string, JobApplicantCounts>; complete: boolean }> {
  const counts = new Map<string, JobApplicantCounts>(
    jobIds.map((id) => [id, { ...NO_APPLICANTS }]),
  );
  const awaiting = new Set<string>(AWAITING_REVIEW_STATUSES);
  let rowsSeen = 0;

  for (const batch of chunk(jobIds, ID_CHUNK)) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db
        .from("applications")
        .select("job_id, status, fit_scores(overall_score)")
        .in("job_id", batch)
        .range(from, from + PAGE - 1);
      if (error) {
        logger.error("Portfolio application query failed", { org_id: orgId, error: error.message });
        throw new PortfolioQueryError(error.message);
      }
      const page = (data ?? []) as unknown as AppRow[];
      for (const row of page) {
        const c = counts.get(row.job_id);
        if (!c) continue;
        c.applicants += 1;
        if (row.status && awaiting.has(row.status)) c.awaitingReview += 1;
        const score = scoreOf(row);
        if (score === null) {
          c.unscored += 1;
          continue;
        }
        const threshold = rubrics.get(row.job_id)?.threshold ?? null;
        if (threshold === null || score >= threshold) c.clearingBar += 1;
      }
      rowsSeen += page.length;
      if (rowsSeen >= MAX_APPLICATION_ROWS) {
        logger.warn("Portfolio counts truncated at the safety cap", {
          org_id: orgId,
          rows_seen: rowsSeen,
          cap: MAX_APPLICATION_ROWS,
        });
        return { counts, complete: false };
      }
      if (page.length < PAGE) break;
    }
  }
  return { counts, complete: true };
}

/**
 * Offer outcomes, org-wide.
 *
 * Returns null rather than a partial tally: an accept rate computed off a
 * denominator that lost a status is worse than an absent one.
 */
export async function countOfferOutcomes(
  db: SupabaseClient,
  orgId: string,
): Promise<OfferOutcomes | null> {
  const outcomes: OfferOutcomes = { accepted: 0, declined: 0, expired: 0 };
  for (const status of ["accepted", "declined", "expired"] as const) {
    const { count, error } = await db
      .from("offers")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", orgId)
      .eq("status", status);
    if (error) {
      logger.warn("Portfolio offer count failed", { org_id: orgId, status, error: error.message });
      return null;
    }
    outcomes[status] = count ?? 0;
  }
  return outcomes;
}
