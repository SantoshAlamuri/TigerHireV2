export const ACK_FLAG_KEYS = {
  notifierEnabled: "ack_notifier_enabled",
  channelEmailEnabled: "ack_email_channel_enabled",
  channelWhatsappEnabled: "ack_whatsapp_channel_enabled",
  pathLoggedInApplyEnabled: "ack_logged_in_apply_enabled",
  pathPublicApplyEnabled: "ack_public_apply_enabled",
  pathAgencySingleEnabled: "ack_agency_single_enabled",
  pathAgencyBulkEnabled: "ack_agency_bulk_enabled",
  pathEmailIntakeEnabled: "ack_email_intake_enabled",
  pathReferralPreConsentEnabled: "ack_referral_pre_consent_enabled",
} as const;

export type AckFlagKey = (typeof ACK_FLAG_KEYS)[keyof typeof ACK_FLAG_KEYS];
