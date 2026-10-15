export type CandidateAcknowledgementEventType =
  | "cv_ingested"
  | "status_changed"
  | "referral_pre_consent";

export type CandidateAcknowledgementIngestionPath =
  | "logged_in_apply"
  | "public_apply"
  | "agency_single"
  | "agency_bulk"
  | "email_intake"
  | "referral_pre_consent";

export type CandidateAcknowledgementChannel = "email" | "whatsapp";

export type CandidateAcknowledgementOutcome =
  | "sent"
  | "suppressed_no_channel"
  | "suppressed_no_consent"
  | "suppressed_duplicate"
  | "suppressed_policy"
  | "failed_provider";

export interface CandidateAcknowledgementAttemptInput {
  applicationId?: string | null;
  candidateId: string;
  jobId?: string | null;
  eventType: CandidateAcknowledgementEventType;
  ingestionPath: CandidateAcknowledgementIngestionPath;
  channel: CandidateAcknowledgementChannel;
  templateVariant?: string | null;
  outcome: CandidateAcknowledgementOutcome;
  reasonCode?: string | null;
  reasonDetail?: string | null;
  provider?: string | null;
  providerMessageId?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey: string;
}

export interface CandidateAcknowledgementNotifierInput {
  applicationId?: string | null;
  candidateId: string;
  jobId?: string | null;
  eventType: CandidateAcknowledgementEventType;
  ingestionPath: CandidateAcknowledgementIngestionPath;
  candidateEmail?: string | null;
  candidatePhone?: string | null;
  whatsappConsent?: boolean | null;
  emailConsent?: boolean | null;
  templateVariant?: string | null;
  metadata?: Record<string, unknown>;
}
