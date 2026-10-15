import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";
import { buildDedupFingerprint } from "./dedup";
import {
  classifyRoleKeywordFirst,
  classifyWithLlmFallback,
  buildLlmKey,
} from "@/lib/jobs/role-classifier";
import { fetchGreenhouseJobs } from "@/lib/jobs/sources/greenhouse";
import { fetchLeverJobs } from "@/lib/jobs/sources/lever";
import { fetchAdzunaJobs } from "@/lib/jobs/sources/adzuna";
import { fetchJSearchJobs } from "@/lib/jobs/sources/jsearch";
import { markStaleAggregatedJobsInactive, upsertAggregatedJobs } from "./upsert";
import type { JobSource, NormalizedJob, SourceFetchResult } from "@/lib/jobs/types";

const SOURCE_FETCHERS: Record<JobSource, () => Promise<SourceFetchResult>> = {
  greenhouse: fetchGreenhouseJobs,
  lever: fetchLeverJobs,
  adzuna: fetchAdzunaJobs,
  jsearch: fetchJSearchJobs,
};

export interface JobsSyncSummary {
  sources: Array<{
    source: JobSource;
    fetched: number;
    inserted: number;
    updated: number;
    dropped: number;
    failed: number;
    unresolvedRole: number;
  }>;
  staleDeactivated: number;
}

export async function runJobsSync(source: "all" | JobSource): Promise<JobsSyncSummary> {
  const supabase = createSupabaseAdmin();
  const aggregatedOrgId = await resolveAggregatedOrgId();

  const sources = source === "all" ? (Object.keys(SOURCE_FETCHERS) as JobSource[]) : [source];
  const summary: JobsSyncSummary = { sources: [], staleDeactivated: 0 };

  for (const sourceName of sources) {
    const startedAt = new Date().toISOString();
    const { data: logRow } = await supabase
      .from("sync_logs")
      .insert({ source: sourceName, started_at: startedAt })
      .select("id")
      .single();

    let fetched = 0;
    let inserted = 0;
    let updated = 0;
    let dropped = 0;
    let failed = 0;
    let unresolvedRole = 0;
    let errorMessage: string | null = null;

    try {
      const fetchResult = await SOURCE_FETCHERS[sourceName]();
      fetched = fetchResult.fetched;
      failed = fetchResult.failed;

      const normalized = fetchResult.items
        .map((item) => item.normalized)
        .filter((job): job is NormalizedJob => Boolean(job));

      for (const job of normalized) {
        job.role_category = classifyRoleKeywordFirst(job.title, job.description);
      }

      const unresolved = normalized.filter((job) => !job.role_category);
      const llmAssignments = await classifyWithLlmFallback(unresolved, 200);
      for (const job of unresolved) {
        const key = buildLlmKey(job.source, job.source_job_id);
        job.role_category = llmAssignments.get(key) ?? null;
      }

      const curated = normalized.filter((job) => job.role_category && job.city);
      unresolvedRole = normalized.length - curated.length;

      const payload = curated.map((job) => ({
        ...job,
        dedup_fingerprint: buildDedupFingerprint({
          title: job.title,
          company: job.company,
          city: job.city as string,
          description: job.description,
        }),
      }));

      const upsert = await upsertAggregatedJobs(supabase, payload, aggregatedOrgId);
      inserted = upsert.inserted;
      updated = upsert.updated;
      dropped = upsert.dropped + unresolvedRole;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unknown sync error";
      logger.error("Jobs source sync failed", {
        source: sourceName,
        error: errorMessage,
      });
    } finally {
      if (logRow?.id) {
        await supabase
          .from("sync_logs")
          .update({
            ended_at: new Date().toISOString(),
            jobs_fetched: fetched,
            jobs_inserted: inserted,
            jobs_updated: updated,
            jobs_dropped: dropped,
            error: errorMessage,
          })
          .eq("id", logRow.id);
      }
    }

    summary.sources.push({
      source: sourceName,
      fetched,
      inserted,
      updated,
      dropped,
      failed,
      unresolvedRole,
    });
  }

  summary.staleDeactivated = await markStaleAggregatedJobsInactive(supabase, 14);
  return summary;
}

async function resolveAggregatedOrgId(): Promise<string> {
  if (env.jobsAggregatedOrgId) return env.jobsAggregatedOrgId;

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("organisations")
    .select("id")
    .eq("slug", env.jobsAggregatedOrgSlug)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    throw new Error(
      `Aggregated jobs organisation missing. Set JOBS_AGGREGATED_ORG_ID or create org with slug ${env.jobsAggregatedOrgSlug}.`,
    );
  }
  return data.id as string;
}
