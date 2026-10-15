import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueue } from "@/lib/jobs/queue";
import { logger } from "@/lib/observability/logger";
import { selectActiveAgencyClientOrganisationIds } from "@/lib/agency/active-client-ids";

const MAX_ENQUEUE_PER_REQUEST = 100;

/** Candidates with pipeline or application rows on the agency's client orgs. */
export async function filterAgencyAccessibleCandidateIds(
  admin: SupabaseClient,
  candidateIds: string[],
  agencyOrganisationId: string,
): Promise<string[]> {
  const unique = [...new Set(candidateIds.filter(Boolean))];
  if (unique.length === 0) return [];

  const clientOrgIds = await selectActiveAgencyClientOrganisationIds(admin, agencyOrganisationId);
  if (clientOrgIds.length === 0) return [];

  const accessible = new Set<string>();

  const { data: pipelineRows } = await admin
    .from("pipeline_candidates")
    .select("candidate_id, jobs!inner(organisation_id)")
    .in("candidate_id", unique);

  for (const row of pipelineRows ?? []) {
    const r = row as {
      candidate_id: string;
      jobs: { organisation_id: string } | { organisation_id: string }[];
    };
    const job = Array.isArray(r.jobs) ? r.jobs[0] : r.jobs;
    if (job && clientOrgIds.includes(job.organisation_id)) {
      accessible.add(r.candidate_id);
    }
  }

  const { data: appRows } = await admin
    .from("applications")
    .select("candidate_id, jobs!inner(organisation_id)")
    .in("candidate_id", unique);

  for (const row of appRows ?? []) {
    const r = row as {
      candidate_id: string;
      jobs: { organisation_id: string } | { organisation_id: string }[];
    };
    const job = Array.isArray(r.jobs) ? r.jobs[0] : r.jobs;
    if (job && clientOrgIds.includes(job.organisation_id)) {
      accessible.add(r.candidate_id);
    }
  }

  return unique.filter((id) => accessible.has(id));
}

/** Candidates with pipeline or application rows on the caller's own organisation. */
export async function filterCompanyAccessibleCandidateIds(
  admin: SupabaseClient,
  candidateIds: string[],
  organisationId: string,
): Promise<string[]> {
  const unique = [...new Set(candidateIds.filter(Boolean))];
  if (unique.length === 0) return [];

  const accessible = new Set<string>();

  const [{ data: pipelineRows }, { data: appRows }] = await Promise.all([
    admin
      .from("pipeline_candidates")
      .select("candidate_id, jobs!inner(organisation_id)")
      .in("candidate_id", unique),
    admin
      .from("applications")
      .select("candidate_id, jobs!inner(organisation_id)")
      .in("candidate_id", unique),
  ]);

  for (const row of pipelineRows ?? []) {
    const r = row as {
      candidate_id: string;
      jobs: { organisation_id: string } | { organisation_id: string }[];
    };
    const job = Array.isArray(r.jobs) ? r.jobs[0] : r.jobs;
    if (job?.organisation_id === organisationId) {
      accessible.add(r.candidate_id);
    }
  }

  for (const row of appRows ?? []) {
    const r = row as {
      candidate_id: string;
      jobs: { organisation_id: string } | { organisation_id: string }[];
    };
    const job = Array.isArray(r.jobs) ? r.jobs[0] : r.jobs;
    if (job?.organisation_id === organisationId) {
      accessible.add(r.candidate_id);
    }
  }

  return unique.filter((id) => accessible.has(id));
}

export type EnqueueAgencyScoringContext = {
  organisationId: string;
  userId: string;
  /**
   * Set ONLY by the agency bulk-upload route. Carries through to the Inngest worker
   * so reprocessAgencyCandidate scores without requiring candidate-answered screening
   * questions (no candidate is present at bulk upload to answer them). All other
   * callers leave this unset, so they stay subject to the screening gate.
   */
  bypassScreeningGate?: boolean;
};

type EnqueueCandidateReprocessPayload = {
  candidateId: string;
  agencyOrganisationId: string;
  triggeredByUserId: string;
  clientOrgIds?: string[];
  bypassScreeningGate?: boolean;
};

async function enqueueCandidateReprocessJobs(
  candidateIds: string[],
  buildPayload: (candidateId: string) => EnqueueCandidateReprocessPayload,
  buildEventId: (candidateId: string) => string,
  logContext: { organisationId: string; channel: "agency" | "company" },
): Promise<{ queued: number; total: number }> {
  const unique = [...new Set(candidateIds.filter(Boolean))].slice(0, MAX_ENQUEUE_PER_REQUEST);
  if (unique.length === 0) {
    return { queued: 0, total: 0 };
  }

  let queued = 0;
  for (const candidateId of unique) {
    const result = await enqueue("agency-candidate-reprocess", buildPayload(candidateId), {
      id: buildEventId(candidateId),
    });
    if (result.id) {
      queued += 1;
    }
  }

  if (queued === 0 && unique.length > 0) {
    logger.info("Candidate scoring enqueue skipped (Inngest not configured or send failed)", {
      candidateCount: unique.length,
      organisationId: logContext.organisationId,
      channel: logContext.channel,
    });
  }

  return { queued, total: unique.length };
}

/**
 * Enqueue durable parse+score jobs (one Inngest event per candidate).
 * No-op when INNGEST_EVENT_KEY is unset — callers should fall back to sync reprocess API.
 */
export async function enqueueAgencyCandidateScoring(
  candidateIds: string[],
  ctx: EnqueueAgencyScoringContext,
): Promise<{ queued: number; total: number }> {
  return enqueueCandidateReprocessJobs(
    candidateIds,
    (candidateId) => ({
      candidateId,
      agencyOrganisationId: ctx.organisationId,
      triggeredByUserId: ctx.userId,
      ...(ctx.bypassScreeningGate ? { bypassScreeningGate: true } : {}),
    }),
    (candidateId) => `agency-reprocess:${candidateId}`,
    { organisationId: ctx.organisationId, channel: "agency" },
  );
}

/**
 * Company recruiter uploads: background parse+score scoped to the caller's own org.
 */
export async function enqueueCompanyCandidateScoring(
  candidateIds: string[],
  ctx: { organisationId: string; userId: string },
): Promise<{ queued: number; total: number }> {
  return enqueueCandidateReprocessJobs(
    candidateIds,
    (candidateId) => ({
      candidateId,
      agencyOrganisationId: ctx.organisationId,
      triggeredByUserId: ctx.userId,
      clientOrgIds: [ctx.organisationId],
    }),
    (candidateId) => `company-reprocess:${candidateId}`,
    { organisationId: ctx.organisationId, channel: "company" },
  );
}
