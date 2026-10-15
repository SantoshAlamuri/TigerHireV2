import { cacheGet, cacheSet, cacheDel } from "./cache";

const FITSCORE_PREFIX = "fitscore:";
const FITSCORE_TTL = 1800; // 30 min – scores don't change often

export async function getCachedFitScore(candidateId: string, jobId: string) {
  return cacheGet<Record<string, unknown>>(FITSCORE_PREFIX + `${candidateId}:${jobId}`);
}

export async function setCachedFitScore(
  candidateId: string,
  jobId: string,
  data: Record<string, unknown>,
) {
  await cacheSet(FITSCORE_PREFIX + `${candidateId}:${jobId}`, data, FITSCORE_TTL);
}

export async function invalidateFitScoreCache(candidateId: string, jobId: string) {
  await cacheDel(FITSCORE_PREFIX + `${candidateId}:${jobId}`);
}
