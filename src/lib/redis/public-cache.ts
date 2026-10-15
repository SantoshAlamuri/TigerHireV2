import { cacheGet, cacheSet, cacheDel } from "./cache";

const PUBLIC_JOBS_KEY = "public:jobs:list";
const PUBLIC_JOB_PREFIX = "public:jobs:detail:";
const PUBLIC_TTL = 120; // 2 min

export async function getCachedPublicJobs() {
  return cacheGet<unknown[]>(PUBLIC_JOBS_KEY);
}

export async function setCachedPublicJobs(data: unknown[]) {
  await cacheSet(PUBLIC_JOBS_KEY, data, PUBLIC_TTL);
}

export async function getCachedPublicJob(slug: string) {
  return cacheGet<Record<string, unknown>>(PUBLIC_JOB_PREFIX + slug);
}

export async function setCachedPublicJob(slug: string, data: Record<string, unknown>) {
  await cacheSet(PUBLIC_JOB_PREFIX + slug, data, PUBLIC_TTL);
}

export async function invalidatePublicJobCache(slug?: string) {
  await cacheDel(PUBLIC_JOBS_KEY);
  if (slug) await cacheDel(PUBLIC_JOB_PREFIX + slug);
}
