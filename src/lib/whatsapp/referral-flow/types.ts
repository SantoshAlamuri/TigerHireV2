import type { WhatsAppSessionState } from "../sessions";

export type ReferralDraft = {
  candidate_name: string | null;
  candidate_phone: string | null;
  candidate_cv_media_id: string | null;
  job_id: string | null;
  location: string | null;
};

export type ReferralCollectField = "candidate_name" | "candidate_phone" | "job_id" | "location";

export type ReferrerProfile = {
  id: string;
  full_name: string | null;
  role: string | null;
  organisation_id: string | null;
};

export type ReferralInboundMessage = {
  from?: string;
  type: string;
  text?: { body?: string };
  document?: { id?: string; filename?: string; mime_type?: string };
};

export type ApplyIntentContext = {
  sessionState?: WhatsAppSessionState;
  context?: Record<string, unknown>;
};

export type RegisteredReferralInboundResult = { handled: boolean };
