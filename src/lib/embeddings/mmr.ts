/**
 * MMR-style diversity re-rank for candidate shortlist.
 * Without per-candidate embeddings we use position-based spread: pick items spread across
 * the similarity-ordered list so the shortlist mixes top, mid, and lower results (reduces
 * redundancy when many similar profiles cluster at the top).
 * See docs/DB_AUDIT_AGENTDB_ADVANCED.md.
 */

export interface SimilarityItem {
  id: string;
  similarity: number;
}

/**
 * Re-rank a similarity-sorted list (highest first) by taking `takeCount` items spread
 * across the list. Preserves order among selected items by original index.
 * @param items - Sorted by similarity descending (e.g. from findSimilarCandidates).
 * @param takeCount - Max items to return (e.g. MAX_SCORED_PER_JOB).
 */
export function rerankBySpread(items: SimilarityItem[], takeCount: number): SimilarityItem[] {
  if (items.length <= takeCount) return items;
  if (takeCount <= 0) return [];

  const n = items.length;
  const indices: number[] = [];
  for (let i = 0; i < takeCount; i++) {
    const idx = n === 1 ? 0 : Math.round((i * (n - 1)) / (takeCount - 1));
    indices.push(idx);
  }
  const unique = [...new Set(indices)].sort((a, b) => a - b);
  return unique.map((i) => items[i]);
}
