import { env } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCircuitBreaker } from "@/lib/utils/circuit-breaker";
import { withRetry } from "@/lib/utils/retry";

const openaiBreaker = getCircuitBreaker("openai", {
  failureThreshold: 5,
  openMs: 30_000,
});

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

/**
 * Generate an embedding vector via OpenAI's text-embedding-3-small.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const trimmed = text.slice(0, 8000);

  return openaiBreaker.run(() =>
    withRetry(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: trimmed,
          dimensions: EMBEDDING_DIMENSIONS,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI embedding failed: ${response.status} ${err}`);
      }

      const data = await response.json();
      return data.data[0].embedding as number[];
    }),
  );
}

/**
 * Build a text representation of a candidate profile for embedding.
 * Aligns with JD language (role, seniority, skills) for 90%+ semantic match.
 */
function candidateToText(candidate: {
  name?: string | null;
  current_role?: string | null;
  seniority_level?: string | null;
  skills?: string[] | null;
  experience_years?: number | null;
  location?: string | null;
}): string {
  const parts: string[] = [];
  if (candidate.name) parts.push(candidate.name);
  if (candidate.current_role) parts.push(`Role: ${candidate.current_role}`);
  if (candidate.seniority_level) parts.push(`Seniority: ${candidate.seniority_level}`);
  if (candidate.skills?.length) parts.push(`Skills: ${candidate.skills.join(", ")}`);
  if (candidate.experience_years != null)
    parts.push(`${candidate.experience_years} years experience`);
  if (candidate.location) parts.push(`Location: ${candidate.location}`);
  return parts.join(". ");
}

/**
 * Build a text representation of a job posting for embedding.
 * Mirrors candidate fields (title, seniority, skills) for strong JD–resume match.
 */
function jobToText(job: {
  title: string;
  description: string;
  location?: string | null;
  seniority_level?: string | null;
  role_function?: string | null;
  skills_required?: string[] | null;
}): string {
  const parts = [job.title, job.description];
  if (job.location) parts.push(`Location: ${job.location}`);
  if (job.seniority_level) parts.push(`Seniority: ${job.seniority_level}`);
  if (job.role_function) parts.push(`Function: ${job.role_function}`);
  if (job.skills_required?.length) parts.push(`Required skills: ${job.skills_required.join(", ")}`);
  return parts.join(". ");
}

/**
 * Generate and store embedding for a candidate.
 */
export async function embedCandidate(candidateId: string): Promise<void> {
  const admin = createSupabaseAdmin();

  const { data: candidate } = await admin
    .from("candidates")
    .select("name, current_role, seniority_level, skills, experience_years, location")
    .eq("id", candidateId)
    .single();

  if (!candidate) throw new Error(`Candidate ${candidateId} not found`);

  const text = candidateToText(candidate);
  if (!text.trim()) return;

  const embedding = await generateEmbedding(text);

  await admin
    .from("candidates")
    .update({
      profile_embedding: JSON.stringify(embedding),
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidateId);
}

/**
 * Generate and store embedding for a job posting.
 */
export async function embedJob(jobId: string): Promise<void> {
  const admin = createSupabaseAdmin();

  const { data: job } = await admin
    .from("jobs")
    .select("title, description, location, seniority_level, role_function, skills_required")
    .eq("id", jobId)
    .single();

  if (!job) throw new Error(`Job ${jobId} not found`);

  const text = jobToText(job);
  const embedding = await generateEmbedding(text);

  await admin
    .from("jobs")
    .update({
      jd_embedding: JSON.stringify(embedding),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

/**
 * Batch embed all candidates missing embeddings.
 */
export async function embedAllCandidates(
  batchSize = 50,
): Promise<{ embedded: number; errors: number }> {
  const admin = createSupabaseAdmin();

  // Hard cap per invocation so a large/negative caller-supplied batchSize can't
  // turn this into an unbounded scan + embedding storm.
  const MAX_PER_RUN = 500;
  const effectiveBatchSize = Math.min(Math.max(1, batchSize), MAX_PER_RUN);

  const { data: candidates } = await admin
    .from("candidates")
    .select("id")
    .is("profile_embedding", null)
    .limit(effectiveBatchSize);

  let embedded = 0;
  let errors = 0;
  const list = candidates ?? [];
  const CHUNK = 10;
  for (let i = 0; i < list.length; i += CHUNK) {
    const chunk = list.slice(i, i + CHUNK);
    const results = await Promise.allSettled(chunk.map((c) => embedCandidate(c.id)));
    for (const r of results) {
      if (r.status === "fulfilled") embedded++;
      else {
        errors++;
        logger.error("Embedding candidate failed", {
          error: String(r.reason),
        });
      }
    }
  }

  return { embedded, errors };
}

/**
 * Batch embed all jobs missing embeddings.
 */
export async function embedAllJobs(batchSize = 50): Promise<{ embedded: number; errors: number }> {
  const admin = createSupabaseAdmin();

  // Hard cap per invocation so a large/negative caller-supplied batchSize can't
  // turn this into an unbounded scan + embedding storm.
  const MAX_PER_RUN = 500;
  const effectiveBatchSize = Math.min(Math.max(1, batchSize), MAX_PER_RUN);

  const { data: jobs } = await admin
    .from("jobs")
    .select("id")
    .is("jd_embedding", null)
    .eq("status", "open")
    .limit(effectiveBatchSize);

  let embedded = 0;
  let errors = 0;
  const list = jobs ?? [];
  const CHUNK = 10;
  for (let i = 0; i < list.length; i += CHUNK) {
    const chunk = list.slice(i, i + CHUNK);
    const results = await Promise.allSettled(chunk.map((j) => embedJob(j.id)));
    for (const r of results) {
      if (r.status === "fulfilled") embedded++;
      else {
        errors++;
        logger.error("Embedding job failed", { error: String(r.reason) });
      }
    }
  }

  return { embedded, errors };
}

/** Optional hybrid filters for findSimilarCandidates (vector + metadata in DB). */
export interface MatchCandidatesFilters {
  intentMin?: number;
  matchThreshold?: number;
  /** Exact location match; candidates with null location are still included. */
  locationFilter?: string | null;
  experienceMin?: number | null;
  experienceMax?: number | null;
}

/**
 * Semantic search: find candidates similar to a JD embedding.
 * Uses vector index (ivfflat) — does not scan the full candidates table.
 * Distance metric: cosine similarity (pgvector vector_cosine_ops). Hybrid filters
 * (location, experience_min/experience_max) applied in DB via match_candidates RPC.
 * @param intentMin - Optional: only return candidates with intent_score >= this (e.g. 40).
 * @param matchThreshold - Min similarity (0–1). Use 0.6+ for recruitment to target 90%+ match quality and lower cost.
 */
export async function findSimilarCandidates(
  jobId: string,
  limit = 20,
  options?: MatchCandidatesFilters,
): Promise<{ id: string; similarity: number }[]> {
  const admin = createSupabaseAdmin();

  const { data: job } = await admin.from("jobs").select("jd_embedding").eq("id", jobId).single();

  if (!job?.jd_embedding) {
    throw new Error("Job has no embedding — run embedJob first");
  }

  const params: {
    query_embedding: unknown;
    match_threshold: number;
    match_count: number;
    intent_min?: number | null;
    location_filter?: string | null;
    experience_min?: number | null;
    experience_max?: number | null;
  } = {
    query_embedding: job.jd_embedding,
    match_threshold: options?.matchThreshold ?? 0.6,
    match_count: limit,
  };
  if (options?.intentMin != null) params.intent_min = options.intentMin;
  if (options?.locationFilter != null && options.locationFilter !== "")
    params.location_filter = options.locationFilter;
  if (options?.experienceMin != null) params.experience_min = options.experienceMin;
  if (options?.experienceMax != null) params.experience_max = options.experienceMax;

  const { data, error } = await admin.rpc("match_candidates", params);

  if (error) {
    logger.error("Embeddings similarity search failed", {
      error: String(error),
    });
    return [];
  }

  return (data ?? []).map((row: { id: string; similarity: number }) => ({
    id: row.id,
    similarity: row.similarity,
  }));
}
