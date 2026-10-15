import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

export type HiringOfferAuditEntityType = "hiring_request" | "offer" | "workflow_stage";

export type HiringOfferAuditChannel = "web" | "email_link" | "mobile" | "system" | "api";

export interface RecordHiringOfferAuditParams {
  organisationId: string;
  entityType: HiringOfferAuditEntityType;
  entityId: string;
  eventType: string;
  actorProfileId: string | null;
  actorRole: string | null;
  prevStatus: string | null;
  newStatus: string | null;
  decision?: string | null;
  comments?: string | null;
  documentVersion?: string | null;
  ipAddress?: string | null;
  channel?: HiringOfferAuditChannel;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only audit row for hiring requests / offers / workflow stages (BRD REQ-AUD / PRD F-04).
 * Failures are logged and swallowed so primary mutations still succeed.
 */
export async function recordHiringOfferAuditEvent(
  params: RecordHiringOfferAuditParams,
): Promise<void> {
  try {
    const admin = createSupabaseAdmin();
    const { error } = await admin.from("hiring_offer_audit_events").insert({
      organisation_id: params.organisationId,
      entity_type: params.entityType,
      entity_id: params.entityId,
      event_type: params.eventType,
      actor_profile_id: params.actorProfileId,
      actor_role: params.actorRole,
      prev_status: params.prevStatus,
      new_status: params.newStatus,
      decision: params.decision ?? null,
      comments: params.comments ?? null,
      document_version: params.documentVersion ?? null,
      ip_address: params.ipAddress ?? null,
      channel: params.channel ?? "web",
      metadata: params.metadata ?? {},
    });
    if (error) {
      logger.error("recordHiringOfferAuditEvent insert failed", {
        error: String(error.message),
        eventType: params.eventType,
        entityType: params.entityType,
        entityId: params.entityId,
      });
    }
  } catch (err) {
    logger.error("recordHiringOfferAuditEvent threw", {
      error: String(err),
      eventType: params.eventType,
    });
  }
}
