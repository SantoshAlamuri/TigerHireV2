import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/services/notifications";
import { logger } from "@/lib/observability/logger";

/**
 * After a recruiter saves an offer as draft, notify the job hiring manager to review in-app.
 */
export async function notifyHiringManagerOfferDraft(
  admin: SupabaseClient,
  params: {
    organisationId: string;
    hiringManagerId: string | null | undefined;
    offerId: string;
    roleTitle: string;
    routeLog: string;
  },
): Promise<void> {
  const hm = params.hiringManagerId;
  if (!hm) {
    logger.info("notifyHiringManagerOfferDraft: no hiring_manager on job; skipping", {
      offerId: params.offerId,
      route: params.routeLog,
    });
    return;
  }

  try {
    await createNotification({
      userId: hm,
      type: "approval_needed",
      title: "Offer draft needs your approval",
      body: `A recruiter drafted an offer for ${params.roleTitle}. Review and approve in Offers before it goes to finance or is sent.`,
      link: "/company/offers",
      metadata: { offerId: params.offerId, kind: "offer_draft" },
    });
  } catch (e) {
    logger.warn("notifyHiringManagerOfferDraft: notification failed", {
      error: String(e),
      offerId: params.offerId,
      route: params.routeLog,
    });
  }
}
