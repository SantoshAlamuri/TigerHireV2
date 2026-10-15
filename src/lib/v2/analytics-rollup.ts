import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { ANALYTICS_PAGE_SIZE } from "@/lib/analytics/fetch-paged";

/**
 * Every application behind the analytics screen, counted rather than sampled.
 *
 * The screen read `/api/applications?limit=100` — a route that hard-caps `limit`
 * at 100 — and derived the funnel, source-of-hire table, rejection-reason mix,
 * time-to-decision, score bands and the per-job table from whatever came back.
 * A conversion rate computed over the hundred most recent rows is not a smaller
 * version of the org's conversion rate; it is a different number wearing the
 * same label, and on this screen it is the number that gets quoted.
 *
 * Two other things were wrong for the same reason and are fixed here:
 * the sample ignored the period picker entirely (the picker only reached the v1
 * endpoints, so "This FY" and "Last month" produced identical client-derived
 * figures), and the open-job count behind fill rate came from a jobs list that
 * also caps at 100.
 *
 * This pages to the end of the period and reports `complete: false` rather than
 * quietly stopping — the failure mode being fixed is a partial answer that
 * looks total.
 */

/**
 * Stop reading rather than page forever. Well above any real org's activity in
 * a single period; crossing it sets `complete: false` so the screen can say the
 * figures are computed over a prefix rather than presenting them as the period.
 */
export const MAX_ROLLUP_ROWS = 20_000;

export interface RollupRow {
  jobId: string;
  status: string | null;
  source: string | null;
  rejectionReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  offerAcceptedAt: string | null;
  /** FitScore overall, or null when the application was never scored. */
  score: number | null;
  /** Whether any screening answer was recorded against this application. */
  screened: boolean;
}

export interface RollupJob {
  title: string | null;
  createdAt: string | null;
}

export interface AnalyticsRollup {
  rows: RollupRow[];
  /** Job title/created_at keyed by id — hoisted out of the rows so the two
   *  strings that repeat on every application are sent once. */
  jobs: Record<string, RollupJob>;
  /** Exact count of open jobs in scope. Null when the count could not be read. */
  openJobCount: number | null;
  /** False when the row cap was hit, i.e. the figures are a floor. */
  complete: boolean;
}

export interface RollupScope {
  orgId: string;
  /** Non-null restricts to the jobs this hiring manager owns. */
  hiringManagerId: string | null;
  /** Inclusive ISO start, or null for all time. */
  from: string | null;
  /** Exclusive ISO end, or null for all time. */
  to: string | null;
}

/** Thrown when the read failed outright — a broken screen beats a wrong one. */
export class AnalyticsRollupError extends Error {}

const ROLLUP_SELECT =
  "id, job_id, status, source, rejection_reason, created_at, updated_at, offer_accepted_at, " +
  "fit_scores(overall_score), application_screening_answers(application_id), " +
  "jobs!inner(id, title, created_at, organisation_id, hiring_manager_id)";

interface RawRow {
  id: string;
  job_id: string | null;
  status: string | null;
  source: string | null;
  rejection_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  offer_accepted_at: string | null;
  fit_scores: { overall_score: number | null } | { overall_score: number | null }[] | null;
  application_screening_answers: unknown[] | null;
  jobs:
    | { id: string; title: string | null; created_at: string | null }
    | { id: string; title: string | null; created_at: string | null }[]
    | null;
}

/** The embeds are to-one in the schema, but PostgREST may hand back an array. */
function one<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function loadAnalyticsRollup(
  db: SupabaseClient,
  scope: RollupScope,
): Promise<AnalyticsRollup> {
  const rows: RollupRow[] = [];
  const jobs: Record<string, RollupJob> = {};
  let complete = true;

  for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
    let query = db
      .from("applications")
      .select(ROLLUP_SELECT)
      .eq("jobs.organisation_id", scope.orgId);
    if (scope.hiringManagerId) {
      query = query.eq("jobs.hiring_manager_id", scope.hiringManagerId);
    }
    if (scope.from) query = query.gte("created_at", scope.from);
    // Exclusive, matching the Period contract — an inclusive end double-counts
    // the boundary day into two adjacent periods.
    if (scope.to) query = query.lt("created_at", scope.to);

    const { data, error } = await query
      .order("id", { ascending: true })
      .range(from, from + ANALYTICS_PAGE_SIZE - 1);
    if (error) {
      logger.error("Analytics rollup query failed", {
        org_id: scope.orgId,
        error: error.message,
      });
      throw new AnalyticsRollupError(error.message);
    }

    const page = (data ?? []) as unknown as RawRow[];
    for (const r of page) {
      const job = one(r.jobs);
      const jobId = r.job_id ?? job?.id ?? "";
      if (jobId && !jobs[jobId]) {
        jobs[jobId] = { title: job?.title ?? null, createdAt: job?.created_at ?? null };
      }
      rows.push({
        jobId,
        status: r.status,
        source: r.source,
        rejectionReason: r.rejection_reason,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        offerAcceptedAt: r.offer_accepted_at,
        score: one(r.fit_scores)?.overall_score ?? null,
        screened: (r.application_screening_answers ?? []).length > 0,
      });
    }

    if (rows.length >= MAX_ROLLUP_ROWS) {
      logger.warn("Analytics rollup truncated at the safety cap", {
        org_id: scope.orgId,
        rows_seen: rows.length,
        cap: MAX_ROLLUP_ROWS,
      });
      complete = false;
      break;
    }
    if (page.length < ANALYTICS_PAGE_SIZE) break;
  }

  return { rows, jobs, openJobCount: await countOpenJobs(db, scope), complete };
}

/**
 * Open requisitions in scope — the denominator behind fill rate.
 *
 * Counted with `head: true` rather than by measuring a jobs list, which is the
 * same first-page-as-total bug one level down: `/api/jobs` also caps at 100, so
 * an org with more open roles than that reported fill rate against 100.
 */
async function countOpenJobs(db: SupabaseClient, scope: RollupScope): Promise<number | null> {
  let query = db
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", scope.orgId)
    .eq("status", "open");
  if (scope.hiringManagerId) query = query.eq("hiring_manager_id", scope.hiringManagerId);

  const { count, error } = await query;
  if (error) {
    // Null, not zero: "0 open roles" is a claim about the org, and fill rate
    // divides by it.
    logger.warn("Analytics rollup open-job count failed", {
      org_id: scope.orgId,
      error: error.message,
    });
    return null;
  }
  return count ?? 0;
}
