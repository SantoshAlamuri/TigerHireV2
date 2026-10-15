import type { SupabaseClient } from "@supabase/supabase-js";
import { ConsentService } from "@/lib/services/ConsentService";
import { isEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/observability/logger";

/**
 * Capture consent via WhatsApp before Scout processes CV.
 * Blocks CV processing until YES received.
 *
 * Returns a structured result so callers can advance the conversation when
 * consent already exists (avoids the "no reply on first message" failure mode
 * where a returning candidate with consent on file would otherwise silently
 * receive nothing).
 */
export async function captureConsentViaWhatsApp(
  supabase: SupabaseClient,
  phone: string,
  triggerType: "self_cv_drop" | "referred_candidate",
): Promise<{
  alreadyConsented: boolean;
  sent: boolean;
  via: "text" | "template" | "none";
  error?: string;
}> {
  if (!(await isEnabled("consent_flow"))) {
    logger.warn("Consent flow disabled via feature flag — skipping");
    return { alreadyConsented: false, sent: false, via: "none", error: "consent_flow_disabled" };
  }

  const hasConsent = await ConsentService.hasRequiredConsent(supabase, phone);
  if (hasConsent) {
    logger.info("Consent already granted, skipping request", {
      message: phone,
    });
    return { alreadyConsented: true, sent: false, via: "none" };
  }

  const result = await ConsentService.captureConsentViaWhatsApp(supabase, phone, triggerType);
  return { alreadyConsented: false, ...result };
}

/**
 * Handle YES/NO reply to consent request.
 * On YES: bulk-insert consent records, unblock Scout.
 * On NO: opt-out, no candidate created.
 */
export async function recordConsentResponse(
  supabase: SupabaseClient,
  phone: string,
  response: string,
  messageId?: string,
): Promise<{ consented: boolean }> {
  const normalized = response.trim().toLowerCase();

  if (normalized === "yes" || normalized === "y") {
    return ConsentService.recordConsentResponse(supabase, phone, "yes", messageId);
  }

  if (normalized === "no" || normalized === "n") {
    return ConsentService.recordConsentResponse(supabase, phone, "no", messageId);
  }

  logger.info("Consent: unrecognized response, asking again", {
    message: phone,
  });
  return { consented: false };
}
