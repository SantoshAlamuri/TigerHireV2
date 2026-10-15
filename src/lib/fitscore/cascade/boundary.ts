/** Candidates within this score band of the cutoff are eligible for listwise rerank. */
export const BOUNDARY_POOL_SIZE = 15;
export const BOUNDARY_DELTA = 3;

export type BoundaryCandidate = {
  candidateId: string;
  fitScore: number;
};

/**
 * Return candidate ids in the boundary pool (top N by score, including ties near cutoff).
 */
export function selectBoundaryPool(
  ranked: BoundaryCandidate[],
  poolSize = BOUNDARY_POOL_SIZE,
): BoundaryCandidate[] {
  const sorted = [...ranked].sort((a, b) => b.fitScore - a.fitScore);
  if (sorted.length <= poolSize) return sorted;
  const cutoff = sorted[poolSize - 1]?.fitScore ?? 0;
  return sorted.filter((c) => c.fitScore >= cutoff - BOUNDARY_DELTA).slice(0, poolSize);
}

export function isEligibleForRerank(candidateId: string, pool: BoundaryCandidate[]): boolean {
  return pool.some((c) => c.candidateId === candidateId);
}
