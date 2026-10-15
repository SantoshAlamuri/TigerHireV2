import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { enqueue } from "@/lib/jobs/queue";
import { logger } from "@/lib/observability/logger";

/**
 * Self-heal for "ghost" profiles: a CV is stored but was never read into the
 * candidate row (no cv_parsed_at), so the recruiter sees "—" everywhere.
 *
 * Triggered from GET /api/candidates/[id] — i.e. the moment anyone opens the
 * profile — it claims the row and queues the durable `cv-parse-retry` job.
 * No button, no manual reprocess. Cost-safe by construction:
 *   - one claim wins (conditional UPDATE … RETURNING), so N page loads = 1 parse
 *   - `failed` rows are never retried here (the parser marks deterministic
 *     rejections failed and the retry worker throws NonRetriableError)
 *   - a `processing` row is only re-queued once it is provably stale
 *
 * 2026-09-17: prod candidate 56692e3c sat `pending` for 12 hours with a stored
 * PDF while the recruiter's "Re-read" clicks never reached the server.
 */

const MIN_AGE_MS = 2 * 60 * 1000; // an apply's inline parse may still be running
export const STALE_PROCESSING_MS = 30 * 60 * 1000; // a run older than this is dead

export type SelfHealCandidateRow = {
  id: string;
  resume_url?: string | null;
  cv_url?: string | null;
  cv_parsed_at?: string | null;
  processing_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SelfHealResult = { queued: boolean; reason: string };

function ms(value: string | null | undefined): number {
  const t = value ? Date.parse(value) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/** Pure decision: should this row be sent back through the parser? */
export function selfHealEligibility(
  row: SelfHealCandidateRow,
  now: number = Date.now(),
): { eligible: boolean; reason: string } {
  const hasCv = Boolean(row.resume_url?.trim() || row.cv_url?.trim());
  if (!hasCv) return { eligible: false, reason: "no_cv" };
  if (row.cv_parsed_at) return { eligible: false, reason: "already_parsed" };
  const status = row.processing_status ?? "pending";
  if (status === "processing") {
    if (now - ms(row.updated_at) < STALE_PROCESSING_MS) {
      return { eligible: false, reason: "in_flight" };
    }
    if (now - ms(row.created_at) < MIN_AGE_MS) return { eligible: false, reason: "too_young" };
    return { eligible: true, reason: "stale_processing" };
  }
  if (status !== "pending") return { eligible: false, reason: `status_${status}` };
  if (now - ms(row.created_at) < MIN_AGE_MS) return { eligible: false, reason: "too_young" };
  return { eligible: true, reason: "pending_unparsed" };
}

type JobContext = { jobId: string; organisationId: string };

function orgFromEmbed(jobs: unknown): string | null {
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  const org = (job as { organisation_id?: string } | null | undefined)?.organisation_id;
  return typeof org === "string" && org ? org : null;
}

async function findJobContext(
  admin: SupabaseClient,
  candidateId: string,
): Promise<JobContext | null> {
  for (const table of ["applications", "pipeline_candidates"] as const) {
    const { data } = await admin
      .from(table)
      .select("job_id, jobs!inner(organisation_id)")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = data as { job_id?: string; jobs?: unknown } | null;
    const organisationId = orgFromEmbed(row?.jobs);
    if (row?.job_id && organisationId) return { jobId: row.job_id, organisationId };
  }
  return null;
}

export async function maybeSelfHealCandidateParse(
  row: SelfHealCandidateRow,
  deps: { admin?: SupabaseClient; now?: number } = {},
): Promise<SelfHealResult> {
  const now = deps.now ?? Date.now();
  const check = selfHealEligibility(row, now);
  if (!check.eligible) return { queued: false, reason: check.reason };

  try {
    const admin = deps.admin ?? createSupabaseAdmin();
    const context = await findJobContext(admin, row.id);
    if (!context) {
      logger.warn("candidate_profile_self_heal_skipped", {
        candidateId: row.id,
        reason: "no_job_context",
      });
      return { queued: false, reason: "no_job_context" };
    }

    // Claim the row. Only the first concurrent page load gets rows back.
    const staleBefore = new Date(now - STALE_PROCESSING_MS).toISOString();
    const { data: claimed } = await admin
      .from("candidates")
      .update({ processing_status: "processing", updated_at: new Date(now).toISOString() })
      .eq("id", row.id)
      .is("cv_parsed_at", null)
      .or(
        `processing_status.eq.pending,and(processing_status.eq.processing,updated_at.lt.${staleBefore})`,
      )
      .select("id");
    if (!claimed || (claimed as unknown[]).length === 0) {
      return { queued: false, reason: "lost_race" };
    }

    const bucket = Math.floor(now / STALE_PROCESSING_MS);
    const { id: eventId } = await enqueue(
      "cv-parse-retry",
      {
        candidateId: row.id,
        jobId: context.jobId,
        organisationId: context.organisationId,
        source: "profile_self_heal",
      },
      { id: `cv-parse-self-heal:${row.id}:${bucket}` },
    );

    if (!eventId) {
      // No queue in this environment: release the claim so the manual path still works.
      await admin
        .from("candidates")
        .update({ processing_status: "pending" })
        .eq("id", row.id)
        .eq("processing_status", "processing");
      logger.warn("candidate_profile_self_heal_skipped", {
        candidateId: row.id,
        reason: "queue_unavailable",
      });
      return { queued: false, reason: "queue_unavailable" };
    }

    logger.warn("candidate_profile_self_heal_enqueued", {
      candidateId: row.id,
      jobId: context.jobId,
      organisationId: context.organisationId,
      reason: check.reason,
      ageMinutes: Math.round((now - ms(row.created_at)) / 60_000),
    });
    return { queued: true, reason: check.reason };
  } catch (err) {
    logger.warn("candidate_profile_self_heal_failed", {
      candidateId: row.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return { queued: false, reason: "error" };
  }
}
