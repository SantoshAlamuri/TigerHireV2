import type { RoleCategory } from "@/lib/jobs/types";

export const SCREENING_MODES = ["voice", "whatsapp", "manual", "none"] as const;
export type ScreeningMode = (typeof SCREENING_MODES)[number];

export const SCREENING_DEFAULT_MODES = ["off", "whatsapp", "voice"] as const;
export type ScreeningDefaultMode = (typeof SCREENING_DEFAULT_MODES)[number];

export const SCREENING_STATUSES = [
  "queued",
  "awaiting_consent",
  "in_progress",
  "completed",
  "no_response",
  "failed",
  "cancelled",
  "skipped",
] as const;
export type ScreeningStatus = (typeof SCREENING_STATUSES)[number];

export const SCREENING_TERMINAL_STATUSES = [
  "completed",
  "no_response",
  "failed",
  "cancelled",
  "skipped",
] as const;
export type ScreeningTerminalStatus = (typeof SCREENING_TERMINAL_STATUSES)[number];

export const SCREENING_RECOMMENDATIONS = ["shortlist", "reject", "review", "no_data"] as const;
export type ScreeningRecommendation = (typeof SCREENING_RECOMMENDATIONS)[number];

export const SCREENING_SIGNAL_LEVELS = ["strong", "moderate", "weak", "not_assessed"] as const;
export type ScreeningSignalLevel = (typeof SCREENING_SIGNAL_LEVELS)[number];

export const SCREENING_FLUENCY_LEVELS = ["high", "medium", "low", "not_assessed"] as const;
export type ScreeningFluencyLevel = (typeof SCREENING_FLUENCY_LEVELS)[number];

export const SCREENING_LOCATION_PREFERENCES = ["onsite", "hybrid", "remote", "flexible"] as const;
export type ScreeningLocationPreference = (typeof SCREENING_LOCATION_PREFERENCES)[number];

export const SCREENING_TRIGGERED_BY = ["auto", "recruiter_manual"] as const;
export type ScreeningTriggeredBy = (typeof SCREENING_TRIGGERED_BY)[number];

export type ScreeningSummary = {
  notice_period_days: number | null;
  current_ctc_lakhs: number | null;
  expected_ctc_lakhs: number | null;
  location_preference: ScreeningLocationPreference | null;
  english_fluency: ScreeningFluencyLevel;
  technical_depth_signal: ScreeningSignalLevel;
  communication_clarity: ScreeningSignalLevel;
  confidence_signal: ScreeningFluencyLevel;
  red_flags: string[];
  positive_signals: string[];
  candidate_questions_raised: string[];
  recommendation: ScreeningRecommendation;
  recommendation_reason: string;
  key_quote: string;
};

export type ScreeningJob = {
  id: string;
  organisation_id: string;
  candidate_id: string;
  req_id: string;
  mode: ScreeningMode;
  status: ScreeningStatus;
  bolna_call_id: string | null;
  audio_url: string | null;
  duration_seconds: number | null;
  whatsapp_thread_id: string | null;
  whatsapp_message_count: number | null;
  transcript_url: string | null;
  summary_json: ScreeningSummary | null;
  recommendation: ScreeningRecommendation | null;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  last_activity_at: string | null;
  nudge_sent_at: string | null;
  created_at: string;
  updated_at: string;
  billable: boolean;
  billed_at: string | null;
  cost_inr: number | null;
  charge_inr: number | null;
  triggered_by: ScreeningTriggeredBy | null;
  overridden_from_mode: ScreeningMode | null;
  recruiter_id: string | null;
};

export type ScreeningJobInsert = Pick<
  ScreeningJob,
  "organisation_id" | "candidate_id" | "req_id" | "mode" | "status"
> &
  Partial<
    Pick<
      ScreeningJob,
      | "scheduled_at"
      | "started_at"
      | "ended_at"
      | "last_activity_at"
      | "triggered_by"
      | "overridden_from_mode"
      | "recruiter_id"
      | "whatsapp_thread_id"
      | "bolna_call_id"
      | "billable"
      | "charge_inr"
      | "cost_inr"
    >
  >;

export type ScreeningJobUpdate = Partial<
  Omit<
    ScreeningJob,
    "id" | "organisation_id" | "candidate_id" | "req_id" | "created_at" | "updated_at"
  >
>;

export type ScreeningTenantSettings = {
  screening_default_mode: ScreeningDefaultMode;
  screening_fitscore_threshold: number;
  voice_screening_enabled: boolean;
  voice_screening_monthly_cap_inr: number | null;
};

export const SCREENING_SCRIPT_ROLE_CATEGORIES = [
  "backend",
  "frontend",
  "data_ml",
  "product",
  "devops",
] as const;
export type ScreeningScriptRoleCategory = (typeof SCREENING_SCRIPT_ROLE_CATEGORIES)[number];

export type WhatsAppQuestion = {
  id: string;
  text: string;
  expected_format?: "number" | "yes_no" | "free_text" | "enum";
  enum_values?: string[];
  required: boolean;
  follow_up_if?: { matches: string | RegExp; ask: string };
};

export type WhatsAppScript = {
  role_category: ScreeningScriptRoleCategory;
  version: string;
  greeting: string;
  consent_question: string;
  questions: WhatsAppQuestion[];
  closing: string;
};

export type VoiceScript = {
  role_category: ScreeningScriptRoleCategory;
  version: string;
  system_prompt: string;
  fallback_questions: string[];
  max_duration_seconds: number;
};

export type ScreeningPromptContext = {
  role_title: string;
  role_category: RoleCategory | null;
  jd_summary: string;
  transcript: string;
  mode: ScreeningMode;
};
