export type ReferredCandidateReachResult = {
  reached: boolean;
  via?: string;
  error?: string;
  templateName?: string;
};

export type ReferralRateLimitedReason =
  | "daily_cap_exceeded"
  | "duplicate_target_phone"
  | "duplicate_resend_outreach"
  | "self_referral_blocked";

export const REFERRAL_CONSENT_FLAG = "whatsapp_referral_consent_v2";
export const REFERRAL_DAILY_WINDOW_SECS = 24 * 60 * 60;
