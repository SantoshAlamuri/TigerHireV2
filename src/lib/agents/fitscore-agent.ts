import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { embedJob, findSimilarCandidates } from "@/lib/services/embeddings";
import { rerankBySpread } from "@/lib/embeddings/mmr";
import { createRunContext, type AgentRunContext } from "./types";
import { isEnabled } from "@/lib/feature-flags";

/** Hard cap for candidates retrieved from vector search per job. */
const HARD_SHORTLIST_PER_JOB = 120;
/** Hard cap for match pairs surfaced per job. */
const HARD_MAX_SCORED_PER_JOB = 80;
/** Only surface pairs with similarity >= this (0.6 = strong JD–resume match). */
const SIMILARITY_THRESHOLD = 0.6;
/** Hard cap for jobs considered per run. */
const HARD_MAX_JOBS_PER_RUN = 20;
/** Hard cap for total scoring pairs per run. */
const HARD_MAX_PAIRS_PER_RUN = 200;
/** Hard cap for total runtime budget per run. */
const HARD_MAX_RUNTIME_MS = 120_000;
/** Safety margin to avoid operating at hard limits. */
const BUDGET_SAFETY_MARGIN = 0.5;
const MIN_BUDGET_VALUE = 1;

type BudgetStopReason =
  | "budget_pairs"
  | "budget_jobs"
  | "budget_runtime"
  | "candidate_mode_pairs"
  | "candidate_mode_runtime";

/** A job ↔ candidate match produced by similarity search (no fit_score is created). */
export interface FitScoreMatchPair {
  jobId: string;
  candidateId: string;
  similarity: number;
}

interface FitScoreBudgetPolicy {
  margin: number;
  requestedPairs: number;
  effectiveMaxPairs: number;
  effectiveMaxJobs: number;
  effectiveShortlistPerJob: number;
  effectiveMaxScoredPerJob: number;
  effectiveMaxRuntimeMs: number;
}

interface FitScoreRunDiagnostics {
  policy: FitScoreBudgetPolicy;
  considered_jobs: number;
  considered_candidates: number;
  prefilter_candidates_total: number;
  similarity_candidates_total: number;
  matched_pairs_total: number;
  stop_reason: BudgetStopReason | null;
}

function applyMargin(value: number): number {
  return Math.max(MIN_BUDGET_VALUE, Math.floor(value * BUDGET_SAFETY_MARGIN));
}

function buildPolicy(maxPairsInput?: number): FitScoreBudgetPolicy {
  const requestedPairs = Math.max(MIN_BUDGET_VALUE, maxPairsInput ?? 100);
  const boundedRequested = Math.min(requestedPairs, HARD_MAX_PAIRS_PER_RUN);
  return {
    margin: BUDGET_SAFETY_MARGIN,
    requestedPairs,
    effectiveMaxPairs: Math.min(applyMargin(HARD_MAX_PAIRS_PER_RUN), applyMargin(boundedRequested)),
    effectiveMaxJobs: applyMargin(HARD_MAX_JOBS_PER_RUN),
    effectiveShortlistPerJob: applyMargin(HARD_SHORTLIST_PER_JOB),
    effectiveMaxScoredPerJob: applyMargin(HARD_MAX_SCORED_PER_JOB),
    effectiveMaxRuntimeMs: applyMargin(HARD_MAX_RUNTIME_MS),
  };
}

function runtimeExceeded(startedAt: Date, policy: FitScoreBudgetPolicy): boolean {
  return Date.now() - startedAt.getTime() >= policy.effectiveMaxRuntimeMs;
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function inferExperienceRangeFromSeniority(seniorityRaw: unknown): {
  experienceMin: number | null;
  experienceMax: number | null;
} {
  const seniority = typeof seniorityRaw === "string" ? seniorityRaw.toLowerCase() : "";
  switch (seniority) {
    case "intern":
      return { experienceMin: 0, experienceMax: 1 };
    case "junior":
      return { experienceMin: 0, experienceMax: 3 };
    case "mid":
      return { experienceMin: 2, experienceMax: 6 };
    case "senior":
      return { experienceMin: 5, experienceMax: 10 };
    case "lead":
      return { experienceMin: 7, experienceMax: 12 };
    case "manager":
      return { experienceMin: 6, experienceMax: 14 };
    case "director":
      return { experienceMin: 10, experienceMax: null };
    case "vp":
      return { experienceMin: 12, experienceMax: null };
    case "c-suite":
      return { experienceMin: 14, experienceMax: null };
    default:
      return { experienceMin: null, experienceMax: null };
  }
}

function buildCheapPrefilters(job: Record<string, unknown>): {
  locationFilter: string | null;
  experienceMin: number | null;
  experienceMax: number | null;
} {
  const explicitExperienceMin =
    toFiniteNumber(job.experience_min) ??
    toFiniteNumber(job.min_experience) ??
    toFiniteNumber(job.min_experience_years) ??
    toFiniteNumber(job.experience_years_min);
  const explicitExperienceMax =
    toFiniteNumber(job.experience_max) ??
    toFiniteNumber(job.max_experience) ??
    toFiniteNumber(job.max_experience_years) ??
    toFiniteNumber(job.experience_years_max);
  const inferred = inferExperienceRangeFromSeniority(job.seniority_level);
  const experienceMin = explicitExperienceMin ?? inferred.experienceMin;
  const experienceMax = explicitExperienceMax ?? inferred.experienceMax;

  const remoteAllowed = job.remote_allowed === true;
  const locationFilter =
    !remoteAllowed && typeof job.location === "string" && job.location.trim().length > 0
      ? job.location.trim()
      : null;

  return { locationFilter, experienceMin, experienceMax };
}

/**
 * FitScore Match Agent — produces job ↔ candidate match pairs using semantic
 * (embedding) similarity only. It does NOT create fit_scores: scoring happens
 * exclusively when a candidate applies through the prescribed apply route.
 * Does not scan all candidates: uses vector search (match_candidates) so when a job
 * is posted we only consider ~SHORTLIST_PER_JOB best-matching candidates per job.
 * The match pairs are returned via ctx.meta.matches for downstream notifications.
 * Triggered by cron or by new job/candidate events.
 */
export async function runFitScoreBatchAgent(options?: {
  jobId?: string;
  candidateId?: string;
  maxPairs?: number;
}): Promise<AgentRunContext> {
  const ctx = createRunContext("fitscore");
  const admin = createSupabaseAdmin();
  const runtimeOrganisationId =
    options?.jobId && typeof options.jobId === "string"
      ? (await admin.from("jobs").select("organisation_id").eq("id", options.jobId).maybeSingle())
          .data?.organisation_id
      : null;
  const budgetEnforcement = await isEnabled("fitscore_budget_enforcement", runtimeOrganisationId);
  const strictPrefilter = await isEnabled("fitscore_prefilter_strict", runtimeOrganisationId);
  const policy = budgetEnforcement
    ? buildPolicy(options?.maxPairs)
    : buildPolicy(HARD_MAX_PAIRS_PER_RUN);
  const diagnostics: FitScoreRunDiagnostics = {
    policy,
    considered_jobs: 0,
    considered_candidates: 0,
    prefilter_candidates_total: 0,
    similarity_candidates_total: 0,
    matched_pairs_total: 0,
    stop_reason: null,
  };
  const matches: FitScoreMatchPair[] = [];

  await admin.from("agent_logs").insert({
    agent_name: ctx.agentName,
    run_id: ctx.runId,
    status: "running",
    payload: {
      ...(options ?? {}),
      budget_enforced: budgetEnforcement,
      strict_prefilter: strictPrefilter,
      budget_policy: policy,
    },
  });

  const maxPairs = policy.effectiveMaxPairs;

  // Single-candidate mode: find open jobs this candidate matches (similarity only).
  // We reuse the per-job vector search (findSimilarCandidates) and keep the pair
  // whenever the target candidate appears among a job's strong matches. No fit_score
  // is created here — scoring only happens when the candidate applies.
  if (options?.candidateId) {
    const { data: candidate } = await admin
      .from("candidates")
      .select("*")
      .eq("id", options.candidateId)
      .eq("visibility", true)
      .single();
    if (!candidate) {
      await logCompletion(admin, ctx, diagnostics, matches);
      return ctx;
    }
    const { data: jobs } = await admin
      .from("jobs")
      .select("*")
      .eq("status", "open")
      .limit(policy.effectiveMaxJobs);
    if (!jobs?.length) {
      await logCompletion(admin, ctx, diagnostics, matches);
      return ctx;
    }
    for (const job of jobs) {
      if (matches.length >= maxPairs) {
        diagnostics.stop_reason = "candidate_mode_pairs";
        break;
      }
      if (runtimeExceeded(ctx.startedAt, policy)) {
        diagnostics.stop_reason = "candidate_mode_runtime";
        break;
      }
      diagnostics.considered_jobs++;
      ctx.recordsProcessed++;

      const jobWithEmbedding = job as { id: string; jd_embedding?: unknown };
      if (!jobWithEmbedding.jd_embedding) {
        try {
          await embedJob(job.id);
        } catch {
          ctx.errors.push(`Job ${job.id}: embedding failed, skipping`);
          continue;
        }
      }

      const prefilters = strictPrefilter
        ? buildCheapPrefilters(job as Record<string, unknown>)
        : { locationFilter: null, experienceMin: null, experienceMax: null };
      const similar = await findSimilarCandidates(job.id, policy.effectiveShortlistPerJob, {
        intentMin: 40,
        matchThreshold: SIMILARITY_THRESHOLD,
        locationFilter: prefilters.locationFilter,
        experienceMin: prefilters.experienceMin,
        experienceMax: prefilters.experienceMax,
      });
      diagnostics.prefilter_candidates_total += similar.length;
      const hit = similar.find(({ id }) => id === String(candidate.id));
      if (hit && hit.similarity >= SIMILARITY_THRESHOLD) {
        matches.push({
          jobId: job.id,
          candidateId: String(candidate.id),
          similarity: hit.similarity,
        });
        diagnostics.similarity_candidates_total++;
        diagnostics.matched_pairs_total++;
        ctx.recordsCreated++;
      }
    }
    await logCompletion(admin, ctx, diagnostics, matches);
    return ctx;
  }

  // Job(s) mode: use semantic search so we never scan 1M candidates.
  // Produces match pairs (job + candidate + similarity) for downstream notifications.
  // No fit_scores are created — scoring only happens when a candidate applies.
  let jobsQuery = admin.from("jobs").select("*").eq("status", "open");
  if (options?.jobId) jobsQuery = jobsQuery.eq("id", options.jobId);
  const { data: jobs } = await jobsQuery.limit(policy.effectiveMaxJobs);

  if (!jobs?.length) {
    await logCompletion(admin, ctx, diagnostics, matches);
    return ctx;
  }

  for (const job of jobs) {
    if (matches.length >= maxPairs) {
      diagnostics.stop_reason = "budget_pairs";
      break;
    }
    if (diagnostics.considered_jobs >= policy.effectiveMaxJobs) {
      diagnostics.stop_reason = "budget_jobs";
      break;
    }
    if (runtimeExceeded(ctx.startedAt, policy)) {
      diagnostics.stop_reason = "budget_runtime";
      break;
    }
    diagnostics.considered_jobs++;

    const jobWithEmbedding = job as { id: string; jd_embedding?: unknown };
    if (!jobWithEmbedding.jd_embedding) {
      try {
        await embedJob(job.id);
      } catch {
        ctx.errors.push(`Job ${job.id}: embedding failed, skipping`);
        continue;
      }
      const { data: refreshed } = await admin.from("jobs").select("*").eq("id", job.id).single();
      if (refreshed) Object.assign(job, refreshed);
    }

    const requested = Math.min(policy.effectiveShortlistPerJob, maxPairs - matches.length);
    const prefilters = strictPrefilter
      ? buildCheapPrefilters(job as Record<string, unknown>)
      : { locationFilter: null, experienceMin: null, experienceMax: null };
    const similar = await findSimilarCandidates(job.id, requested, {
      intentMin: 40,
      matchThreshold: SIMILARITY_THRESHOLD,
      locationFilter: prefilters.locationFilter,
      experienceMin: prefilters.experienceMin,
      experienceMax: prefilters.experienceMax,
    });
    diagnostics.prefilter_candidates_total += similar.length;
    const diverse = rerankBySpread(similar, Math.min(policy.effectiveMaxScoredPerJob, requested));
    diagnostics.similarity_candidates_total += diverse.length;

    let matchedThisJob = 0;
    for (const { id: candidateId, similarity } of diverse) {
      if (matches.length >= maxPairs) break;
      if (matchedThisJob >= policy.effectiveMaxScoredPerJob) break;
      if (similarity < SIMILARITY_THRESHOLD) continue;
      matches.push({ jobId: job.id, candidateId, similarity });
      diagnostics.matched_pairs_total++;
      ctx.recordsProcessed++;
      ctx.recordsCreated++;
      matchedThisJob++;
    }
  }

  diagnostics.considered_candidates = new Set(matches.map((m) => m.candidateId)).size;

  await logCompletion(admin, ctx, diagnostics, matches);
  return ctx;
}

async function logCompletion(
  admin: ReturnType<typeof createSupabaseAdmin>,
  ctx: AgentRunContext,
  diagnostics: FitScoreRunDiagnostics,
  matches: FitScoreMatchPair[],
) {
  ctx.meta = {
    ...(ctx.meta ?? {}),
    diagnostics,
    matches,
  };

  const status = ctx.errors.length > 0 ? "completed_with_errors" : "completed";
  const payload = {
    recordsProcessed: ctx.recordsProcessed,
    recordsCreated: ctx.recordsCreated,
    matchedPairs: diagnostics.matched_pairs_total,
    errorsCount: ctx.errors.length,
    errors: ctx.errors.slice(0, 10),
    durationMs: Date.now() - ctx.startedAt.getTime(),
    diagnostics,
  };

  // Close the "running" row opened at run start rather than appending a second
  // row: the old insert left one eternal running row per run, which the admin
  // Reliability watch counted as a stuck run forever ("Running >30m: 19").
  // Runs that THROW mid-way still leak their running row — acceptable for now,
  // since the daily leak came from this happy path, not from exceptions.
  const { data: updated } = await admin
    .from("agent_logs")
    .update({ status, payload })
    .eq("agent_name", ctx.agentName)
    .eq("run_id", ctx.runId)
    .eq("status", "running")
    .select("id");

  if (!updated || updated.length === 0) {
    await admin.from("agent_logs").insert({
      agent_name: ctx.agentName,
      run_id: ctx.runId,
      status,
      payload,
    });
  }
}
