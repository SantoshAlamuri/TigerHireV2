import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import { NO_APPLICANTS, type JobApplicantCounts, type OfferOutcomes } from "@/lib/v2/ta-portfolio";

/**
 * Reading the portfolio out of the database, counted rather than sampled.
 *
 * The page used to assemble itself from three list endpoints and count the rows
 * it received. `/api/applications` hard-caps `limit` at 100, so past a hundred
 * applications across the org the counts on screen were a first page presented
 * as a total — on the one screen whose stated rule is that a number it cannot
 * compute is reported as null with a reason.
 *
 * Everything here pages to the end, and says so when it does not.
 */

/** Supabase returns at most 1000 rows per request regardless of range width. */
export const PAGE = 1000;

/** PostgREST `.in()` builds a URL — chunk ids so the query string stays sane. */
export const ID_CHUNK = 200;

export function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

export interface JobRow {
  id: string;
  title: string | null;
  created_at: string | null;
  hiring_manager_id: string | null;
}

export interface PortfolioJobPayload {
  id: string;
  title: string;
  createdAt: string | null;
  ownerName: string | null;
  rubricApproved: boolean;
  threshold: number | null;
  counts: JobApplicantCounts;
}

export interface PortfolioPayload {
  jobs: PortfolioJobPayload[];
  /** Null when the offer counts could not be read; the rate goes unreported. */
  offers: OfferOutcomes | null;
  complete: boolean;
}

/** Thrown for the failures that make the whole screen untrustworthy, not one row. */
export class PortfolioQueryError extends Error {}

export async function loadOpenJobs(db: SupabaseClient, orgId: string): Promise<JobRow[]> {
  const jobs: JobRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("jobs")
      .select("id, title, created_at, hiring_manager_id")
      .eq("organisation_id", orgId)
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      logger.error("Portfolio jobs query failed", { org_id: orgId, error: error.message });
      throw new PortfolioQueryError(error.message);
    }
    const page = (data ?? []) as JobRow[];
    jobs.push(...page);
    if (page.length < PAGE) break;
  }
  return jobs;
}

/**
 * Owner display names.
 *
 * `jobs.hiring_manager_id` references `auth.users`, not `profiles`, so no
 * PostgREST embed resolves it — which is why the page had no name to show and
 * printed "unassigned" on every row under a header promising every blocker had
 * an owner. `profiles.id` is that same auth user id, so one lookup closes it.
 */
export async function loadOwnerNames(
  db: SupabaseClient,
  orgId: string,
  jobs: JobRow[],
): Promise<Map<string, string>> {
  const ids = [...new Set(jobs.map((j) => j.hiring_manager_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  for (const batch of chunk(ids, ID_CHUNK)) {
    const { data, error } = await db.from("profiles").select("id, full_name").in("id", batch);
    if (error) {
      // A nameless owner is a degraded row, not a dead page — but it is exactly
      // the failure that made every job read "unassigned", so it is loud.
      logger.warn("Portfolio owner lookup failed", { org_id: orgId, error: error.message });
      continue;
    }
    for (const p of (data ?? []) as Array<{ id: string; full_name: string | null }>) {
      if (p.full_name?.trim()) names.set(p.id, p.full_name.trim());
    }
  }
  return names;
}

export interface JobRubric {
  approved: boolean;
  threshold: number | null;
}

export async function loadRubrics(
  db: SupabaseClient,
  orgId: string,
  jobIds: string[],
): Promise<Map<string, JobRubric>> {
  const byJob = new Map<string, JobRubric>();
  for (const batch of chunk(jobIds, ID_CHUNK)) {
    const { data, error } = await db
      .from("jd_base_documents")
      .select("job_id, approved_at, fit_thresholds")
      .in("job_id", batch);
    if (error) {
      logger.error("Portfolio rubric query failed", { org_id: orgId, error: error.message });
      throw new PortfolioQueryError(error.message);
    }
    for (const r of (data ?? []) as Array<{
      job_id: string;
      approved_at: string | null;
      fit_thresholds: Record<string, number> | null;
    }>) {
      byJob.set(r.job_id, {
        approved: Boolean(r.approved_at),
        threshold: r.fit_thresholds?.strong ?? null,
      });
    }
  }
  return byJob;
}

export function toPayloadJob(
  job: JobRow,
  ownerNames: Map<string, string>,
  rubrics: Map<string, JobRubric>,
  counts: Map<string, JobApplicantCounts>,
): PortfolioJobPayload {
  const rubric = rubrics.get(job.id);
  return {
    id: job.id,
    title: job.title ?? "Untitled job",
    createdAt: job.created_at ?? null,
    ownerName: job.hiring_manager_id ? (ownerNames.get(job.hiring_manager_id) ?? null) : null,
    rubricApproved: Boolean(rubric?.approved),
    threshold: rubric?.threshold ?? null,
    counts: counts.get(job.id) ?? { ...NO_APPLICANTS },
  };
}
