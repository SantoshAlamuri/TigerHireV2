import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

export type RecordOfferBillingParams = {
  organisationId: string;
  jobId: string;
  candidateId: string;
  applicationId: string | null;
  ctcValue: number | null;
  offerId?: string | null;
};

/**
 * Inserts a pending placement-fee billing row when an offer is accepted (idempotent per application while pending).
 */
export async function recordOfferAcceptedBillingEvent(
  admin: SupabaseClient,
  params: RecordOfferBillingParams,
): Promise<void> {
  if (!params.applicationId) {
    logger.warn("recordOfferAcceptedBillingEvent: missing application_id", {
      jobId: params.jobId,
      candidateId: params.candidateId,
    });
    return;
  }

  const { error } = await admin.from("placement_fee_billing_events").insert({
    organisation_id: params.organisationId,
    job_id: params.jobId,
    candidate_id: params.candidateId,
    application_id: params.applicationId,
    offer_id: params.offerId ?? null,
    offer_accepted_at: new Date().toISOString(),
    ctc_value: params.ctcValue,
    billing_status: "pending",
  });

  if (error) {
    if (error.code === "23505") {
      return;
    }
    logger.error("recordOfferAcceptedBillingEvent: insert failed", {
      message: error.message,
      code: error.code,
      jobId: params.jobId,
    });
  }
}
