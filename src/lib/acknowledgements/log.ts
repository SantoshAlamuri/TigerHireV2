import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import type { CandidateAcknowledgementAttemptInput } from "@/lib/acknowledgements/types";

/**
 * Writes acknowledgement attempt outcomes for deterministic auditing.
 * Idempotent by dedupe_key.
 */
export async function logCandidateAcknowledgementAttempt(
  input: CandidateAcknowledgementAttemptInput,
): Promise<void> {
  try {
    const admin = createSupabaseAdmin();
    const { error } = await admin.from("candidate_acknowledgement_attempts").upsert(
      {
        application_id: input.applicationId ?? null,
        candidate_id: input.candidateId,
        job_id: input.jobId ?? null,
        event_type: input.eventType,
        ingestion_path: input.ingestionPath,
        channel: input.channel,
        template_variant: input.templateVariant ?? null,
        outcome: input.outcome,
        reason_code: input.reasonCode ?? null,
        reason_detail: input.reasonDetail ?? null,
        provider: input.provider ?? null,
        provider_message_id: input.providerMessageId ?? null,
        metadata: (input.metadata ?? {}) as object,
        dedupe_key: input.dedupeKey,
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );

    if (error) {
      logger.warn("Failed to write candidate acknowledgement attempt", {
        dedupeKey: input.dedupeKey,
        message: error.message,
        code: error.code,
      });
    }
  } catch (err) {
    logger.warn("Candidate acknowledgement attempt logging failed", {
      dedupeKey: input.dedupeKey,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
