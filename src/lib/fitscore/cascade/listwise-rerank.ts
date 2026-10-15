import type { SupabaseClient } from "@supabase/supabase-js";
import { callClaude, extractJsonObject } from "@/lib/services/anthropic";
import { MODELS } from "@/lib/config/models";
import { isCascadeRerankEnabled } from "@/lib/feature-flags/cascade";
import { selectBoundaryPool, type BoundaryCandidate } from "./boundary";
import { getRerankCache, upsertRerankCache } from "./cache";
import { logger } from "@/lib/observability/logger";

export type ListwiseRerankInput = {
  jobId: string;
  jdBaseVersion: number;
  organisationId?: string | null;
  roleTitle: string;
  candidates: BoundaryCandidate[];
  summaries: Record<string, string>;
};

export type ListwiseRerankResult = {
  orderedIds: string[];
  fromCache: boolean;
};

function buildRerankPrompt(input: ListwiseRerankInput, permutation: number): string {
  const lines = input.candidates.map((c) => {
    const summary = input.summaries[c.candidateId]?.slice(0, 400) ?? "";
    return `- ${c.candidateId}: score=${c.fitScore} | ${summary}`;
  });
  return `Role: ${input.roleTitle}
Permutation seed: ${permutation}

Rank these candidates from best to worst fit. Return JSON: { "ordered_ids": ["uuid", ...] }

Candidates:
${lines.join("\n")}`;
}

async function runSinglePermutation(
  input: ListwiseRerankInput,
  permutation: number,
): Promise<string[]> {
  const res = await callClaude({
    model: MODELS.SONNET,
    max_tokens: 1024,
    temperature: 0,
    messages: [{ role: "user", content: buildRerankPrompt(input, permutation) }],
    label: "fitscore-listwise-rerank",
    jobId: input.jobId,
    organisationId: input.organisationId ?? undefined,
  });
  const parsed = extractJsonObject(res.text, "listwise-rerank") as { ordered_ids?: string[] };
  return Array.isArray(parsed.ordered_ids) ? parsed.ordered_ids.map(String) : [];
}

function aggregateRankings(permutations: string[][]): string[] {
  const scores = new Map<string, number>();
  for (const order of permutations) {
    order.forEach((id, idx) => {
      scores.set(id, (scores.get(id) ?? 0) + idx);
    });
  }
  return [...scores.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
}

export async function runListwiseRerank(
  admin: SupabaseClient,
  input: ListwiseRerankInput,
): Promise<ListwiseRerankResult> {
  if (!(await isCascadeRerankEnabled(input.organisationId))) {
    return {
      orderedIds: input.candidates.map((c) => c.candidateId),
      fromCache: false,
    };
  }

  const cached = await getRerankCache(admin, input.jobId, input.jdBaseVersion);
  if (cached?.topSet.length) {
    return {
      orderedIds: cached.topSet.map((t) => t.candidateId),
      fromCache: true,
    };
  }

  const pool = selectBoundaryPool(input.candidates);
  if (pool.length < 2) {
    return { orderedIds: pool.map((c) => c.candidateId), fromCache: false };
  }

  const narrowed: ListwiseRerankInput = { ...input, candidates: pool };
  const perm0 = await runSinglePermutation(narrowed, 0);
  const perm1 = await runSinglePermutation(narrowed, 1);
  const orderedIds = aggregateRankings([perm0, perm1]);

  await upsertRerankCache(admin, {
    jobId: input.jobId,
    jdBaseVersion: input.jdBaseVersion,
    topSet: orderedIds.map((candidateId, rank) => ({ candidateId, rank: rank + 1 })),
  });

  logger.info("[listwise-rerank] computed", {
    jobId: input.jobId,
    poolSize: pool.length,
  });

  return { orderedIds, fromCache: false };
}
