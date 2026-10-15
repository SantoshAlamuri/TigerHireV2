import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { resolvePhoneIdentity } from "@/lib/whatsapp/resolve-phone-identity";
import { logger } from "@/lib/observability/logger";
import type { WhatsAppSessionState } from "./sessions";

const RECRUITER_LIKE_ROLES = new Set([
  "recruiter",
  "leadership",
  "hiring_manager",
  "agency",
  "super_admin",
]);

const ONBOARDING_STATES: WhatsAppSessionState[] = [
  "new",
  "awaiting_consent",
  "consent_given",
  "cv_requested",
  "referral_phone_requested",
  "referral_complete",
  "business_inquiry",
];

/**
 * Block WhatsApp automation for org users who are not also candidates (same phone on profiles vs candidates).
 */
export async function shouldSilenceWhatsAppForPhone(
  phone: string,
  sessionState: WhatsAppSessionState,
): Promise<boolean> {
  if (ONBOARDING_STATES.includes(sessionState)) return false;

  const supabase = createSupabaseAdmin();
  const normalized = phone.replace(/\D/g, "");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("phone", normalized)
    .maybeSingle();

  if (!profile?.role || !RECRUITER_LIKE_ROLES.has(profile.role as string)) {
    return false;
  }

  // Canonical resolution — was .maybeSingle() which threw when the recruiter's
  // phone also had multiple candidate rows.
  const identity = await resolvePhoneIdentity(supabase, normalized);
  if (identity.candidateId) return false;

  logger.info("WhatsApp: silenced message for recruiter profile without candidate row", {
    session_state: sessionState,
    phoneLen: normalized.length,
  });
  return true;
}
