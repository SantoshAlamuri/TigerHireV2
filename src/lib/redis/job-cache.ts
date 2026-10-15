import { cacheGet, cacheSet, cacheDel } from "./cache";
import { logger } from "@/lib/observability/logger";
import { getRedis } from "./client";

const JOB_LIST_PREFIX = "jobs:list:";
const JOB_DETAIL_PREFIX = "jobs:detail:";
const JOB_LIST_TTL = 600; // 10 min
const JOB_DETAIL_TTL = 120;

export async function getCachedJobList(cacheKey: string) {
  return cacheGet<{ jobs: unknown[]; pagination: unknown }>(JOB_LIST_PREFIX + cacheKey);
}

export async function setCachedJobList(
  cacheKey: string,
  data: { jobs: unknown[]; pagination: unknown },
) {
  await cacheSet(JOB_LIST_PREFIX + cacheKey, data, JOB_LIST_TTL);
}

export async function getCachedJobDetail(jobId: string) {
  return cacheGet<Record<string, unknown>>(JOB_DETAIL_PREFIX + jobId);
}

export async function setCachedJobDetail(jobId: string, data: Record<string, unknown>) {
  await cacheSet(JOB_DETAIL_PREFIX + jobId, data, JOB_DETAIL_TTL);
}

export async function invalidateJobCache(jobId?: string, orgId?: string, agencyOrgId?: string) {
  const keysToDelete: string[] = [];
  if (jobId) keysToDelete.push(JOB_DETAIL_PREFIX + jobId);
  if (orgId) keysToDelete.push(JOB_LIST_PREFIX + `org:${orgId}`);

  // When an agency creates/updates a job, also invalidate agency cache keys
  // Agency cache keys include query params, so we invalidate common variations
  // Format: agency:${agencyOrgId}:${queryString}
  // When queryString is empty, the key is agency:${agencyOrgId}: (with trailing colon)
  if (agencyOrgId) {
    // Common query param combinations used by agency jobs listing
    // Note: URLSearchParams.toString() returns empty string for no params, so we need both formats
    const commonQueries = [
      "", // all jobs (no status filter) - results in agency:${id}:
      "status=open", // active jobs
      "status=closed", // closed jobs
    ];
    for (const query of commonQueries) {
      // Match both formats: with and without trailing colon when query is empty
      if (query === "") {
        keysToDelete.push(JOB_LIST_PREFIX + `agency:${agencyOrgId}:`);
        keysToDelete.push(JOB_LIST_PREFIX + `agency:${agencyOrgId}`);
      } else {
        keysToDelete.push(JOB_LIST_PREFIX + `agency:${agencyOrgId}:${query}`);
      }
    }
  }

  for (const key of keysToDelete) {
    await cacheDel(key);
  }

  // Best-effort wildcard invalidation for query-string variants.
  // Job list cache keys include URL query strings, so exact-key invalidation misses many entries.
  const redis = getRedis();
  if (redis) {
    const patterns = new Set<string>();
    if (orgId) {
      patterns.add(`${JOB_LIST_PREFIX}org:${orgId}:*`);
      patterns.add(`${JOB_LIST_PREFIX}org:${orgId}`);
    }
    if (agencyOrgId) {
      patterns.add(`${JOB_LIST_PREFIX}agency:${agencyOrgId}:*`);
      patterns.add(`${JOB_LIST_PREFIX}agency:${agencyOrgId}`);
    }
    // Candidate and user-scoped listings are keyed by user id + query string.
    patterns.add(`${JOB_LIST_PREFIX}user:*`);

    for (const pattern of patterns) {
      try {
        const matches = await redis.keys(pattern);
        if (Array.isArray(matches) && matches.length > 0) {
          await redis.del(...matches);
        }
      } catch (err) {
        logger.warn("Job cache wildcard invalidation failed", {
          pattern,
          error: String(err),
        });
      }
    }
  }

  logger.debug("Job cache invalidated", { jobId, orgId, agencyOrgId });
}
