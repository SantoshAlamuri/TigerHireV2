import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { enqueue } from "@/lib/jobs/queue";
import { generateJdForApprovedRequisition } from "@/lib/hiring-requests/generate-jd-from-request";
import { recordHiringOfferAuditEvent } from "@/lib/audit/hiring-offer-audit";
import { logger } from "@/lib/observability/logger";

/**
 * Platform admins operate the platform on behalf of customer orgs, so their
 * own requisition submissions skip the org approval workflow: the request is
 * marked approved immediately and background JD generation kicks off — the
 * same path a normal reviewer approval takes.
 *
 * Returns true when auto-approval was applied (caller should then skip
 * starting the review workflow and reviewer notifications).
 */
export async function autoApproveRequisitionForPlatformAdmin(
  admin: SupabaseClient,
  params: {
    hiringRequestId: string;
    organisationId: string;
    actorProfileId: string;
    actorRole: string | null;
    ipAddress?: string | null;
  },
): Promise<boolean> {
  const { hiringRequestId, organisationId, actorProfileId, actorRole, ipAddress } = params;

  const { data, error } = await admin
    .from("hiring_requests")
    .update({
      status: "approved",
      reviewed_by: actorProfileId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", hiringRequestId)
    .eq("status", "under_review")
    .select("id, assigned_job_id")
    .single();

  if (error || !data) {
    logger.error("Platform-admin auto-approval failed to update requisition", {
      hiring_request_id: hiringRequestId,
      error: String(error),
    });
    return false;
  }

  await recordHiringOfferAuditEvent({
    organisationId,
    entityType: "hiring_request",
    entityId: hiringRequestId,
    eventType: "HIRING_REQUEST_APPROVED",
    actorProfileId,
    actorRole,
    prevStatus: "under_review",
    newStatus: "approved",
    ipAddress: ipAddress ?? null,
    metadata: { auto_approved: "platform_admin" },
  });

  logger.info("Requisition auto-approved (platform admin submitter)", {
    hiring_request_id: hiringRequestId,
  });

  if (!data.assigned_job_id) {
    if (process.env.INNGEST_EVENT_KEY) {
      await enqueue("requisition-generate-jd", {
        hiringRequestId,
        actorProfileId,
      });
    } else {
      // Mirror the approve-path fallback: without Inngest the requisition
      // would sit at "approved" forever with no JD.
      after(async () => {
        try {
          await generateJdForApprovedRequisition(admin, {
            hiringRequestId,
            actorProfileId,
          });
        } catch (err) {
          logger.error("Auto-generate JD failed (platform-admin auto-approve fallback)", {
            hiring_request_id: hiringRequestId,
            error: String(err),
          });
        }
      });
    }
  }

  return true;
}
