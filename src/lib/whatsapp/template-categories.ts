/**
 * Meta template categories for outbound gating.
 * New/cold numbers: UTILITY (and AUTHENTICATION) only until `ConsentRepository` shows full consent.
 */
export type WhatsAppTemplateCategory = "UTILITY" | "MARKETING" | "AUTHENTICATION";

/** Templates that must not be sent until the user has granted required consent. */
const MARKETING_TEMPLATE_NAMES = new Set<string>([
  "screening_questions_v6",
  "th_referral_drive_urgent",
  "th_referral_drive_multi",
  "tigerhire_consent_v3_with_bonus",
  "th_referral_program_invite",
  "tigerhire_employee_invite_v2",
  "th_reengagement_v2",
  "th_no_match_subscribed_v2",
  "tigerhire_referral_v2",
  "tigerhire_session_expired_v2",
  "tigerhire_fitscore_v2",
  "tigerhire_consent_v2",
  "th_new_role_alert",
  "th_no_match_subscribed",
  "th_preference_matches",
  "tigerhire_referral_v1",
  "th_reengagement",
  "th_recruiter_new_candidates",
  "th_profile_incomplete",
  "th_sourcing",
  "th_referral_drive",
  "waitlist_confirmation",
  "candidate_contact_unlocked",
  "candidate_match_alert",
  "tigerhire_session_expired",
  "tigerhire_employee_invite_v1",
  "tigerhire_fitscore_v1",
]);

const AUTHENTICATION_TEMPLATE_NAMES = new Set<string>(["th_referrer_otp"]);

export function getWhatsAppTemplateCategory(templateName: string): WhatsAppTemplateCategory {
  const name = templateName.trim();
  if (AUTHENTICATION_TEMPLATE_NAMES.has(name)) return "AUTHENTICATION";
  if (MARKETING_TEMPLATE_NAMES.has(name)) return "MARKETING";
  return "UTILITY";
}

export function isMarketingWhatsAppTemplate(templateName: string): boolean {
  return getWhatsAppTemplateCategory(templateName) === "MARKETING";
}
